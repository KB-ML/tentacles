import {
  createEvent,
  createNode,
  createStore,
  type EventCallable,
  type Store,
  withRegion,
} from "effector";
import type { ViewContractChain } from "../contract";
import { BaseContractChain, PropsContractChainImpl } from "../contract";
import type { PropDescriptor } from "../contract/prop-field-builder";
import type { StoreMeta } from "../contract/types";
import type {
  AnyPropMeta,
  PropEventMeta,
  PropStoreMeta,
} from "../contract/types/props-contract-chain";
import { TentaclesError } from "../shared/tentacles-error";
import { createViewModelUnits } from "./create-view-model-units";
import type { ExtractVMProps, ViewModelContext, ViewModelStores } from "./types";
import { ViewModelLifecycle } from "./view-model-lifecycle";

export interface ViewModelInstance<Shape> {
  readonly shape: Shape;
  readonly lifecycle: ViewModelLifecycle;
  readonly id: number;
}

type FactoryDefaults = Record<string, (data: Record<string, unknown>) => unknown>;

/**
 * Dual-entry prop input: each prop is either a raw value or a matching
 * effector unit. Store props accept `T | Store<T>`. Event props accept
 * `EventCallable<T> | ((payload: T) => void)`.
 */
type PropValue<P> =
  P extends PropStoreMeta<infer T, any>
    ? T | Store<T>
    : P extends PropEventMeta<infer T, any>
      ? EventCallable<T> | ((payload: T) => void)
      : never;

type RequiredKeys<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K] extends PropStoreMeta<any, false> | PropEventMeta<any, false>
    ? K
    : never;
}[keyof Props];

type OptionalKeys<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K] extends PropStoreMeta<any, true> | PropEventMeta<any, true>
    ? K
    : never;
}[keyof Props];

export type CreateInput<Props extends Record<string, AnyPropMeta>> = {
  [K in RequiredKeys<Props>]: PropValue<Props[K]>;
} & {
  [K in OptionalKeys<Props>]?: PropValue<Props[K]>;
};

// Region currently active during a .create() call — used to nest children.
let activeRegion: ReturnType<typeof createNode> | undefined;

// NOTE on class members: fields are intentionally NOT marked `private`.
// TypeScript brands classes with private fields nominally per declaration
// site. Combined with ViewModelDefinition's phantom generics (Stores,
// Events, Derived, Props — none of which appear in the class body), this
// triggers the "Types have separate declarations of a private property"
// error when assigning a concretely-parameterized instance to one with
// `any` in the phantom slots (e.g. inside framework adapters like
// `useView(def: ViewModelDefinition<Shape, any, any, any, any>)`). Using
// `_`-prefixed readonly fields keeps them visibly internal without the
// nominal brand.
export class ViewModelDefinition<
  Shape = Record<string, unknown>,
  Stores extends Record<string, StoreMeta> = Record<string, StoreMeta>,
  Events extends Record<string, unknown> = Record<string, unknown>,
  Derived extends Record<string, unknown> = Record<string, unknown>,
  Props extends Record<string, AnyPropMeta> = Record<string, AnyPropMeta>,
