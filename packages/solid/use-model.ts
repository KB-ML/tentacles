import { ViewModelDefinition } from "@kbml-tentacles/core";
import { is, type Store } from "effector";
import { useUnit } from "effector-solid";
import { type Accessor, createMemo, useContext } from "solid-js";
import { getModelContext, getViewContext, useProvidedScope } from "./each";
import type { ModelInstanceId, ModelLike } from "./types";

// ═══ VM branch ═══

function useModelFromView<Shape>(definition: ViewModelDefinition<Shape>): Shape {
  const ViewCtx = getViewContext(definition);
  const accessor = useContext(ViewCtx);
  if (!accessor || accessor() == null) {
    throw new Error("useModel(ViewModelDefinition): no <View> ancestor found");
  }
  return accessor() as Shape;
}

// ═══ Model branches (same as former useScopedModel) ═══

function useModelContext<Instance>(model: ModelLike<Instance>): Instance {
  const ModelCtx = getModelContext(model);
  const accessor = useContext(ModelCtx);
  if (!accessor || accessor() == null) {
    throw new Error(`useModel(${model.name}): no <Each> ancestor found`);
  }
  return accessor() as Instance;
}

function useModelById<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Accessor<Instance | null> {
  const present = useUnit(model.has(id));
  const scope = useProvidedScope();
  return createMemo(() => {
    if (!present()) return null;
    return scope
      ? ((model.getSync(id, scope) as Instance | undefined) ?? null)
      : ((model.get(id) as Instance) ?? null);
  });
}

function useModelByKey<Instance>(
  model: ModelLike<Instance>,
  ...parts: [string | number, string | number, ...(string | number)[]]
): Accessor<Instance | null> {
  const serialized = parts.map(String).join("\x00");
  const present = useUnit(model.has(serialized));
  const scope = useProvidedScope();
  return createMemo(() => {
    if (!present()) return null;
    return scope
      ? ((model.getByKeySync(...parts, scope) as Instance | undefined) ?? null)
      : ((model.get(...parts) as Instance) ?? null);
  });
}

function useModelReactive<Instance>(
  model: ModelLike<Instance>,
  $id: Store<ModelInstanceId | null>,
): Accessor<Instance | null> {
  const idAccessor = useUnit($id);
  // Subscribe to $ids (emits only on structural changes, not field mutations).
  const idsAccessor = useUnit(model.$ids);
  const scope = useProvidedScope();
  return createMemo(() => {
    const id = idAccessor() as ModelInstanceId | null;
    if (id == null) return null;
    const ids = idsAccessor() as ModelInstanceId[];
    if (!ids.includes(id) && !ids.includes(String(id))) return null;
    return scope
      ? ((model.getSync(id, scope) as Instance | undefined) ?? null)
      : ((model.get(id) as Instance) ?? null);
  });
}

// ═══ Public overloads ═══

/** Read view model shape from nearest `<View>` context */
export function useModel<Shape>(definition: ViewModelDefinition<Shape>): Shape;
/** Read scoped instance from nearest `<Each>` context */
export function useModel<Instance>(model: ModelLike<Instance>): Instance;
/** Direct instance access by static ID — returns Accessor */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Accessor<Instance | null>;
/** Direct instance access by compound key — returns Accessor */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  ...key: [string | number, string | number, ...(string | number)[]]
): Accessor<Instance | null>;
/** Reactive instance access by Store<ID | null> — returns Accessor */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  id: Store<ModelInstanceId | null>,
): Accessor<Instance | null>;

// ═══ Dispatcher ═══

export function useModel(first: unknown, ...args: unknown[]): unknown {
  if (first instanceof ViewModelDefinition) {
    return useModelFromView(first);
  }
  const model = first as ModelLike;
  if (args.length === 0) return useModelContext(model);
  if (args.length === 1 && is.store(args[0])) {
    return useModelReactive(model, args[0] as Store<ModelInstanceId | null>);
  }
  if (args.length === 1) return useModelById(model, args[0] as ModelInstanceId);
  return useModelByKey(
    model,
    ...(args as [string | number, string | number, ...(string | number)[]]),
  );
}
