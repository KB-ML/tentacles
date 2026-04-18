import type { ScopeEntry } from "@kbml-tentacles/core";
import { resolveFrom } from "@kbml-tentacles/core";
import { is, type Store } from "effector";
import { useUnit } from "effector-solid";
import {
  type Accessor,
  type Context,
  createContext,
  createMemo,
  For,
  type JSX,
  Show,
  useContext,
} from "solid-js";
import type { ModelInstanceId, ModelLike } from "./types";

// ═══ Context infrastructure ═══
//
// Context maps are stored on globalThis via Symbol.for keys so that even if
// this module is loaded twice (common in Vite monorepo setups with linked
// workspace packages), both copies share the same WeakMaps and contexts
// propagate correctly from <View>/<Each> to useModel.

type SolidViewCtx = Context<Accessor<unknown> | undefined>;

const MODEL_CTX_KEY = Symbol.for("tentacles:solid:modelContexts");
const VIEW_CTX_KEY = Symbol.for("tentacles:solid:viewContexts");

interface TentaclesGlobalSolid {
  [key: symbol]: WeakMap<object, SolidViewCtx> | undefined;
}

function getMap(key: symbol): WeakMap<object, SolidViewCtx> {
  const g = globalThis as TentaclesGlobalSolid;
  let map = g[key];
  if (!map) {
    map = new WeakMap();
    g[key] = map;
  }
  return map;
}

export function getModelContext(model: object): SolidViewCtx {
  const map = getMap(MODEL_CTX_KEY);
  let ctx = map.get(model);
  if (!ctx) {
    ctx = createContext<Accessor<unknown> | undefined>(undefined);
    map.set(model, ctx);
  }
  return ctx;
}

export function getViewContext(definition: object): SolidViewCtx {
  const map = getMap(VIEW_CTX_KEY);
  let ctx = map.get(definition);
  if (!ctx) {
    ctx = createContext<Accessor<unknown> | undefined>(undefined);
    map.set(definition, ctx);
  }
  return ctx;
}

export const ScopeStackContext = createContext<Accessor<readonly ScopeEntry[]>>(() => []);

// ═══ Props ═══

export interface EachProps<Instance = unknown> {
  model: ModelLike<Instance>;
  source?: Store<ModelInstanceId[]>;
  id?: ModelInstanceId | Store<ModelInstanceId | null>;
  from?: string;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
  fallback?: JSX.Element;
}

// ═══ <Each> component ═══

export function Each<Instance>(props: EachProps<Instance>): JSX.Element {
  if (props.source) {
    return <EachSource {...props} source={props.source} />;
  }
  if (props.from) {
    return <EachFrom {...props} from={props.from} />;
  }
  if (props.id != null) {
    if (is.store(props.id)) {
      return <EachReactiveId {...props} id={props.id as Store<ModelInstanceId | null>} />;
    }
    return <EachStaticId {...props} id={props.id as ModelInstanceId} />;
  }
  throw new Error("<Each> requires source, id, or from prop");
}

// ═══ Source mode ═══

function EachSource<Instance>(props: {
  model: ModelLike<Instance>;
  source: Store<ModelInstanceId[]>;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
  fallback?: JSX.Element;
}): JSX.Element {
  const ids = useUnit(props.source);
  const parentStack = useContext(ScopeStackContext);

  return (
    <Show when={(ids() as ModelInstanceId[]).length > 0} fallback={props.fallback}>
      <For each={ids() as ModelInstanceId[]}>
        {(id) => (
          <EachItem model={props.model} id={id} parentStack={parentStack}>
            {props.children}
          </EachItem>
        )}
      </For>
    </Show>
  );
}

// ═══ Per-item wrapper ═══

function EachItem<Instance>(props: {
  model: ModelLike<Instance>;
  id: ModelInstanceId;
  parentStack: Accessor<readonly ScopeEntry[]>;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
}): JSX.Element {
  const ModelCtx = getModelContext(props.model);
  const instance = useUnit(props.model.instance(props.id));

  const stack = createMemo<readonly ScopeEntry[]>(() => {
    const inst = instance() as Instance | null;
    return inst
      ? [...props.parentStack(), { model: props.model, instance: inst as Record<string, unknown> }]
      : props.parentStack();
  });

  const instanceAccessor: Accessor<unknown> = () => instance();

  return (
    <Show when={instance()}>
      <ScopeStackContext.Provider value={stack}>
        <ModelCtx.Provider value={instanceAccessor}>
          {typeof props.children === "function"
            ? (props.children as Function)(instance())
            : props.children}
        </ModelCtx.Provider>
      </ScopeStackContext.Provider>
    </Show>
  );
}

// ═══ Static ID mode ═══

function EachStaticId<Instance>(props: {
  model: ModelLike<Instance>;
  id: ModelInstanceId;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
}): JSX.Element {
  const ModelCtx = getModelContext(props.model);
  const parentStack = useContext(ScopeStackContext);
  const instance = useUnit(props.model.instance(props.id));

  const stack = createMemo<readonly ScopeEntry[]>(() => {
    const inst = instance() as Instance | null;
    return inst
      ? [...parentStack(), { model: props.model, instance: inst as Record<string, unknown> }]
      : parentStack();
  });

  const instanceAccessor: Accessor<unknown> = () => instance();

  return (
    <Show when={instance()}>
      <ScopeStackContext.Provider value={stack}>
        <ModelCtx.Provider value={instanceAccessor}>
          {typeof props.children === "function"
            ? (props.children as Function)(instance())
            : props.children}
        </ModelCtx.Provider>
      </ScopeStackContext.Provider>
    </Show>
  );
}

// ═══ Reactive ID mode ═══

function EachReactiveId<Instance>(props: {
  model: ModelLike<Instance>;
  id: Store<ModelInstanceId | null>;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
}): JSX.Element {
  const resolvedId = useUnit(props.id);

  return (
    <Show when={resolvedId() != null}>
      <EachStaticId model={props.model} id={resolvedId() as ModelInstanceId}>
        {props.children}
      </EachStaticId>
    </Show>
  );
}

// ═══ From mode ═══

function EachFrom<Instance>(props: {
  model: ModelLike<Instance>;
  from: string;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
  fallback?: JSX.Element;
}): JSX.Element {
  const parentStack = useContext(ScopeStackContext);
  const resolved = resolveFrom(parentStack(), props.from, props.model);

  if (resolved.cardinality === "many") {
    return (
      <EachSource
        model={props.model}
        source={resolved.store as Store<ModelInstanceId[]>}
        fallback={props.fallback}
      >
        {props.children}
      </EachSource>
    );
  }
  return (
    <EachReactiveId model={props.model} id={resolved.store as Store<ModelInstanceId | null>}>
      {props.children}
    </EachReactiveId>
  );
}