> {
  static _nextId = 0;

  constructor(
    readonly _contract: Record<string, Record<string, unknown>>,
    readonly _factoryDefaults: FactoryDefaults | undefined,
    readonly _propDescriptors: Record<string, PropDescriptor>,
    readonly _userFn:
      | ((stores: Record<string, unknown>, ctx: Record<string, unknown>) => Shape)
      | undefined,
    readonly _modelName: string,
    readonly _sidRoot?: string,
    readonly _baseFieldNames?: ReadonlySet<string>,
  ) {}

  instantiate(propUnits?: Record<string, unknown>): ViewModelInstance<Shape> {
    const id = ViewModelDefinition._nextId++;
    const parentRegion = activeRegion;
    const regionMeta: Record<string, unknown> = {};
    if (this._sidRoot) regionMeta.sidRoot = this._sidRoot;
    if (parentRegion) regionMeta.parent = parentRegion;
    const region = createNode({ meta: regionMeta });
    const lifecycle = new ViewModelLifecycle(region);

    const parentSegment = parentRegion
      ? ((parentRegion as unknown as { meta?: { sidPath?: string } }).meta?.sidPath ?? "")
      : "";
    const sidPath = parentSegment
      ? `${parentSegment}:${this._modelName}:${id}`
      : `${this._modelName}:${id}`;
    (region as unknown as { meta: { sidPath: string } }).meta.sidPath = sidPath;

    const makeSid = (field: string) => `tentacles:vm:${sidPath}:${field}`;

    let shape!: Shape;

    const prevRegion = activeRegion;
    activeRegion = region;
    try {
      withRegion(region, () => {
        const stores = createViewModelUnits(this._contract, makeSid, this._factoryDefaults);

        const normalizedProps = this.normalizeProps(propUnits);

        if (this._userFn) {
          shape = this._userFn(stores, {
            mounted: lifecycle.mounted,
            unmounted: lifecycle.unmounted,
            $mounted: lifecycle.$mounted,
            props: normalizedProps,
          });
        } else {
          shape = stores as Shape;
        }
      });
    } finally {
      activeRegion = prevRegion;
    }

    return { shape, lifecycle, id };
  }

  /**
   * Compose this view model as a child inside another VM's `fn`.
   *
   * Called inside a parent's `fn`, the child is created under the parent's
   * region — lifecycle cascades automatically. Props accept either matching
   * effector units (direct use) or raw values (auto-wrapped into stores).
   *
   * Called outside any active region (e.g. directly from a framework adapter
   * after wrapping raw props), the returned instance lives at the top level.
   */
  create(props?: CreateInput<Props>, _config?: { name?: string }): Shape {
    const instance = this.instantiate(props as Record<string, unknown> | undefined);
    return instance.shape;
  }

  normalizeProps(raw: Record<string, unknown> | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const source = raw ?? {};
    for (const [key, desc] of Object.entries(this._propDescriptors)) {
      const value = source[key];
      if (desc.kind === "event") {
        // Event props keep their raw name — `ctx.props.onClose`
        if (isEvent(value) || isEffect(value)) {
          out[key] = value;
        } else {
          // Raw callback (or undefined for optional event prop) — wrap in an
          // event that forwards to the current value.
          const ev = createEvent<unknown>();
          if (typeof value === "function") {
            ev.watch(value as (p: unknown) => void);
          }
          out[key] = ev;
        }
      } else {
        // Store props are exposed under a `$`-prefixed key — `ctx.props.$totalCount`
        const outKey = `$${key}`;
        if (isStore(value)) {
          out[outKey] = value;
        } else {
          out[outKey] = createStore<unknown>(value, { skipVoid: false });
        }
      }
    }
    return out;
  }

  extend<
    NewStores extends Record<string, StoreMeta> = {},
    NewEvents extends Record<string, unknown> = {},
    NewDerived extends Record<string, unknown> = {},
    NewProps extends Record<string, AnyPropMeta> = {},
    NewShape = Shape,
  >(config: {
    name: string;
    contract?: ViewContractChain<NewStores, NewEvents, NewDerived>;
    props?: PropsContractChainImpl<NewProps>;
    fn?: (
      stores: ViewModelStores<NewStores, NewEvents, NewDerived>,
      ctx: ViewModelContext<ExtractVMProps<Props & NewProps>> & { base: Shape },
    ) => NewShape;
  }): ViewModelDefinition<
    NewShape,
    Stores & NewStores,
    Events & NewEvents,
    Derived & NewDerived,
    Props & NewProps
  > {
    if (config.contract !== undefined && !(config.contract instanceof BaseContractChain)) {
      throw new TentaclesError(
        "ViewModelDefinition.extend: `contract` must be a pre-built ViewContractChain value",
      );
    }
    if (config.props !== undefined && !(config.props instanceof PropsContractChainImpl)) {
      throw new TentaclesError(
        "ViewModelDefinition.extend: `props` must be a pre-built PropsContractChain value",
      );
    }

    // 1. Collect new contract fields
    const newFields = config.contract ? config.contract.getFields() : {};
    const newFactoryDefaults = config.contract ? config.contract.getFactoryDefaults() : {};

    // 2. Merge contract fields (collision check)
    const mergedFields: Record<string, Record<string, unknown>> = { ...this._contract };
    for (const key of Object.keys(newFields)) {
      if (key in mergedFields) {
        throw new TentaclesError(
          `ViewModelDefinition.extend() collision: field "${key}" already exists in base`,
        );
      }
      const field = newFields[key];
      if (field !== undefined) mergedFields[key] = field;
    }

    // 3. Merge factory defaults
    const mergedDefaults: FactoryDefaults = {
      ...(this._factoryDefaults ?? {}),
      ...newFactoryDefaults,
    };

    // 4. Merge prop descriptors (collision check)
    const newPropDescriptors = config.props ? config.props.getDescriptors() : {};
    for (const key of Object.keys(newPropDescriptors)) {
      if (key in this._propDescriptors) {
        throw new TentaclesError(
          `ViewModelDefinition.extend() collision: prop "${key}" already exists in base`,
        );
      }
    }
    const mergedPropDescriptors: Record<string, PropDescriptor> = {
      ...this._propDescriptors,
      ...newPropDescriptors,
    };

    // 5. Build chained fn
    const baseFieldNameSet = new Set(Object.keys(this._contract));
    const baseFn = this._userFn;
    const extFn = config.fn;

    type ChainedFn = (stores: Record<string, unknown>, ctx: Record<string, unknown>) => NewShape;

    let chainedFn: ChainedFn | undefined;

    if (extFn) {
      chainedFn = (allStores: Record<string, unknown>, ctx: Record<string, unknown>) => {
        const baseStores: Record<string, unknown> = {};
        const newStores: Record<string, unknown> = {};
        for (const key of Object.keys(allStores)) {
          const bareKey = key.startsWith("$") ? key.slice(1) : key;
          if (baseFieldNameSet.has(bareKey) || baseFieldNameSet.has(key)) {
            baseStores[key] = allStores[key];
          } else {
            newStores[key] = allStores[key];
          }
        }

        const baseShape = baseFn ? baseFn(baseStores, ctx) : (baseStores as Shape);
        return (extFn as Function)(newStores, { ...ctx, base: baseShape }) as NewShape;
      };
    } else if (baseFn) {
      chainedFn = baseFn as Function as ChainedFn;
    }

    // 6. Return new ViewModelDefinition
    return new ViewModelDefinition(
      mergedFields,
      Object.keys(mergedDefaults).length > 0 ? mergedDefaults : undefined,
      mergedPropDescriptors,
      chainedFn,
      config.name,
      this._sidRoot,
      baseFieldNameSet,
    ) as ViewModelDefinition<
      NewShape,
      Stores & NewStores,
      Events & NewEvents,
      Derived & NewDerived,
      Props & NewProps
    >;
  }

  getContract(): Record<string, Record<string, unknown>> {
    return this._contract;
  }

  getPropDescriptors(): Record<string, PropDescriptor> {
    return this._propDescriptors;
  }
}

function isStore(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "getState" in (value as object) &&
    typeof (value as { getState?: unknown }).getState === "function"
  );
}

function isEvent(value: unknown): boolean {
  if (!value) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "event";
}

function isEffect(value: unknown): boolean {
  if (!value) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "effect";
}
