import { ViewModelDefinition } from "@kbml-tentacles/core";
import { createStore, is, type Store } from "effector";
import { useUnit } from "effector-react";
import { useContext } from "react";
import { getModelContext, getViewContext } from "./each";
import type { ModelInstanceId, ModelLike } from "./types";

/** Sentinel store for null instance — shared across all useModel calls */
const $nullInstance = createStore<null>(null, { serialize: "ignore" });

// ═══ VM branch ═══

function useModelFromView<Shape>(definition: ViewModelDefinition<Shape>): Shape {
  const ViewCtx = getViewContext(definition);
  const shape = useContext(ViewCtx) as Shape | null;
  if (!shape) {
    throw new Error("useModel(ViewModelDefinition): no <View> ancestor found");
  }
  return shape;
}

// ═══ Model branches (same as former useScopedModel) ═══

function useModelContext<Instance>(model: ModelLike<Instance>): Instance {
  const ctx = getModelContext(model);
  const instance = useContext(ctx) as Instance | null;
  if (!instance) {
    throw new Error(`useModel(${model.name}): no <Each> ancestor found`);
  }
  return instance;
}

function useModelById<Instance>(model: ModelLike<Instance>, id: ModelInstanceId): Instance | null {
  return useUnit(model.instance(id));
}

function useModelByKey<Instance>(
  model: ModelLike<Instance>,
  ...parts: [string | number, string | number, ...(string | number)[]]
): Instance | null {
  return useUnit(model.instance(...parts));
}

function useModelReactive<Instance>(
  model: ModelLike<Instance>,
  $id: Store<ModelInstanceId | null>,
): Instance | null {
  const id = useUnit($id);
  const $inst = id != null ? model.instance(id) : $nullInstance;
  return useUnit($inst) as Instance | null;
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
