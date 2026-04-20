import type { ScopeEntry } from "@kbml-tentacles/core";
import { resolveFrom } from "@kbml-tentacles/core";
import { is, type Store } from "effector";
import { useProvidedScope, useUnit } from "effector-react";
import { type Context, createContext, memo, type ReactNode, useContext, useMemo } from "react";
import type { ModelInstanceId, ModelLike } from "./types";

// ═══ Context infrastructure ═══
//
// Context maps are stored on globalThis via Symbol.for keys so that even if
// this module is loaded twice (common in Vite monorepo setups with linked
// workspace packages), both copies share the same WeakMaps and contexts
// propagate correctly from <View>/<Each> to useModel.

type ReactCtx = Context<unknown>;

const MODEL_CTX_KEY = Symbol.for("tentacles:react:modelContexts");
const VIEW_CTX_KEY = Symbol.for("tentacles:react:viewContexts");

interface TentaclesGlobalReact {
  [key: symbol]: WeakMap<object, ReactCtx> | undefined;
}

function getMap(key: symbol): WeakMap<object, ReactCtx> {
  const g = globalThis as TentaclesGlobalReact;
  let map = g[key];
  if (!map) {
    map = new WeakMap();
    g[key] = map;
  }
  return map;
}

export function getModelContext(model: object): ReactCtx {
  const map = getMap(MODEL_CTX_KEY);
  let ctx = map.get(model);
  if (!ctx) {
    ctx = createContext<unknown>(null);
    map.set(model, ctx);
  }
  return ctx;
}

export function getViewContext(definition: object): ReactCtx {
  const map = getMap(VIEW_CTX_KEY);
  let ctx = map.get(definition);
  if (!ctx) {
    ctx = createContext<unknown>(null);
    map.set(definition, ctx);
  }
  return ctx;
}

/** @internal */
export const ScopeStackContext = createContext<readonly ScopeEntry[]>([]);

// ═══ Props ═══

export interface EachProps<Instance = unknown> {
  model: ModelLike<Instance>;
  source?: Store<ModelInstanceId[]>;
  id?: ModelInstanceId | Store<ModelInstanceId | null>;
  from?: string;
  children?: ReactNode | ((instance: Instance) => ReactNode);
  fallback?: ReactNode;
}

// ═══ <Each> dispatcher ═══

export function Each<Instance>(props: EachProps<Instance>): ReactNode {
  if (props.source) return <EachSource {...props} source={props.source} />;
  if (props.from) return <EachFrom {...props} from={props.from} />;
  if (props.id != null) {
    if (is.store(props.id)) {
      return <EachReactiveId {...props} id={props.id as Store<ModelInstanceId | null>} />;
    }
    return <EachStaticId {...props} id={props.id as ModelInstanceId} />;
  }
  throw new Error("<Each> requires source, id, or from prop");
}

// ═══ Source mode — iterate a reactive ID list ═══

interface EachSourceProps<Instance = unknown> {
  model: ModelLike<Instance>;
  source: Store<ModelInstanceId[]>;
  children?: ReactNode | ((instance: Instance) => ReactNode);
  fallback?: ReactNode;
}

function EachSource<Instance>({ model, source, children, fallback }: EachSourceProps<Instance>) {
  const ids = useUnit(source);
  const parentStack = useContext(ScopeStackContext);

  if (ids.length === 0 && fallback) return <>{fallback}</>;

  return (
    <>
      {ids.map((id) => (
        <EachItem key={String(id)} id={id} model={model} parentStack={parentStack}>
          {children}
        </EachItem>
      ))}
    </>
  );
}

// ═══ Per-item wrapper (memo boundary) ═══

interface EachItemProps<Instance = unknown> {
  id: ModelInstanceId;
  model: ModelLike<Instance>;
  parentStack: readonly ScopeEntry[];
  children?: ReactNode | ((instance: Instance) => ReactNode);
}

type ChildrenProp = EachItemProps["children"];

function childrenEqual(a: ChildrenProp, b: ChildrenProp): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (!("type" in a) || !("type" in b)) return false;
  if (a.type !== b.type) return false;
  const pa = (a as { props: Record<string, unknown> }).props;
  const pb = (b as { props: Record<string, unknown> }).props;
  if (!pa || !pb) return pa === pb;
  const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  for (const k of keys) {
    if (k === "children") continue;
    if (!Object.is(pa[k], pb[k])) return false;
  }
  return true;
}

