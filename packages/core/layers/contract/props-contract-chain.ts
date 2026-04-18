import { TentaclesError } from "../shared/tentacles-error";
import { registerChainOps } from "./contract-chain-strategy";
import {
  createPropEventFieldBuilder,
  createPropStoreFieldBuilder,
  type PropDescriptor,
} from "./prop-field-builder";
import type {
  AnyPropMeta,
  FreshPropName,
  PropEventFieldBuilder,
  PropEventMeta,
  PropEventTyped,
  PropStoreFieldBuilder,
  PropStoreMeta,
  PropStoreTyped,
} from "./types/props-contract-chain";

// Phantom key for type-level access
export declare const _pcProps: unique symbol;

/**
 * Standalone props contract chain.
 *
 * Declares reusable prop shapes that can be passed to `createViewModel`
 * (or form view models) as the `props` field. Props contracts are
 * intentionally *not* descendants of `BaseContractChain` — props are
 * external inputs, not owned reactive state, so sharing factory-defaults/
 * SIDs/resetOn wouldn't make sense.
 *
 * Two kinds of props are supported:
 *
 * - `.store("name", s => s<T>())` — reactive value passed down from the
 *   caller. The VM sees it as `Store<T>` in `ctx.props`.
 * - `.event("name", e => e<T>())` — callback invoked by the VM. The VM
 *   sees it as `EventCallable<T>` in `ctx.props`; the payload type is `T`.
 *
 * Both builders are callable (`s<T>()` / `e<T>()`) with a chainable
 * `.optional()` method to mark the prop as optional.
 */
export class PropsContractChainImpl<Props extends Record<string, AnyPropMeta> = {}> {
  // Phantom property for type-level access (never exists at runtime)
  declare readonly [_pcProps]: Props;

  private readonly descriptors: Record<string, PropDescriptor> = {};

  constructor() {
    registerChainOps(this, {
      entityNames: () => Object.keys(this.descriptors),
      createEmpty: () => new PropsContractChainImpl(),

      copyEntities: (source, names) => {
        const src = (source as PropsContractChainImpl).getDescriptors();
        for (const key of names) {
          const desc = src[key];
          if (desc) this.descriptors[key] = desc;
        }
      },

      copyAll: (source) => {
        const src = (source as PropsContractChainImpl).getDescriptors();
        for (const [key, desc] of Object.entries(src)) {
          this.descriptors[key] = desc;
        }
      },

      applyPartial: (source) => {
        const src = (source as PropsContractChainImpl).getDescriptors();
        for (const [key, desc] of Object.entries(src)) {
          this.descriptors[key] = { ...desc, isOptional: true };
        }
      },

      applyRequired: (source) => {
        const src = (source as PropsContractChainImpl).getDescriptors();
        for (const [key, desc] of Object.entries(src)) {
          this.descriptors[key] = { ...desc, isOptional: false };
        }
      },

      validateRefs: () => {},
    });
  }

  /**
   * Declare a store prop — a reactive value passed down from the caller.
   * Inside the VM `fn`, `ctx.props.<name>` is a `Store<T>`.
   */
  store<K extends string, T, Opt extends boolean = false>(
    name: FreshPropName<K, Props>,
    builder: (s: PropStoreFieldBuilder) => PropStoreTyped<T, Opt>,
  ): PropsContractChainImpl<Props & Record<K, PropStoreMeta<T, Opt>>> {
    if ((name as string) in this.descriptors) {
      throw new TentaclesError(`PropsContractChain: prop "${name as string}" is already declared`);
    }
    const s = createPropStoreFieldBuilder();
    const result = (builder as Function)(s);
    this.descriptors[name as string] = (
      result as { toDescriptor(): PropDescriptor }
    ).toDescriptor();
    return this as unknown as PropsContractChainImpl<Props & Record<K, PropStoreMeta<T, Opt>>>;
  }

  /**
   * Declare an event prop — a callback invoked by the VM. Inside the VM
   * `fn`, `ctx.props.<name>` is an `EventCallable<T>`; the payload type is
   * `T`. Framework adapters wire event props through a stable ref so the
   * latest callback is always called.
   */
  event<K extends string, T, Opt extends boolean = false>(
    name: FreshPropName<K, Props>,
    builder: (e: PropEventFieldBuilder) => PropEventTyped<T, Opt>,
  ): PropsContractChainImpl<Props & Record<K, PropEventMeta<T, Opt>>> {
    if ((name as string) in this.descriptors) {
      throw new TentaclesError(`PropsContractChain: prop "${name as string}" is already declared`);
    }
    const e = createPropEventFieldBuilder();
    const result = (builder as Function)(e);
    this.descriptors[name as string] = (
      result as { toDescriptor(): PropDescriptor }
    ).toDescriptor();
    return this as unknown as PropsContractChainImpl<Props & Record<K, PropEventMeta<T, Opt>>>;
  }

  /**
   * Merge another props contract into this one. Throws on name collisions.
   */
  merge<Other extends PropsContractChainImpl<any>>(
    other: Other,
  ): PropsContractChainImpl<Props & InferPropsFromChain<Other>> {
    const sourceDescriptors = other.getDescriptors();
    for (const key of Object.keys(sourceDescriptors)) {
      if (key in this.descriptors) {
        throw new TentaclesError(
          `PropsContractChain merge collision: prop "${key}" already exists in the target contract`,
        );
      }
      const desc = sourceDescriptors[key];
      if (desc) this.descriptors[key] = desc;
    }
    return this as unknown as PropsContractChainImpl<Props & InferPropsFromChain<Other>>;
  }

  /** @internal — access accumulated descriptors */
  getDescriptors(): Record<string, PropDescriptor> {
    return this.descriptors;
  }
}

/** Extract the Props accumulator from a PropsContractChainImpl */
export type InferPropsFromChain<C> = C extends { readonly [_pcProps]: infer P } ? P : never;

/**
 * Create a new props contract chain. Chain `.store()` and `.event()` calls,
 * then pass the result directly to `createViewModel({ props })`.
 *
 * @example
 * const modalProps = createPropsContract()
 *   .store("isOpen", (s) => s<boolean>())
 *   .store("title",  (s) => s<string>().optional())
 *   .event("onClose", (e) => e<void>());
 */
export function createPropsContract(): PropsContractChainImpl {
  return new PropsContractChainImpl();
}
