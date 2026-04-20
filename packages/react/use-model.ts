import { ViewModelDefinition } from "@kbml-tentacles/core";
import { is, type Store } from "effector";
import { useProvidedScope, useUnit } from "effector-react";
import { useContext, useMemo } from "react";
import { getModelContext, getViewContext } from "./each";
import type { ModelInstanceId, ModelLike } from "./types";

// Compound-key delimiter — must match `InstanceCache.COMPOUND_PK_DELIMITER` in core.
const COMPOUND_PK_DELIMITER = "\x00";

// ═══ VM branch ═══

function useModelFromView<Shape>(definition: ViewModelDefinition<Shape>): Shape {
  const ViewCtx = getViewContext(definition);
  const shape = useContext(ViewCtx) as Shape | null;
  if (!shape) {
    throw new Error("useModel(ViewModelDefinition): no <View> ancestor found");
  }
  return shape;
}

// ═══ Model branches ═══

function useModelContext<Instance>(model: ModelLike<Instance>): Instance {
  const ctx = getModelContext(model);
  const instance = useContext(ctx) as Instance | null;
  if (!instance) {
    throw new Error(`useModel(${model.name}): no <Each> ancestor found`);
  }
  return instance;
}

function serializeParts(parts: readonly (string | number)[]): string {
  return parts.length === 1 ? String(parts[0]) : parts.map(String).join(COMPOUND_PK_DELIMITER);
}

function useModelById<Instance>(model: ModelLike<Instance>, id: ModelInstanceId): Instance | null {
  const $present = useMemo(() => model.has(id), [model, id]);
  const present = useUnit($present);
  const scope = useProvidedScope();
  if (!present) return null;
  return scope ? (model.getSync(id, scope) ?? null) : model.get(id);
}

function useModelByKey<Instance>(
  model: ModelLike<Instance>,
  ...parts: [string | number, string | number, ...(string | number)[]]
): Instance | null {
  const serialized = serializeParts(parts);
  const $present = useMemo(() => model.has(serialized), [model, serialized]);
  const present = useUnit($present);
  const scope = useProvidedScope();
  if (!present) return null;
  return scope ? (model.getByKeySync(...parts, scope) ?? null) : model.get(...parts);
}

function useModelReactive<Instance>(
  model: ModelLike<Instance>,
  $id: Store<ModelInstanceId | null>,
): Instance | null {
  const id = useUnit($id);
  // Stable fallback id ("") so the hook count is constant across renders.
  const $present = useMemo(() => model.has(id ?? ""), [model, id]);
  const present = useUnit($present);
  const scope = useProvidedScope();
  if (id == null) return null;
  if (!present) return null;
  return scope ? (model.getSync(id, scope) ?? null) : model.get(id);
}

// ═══ Public overloads ═══

/** Read view model shape from nearest `<View>` context */
export function useModel<Shape>(definition: ViewModelDefinition<Shape>): Shape;
/** Read scoped instance from nearest `<Each>` context */
export function useModel<Instance>(model: ModelLike<Instance>): Instance;
/** Direct instance access by static ID */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Instance | null;
/** Direct instance access by compound key */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  ...key: [string | number, string | number, ...(string | number)[]]
): Instance | null;
/** Reactive instance access by Store<ID | null> */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  id: Store<ModelInstanceId | null>,
): Instance | null;

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