const EachItem = memo(
  function EachItem({ id, model, parentStack, children }: EachItemProps) {
    const ModelContext = getModelContext(model);
    // Parent <EachSource> subscribes to $ids and unmounts rows when an id
    // disappears — the id is guaranteed to exist when this row renders.
    // We intentionally do NOT subscribe to $idSet here: $idSet emits a new
    // Set reference on every $ids upstream emission (including field-driven
    // re-emissions from query stores), causing every row to re-render on
    // any change anywhere.
    const scope = useProvidedScope();
    const instance = scope ? (model.getSync(id, scope) ?? null) : model.get(id);

    const stack = useMemo(
      () =>
        instance
          ? [...parentStack, { model, instance: instance as Record<string, unknown> }]
          : parentStack,
      [parentStack, model, instance],
    );

    // Defensive no-op for edge cases (e.g. race between unmount and parent emit).
    if (!instance) return null;

    return (
      <ScopeStackContext.Provider value={stack}>
        <ModelContext.Provider value={instance}>
          {typeof children === "function" ? (children as Function)(instance) : children}
        </ModelContext.Provider>
      </ScopeStackContext.Provider>
    );
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.model === next.model &&
    prev.parentStack === next.parentStack &&
    childrenEqual(prev.children, next.children),
) as <Instance>(props: EachItemProps<Instance>) => ReactNode;

// ═══ Static ID mode — scope a single instance ═══

interface EachStaticIdProps<Instance = unknown> {
  model: ModelLike<Instance>;
  id: ModelInstanceId;
  children?: ReactNode | ((instance: Instance) => ReactNode);
}

function EachStaticId<Instance>({ model, id, children }: EachStaticIdProps<Instance>) {
  const parentStack = useContext(ScopeStackContext);
  const ModelContext = getModelContext(model);
  const $present = useMemo(() => model.has(id), [model, id]);
  const present = useUnit($present);
  const scope = useProvidedScope();
  const instance = present ? (scope ? (model.getSync(id, scope) ?? null) : model.get(id)) : null;

  // All hooks above — safe to early-return below
  const stack = useMemo(
    () =>
      instance
        ? [...parentStack, { model, instance: instance as Record<string, unknown> }]
        : parentStack,
    [parentStack, model, instance],
  );

  if (!instance) return null;

  return (
    <ScopeStackContext.Provider value={stack}>
      <ModelContext.Provider value={instance}>
        {typeof children === "function" ? (children as Function)(instance) : children}
      </ModelContext.Provider>
    </ScopeStackContext.Provider>
  );
}

// ═══ Reactive ID mode — scope by Store<ID | null> ═══

interface EachReactiveIdProps<Instance = unknown> {
  model: ModelLike<Instance>;
  id: Store<ModelInstanceId | null>;
  children?: ReactNode | ((instance: Instance) => ReactNode);
}

function EachReactiveId<Instance>({ model, id: $id, children }: EachReactiveIdProps<Instance>) {
  const resolvedId = useUnit($id);
  if (resolvedId == null) return null;
  return (
    <EachStaticId model={model} id={resolvedId}>
      {children}
    </EachStaticId>
  );
}

// ═══ From mode — resolve ref from parent context ═══

interface EachFromProps<Instance = unknown> {
  model: ModelLike<Instance>;
  from: string;
  children?: ReactNode | ((instance: Instance) => ReactNode);
  fallback?: ReactNode;
}

function EachFrom<Instance>({ model, from, children, fallback }: EachFromProps<Instance>) {
  const parentStack = useContext(ScopeStackContext);
  const resolved = resolveFrom(parentStack, from, model);

  if (resolved.cardinality === "many") {
    return (
      <EachSource
        model={model}
        source={resolved.store as Store<ModelInstanceId[]>}
        fallback={fallback}
      >
        {children}
      </EachSource>
    );
  }
  return (
    <EachReactiveId model={model} id={resolved.store as Store<ModelInstanceId | null>}>
      {children}
    </EachReactiveId>
  );
}
