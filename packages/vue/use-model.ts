import { ViewModelDefinition } from "@kbml-tentacles/core";
import { is, type Scope, type Store } from "effector";
import { useUnit } from "effector-vue/composition";
import { computed, getCurrentInstance, inject, markRaw, type Ref, toRaw } from "vue";

/**
 * Mirrors effector-vue/composition's internal scope resolution. The SSR plugin
 * sets `appContext.config.globalProperties.scopeName` and `app.provide(scopeName, scope)`,
 * and `useUnit` reads it back via `inject(scopeName)`. We replicate that here so
 * `model.get(id, scope)` can read the forked scope's $dataMap.
 */
function useProvidedScope(): Scope | null {
  const instance = getCurrentInstance();
  const scopeName = instance?.appContext.config.globalProperties.scopeName as string | undefined;
  if (!scopeName) return null;
  const scope = inject<Scope | null>(scopeName, null);
  return scope ?? null;
}

import { getModelContext, getViewContext } from "./each";
import type { ModelInstanceId, ModelLike } from "./types";

/** Mark all effector units in an instance as raw to prevent Vue proxying */
function markUnitsRaw<T>(instance: T): T {
  if (instance && typeof instance === "object") {
    for (const val of Object.values(instance as Record<string, unknown>)) {
      if (val && typeof val === "object" && (is.store(val) || is.event(val) || is.effect(val))) {
        markRaw(val);
      }
    }
  }
  return instance;
}

// ═══ VM branch ═══

function useModelFromView<Shape>(definition: ViewModelDefinition<Shape>): Shape {
  const key = getViewContext(definition);
  const shapeRef = inject(key, undefined);
  if (!shapeRef || shapeRef.value == null) {
    throw new Error("useModel(ViewModelDefinition): no <View> ancestor found");
  }
  return markUnitsRaw(shapeRef.value as Shape);
}

// ═══ Model branches (same as former useScopedModel) ═══

function useModelContext<Instance>(model: ModelLike<Instance>): Instance {
  const key = getModelContext(model);
  const instanceRef = inject(key, undefined);
  if (!instanceRef || instanceRef.value == null) {
    throw new Error(`useModel(${model.name}): no <Each> ancestor found`);
  }
  return markUnitsRaw(instanceRef.value as Instance);
}

function useModelById<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Ref<Instance | null> {
  const presentRef = useUnit(markRaw(model.has(id)));
  const scope = useProvidedScope();
  return computed(() => {
    if (!presentRef.value) return null;
    return (model.get(id, scope ?? undefined) as Instance | null) ?? null;
  });
}

function useModelByKey<Instance>(
  model: ModelLike<Instance>,
  ...parts: [string | number, string | number, ...(string | number)[]]
): Ref<Instance | null> {
  const serialized = parts.map(String).join("\x00");
  const presentRef = useUnit(markRaw(model.has(serialized)));
  const scope = useProvidedScope();
  return computed(() => {
    if (!presentRef.value) return null;
    return (model.get(parts, scope ?? undefined) as Instance | null) ?? null;
  });
}

function useModelReactive<Instance>(
  model: ModelLike<Instance>,
  $id: Store<ModelInstanceId | null>,
): Ref<Instance | null> {
  const idRef = useUnit(markRaw(toRaw($id)));
  // Subscribe to the model's $ids store — it only emits when ids mutate
  // (add / remove / clear / reorder), NOT on field changes. This is the
  // minimal reactive surface we need: we depend on the current $id and
  // on membership, and we already depend on $id via idRef.
  const idsRef = useUnit(markRaw(model.$ids));
  const scope = useProvidedScope();
  return computed(() => {
    const id = idRef.value as ModelInstanceId | null;
    if (id == null) return null;
    const ids = idsRef.value as ModelInstanceId[];
    if (!ids.includes(id) && !ids.includes(String(id))) return null;
    return (model.get(id, scope ?? undefined) as Instance | null) ?? null;
  });
}

// ═══ Public overloads ═══

/** Read view model shape from nearest `<View>` context */
export function useModel<Shape>(definition: ViewModelDefinition<Shape>): Shape;
/** Read scoped instance from nearest `<Each>` context */
export function useModel<Instance>(model: ModelLike<Instance>): Instance;
/** Direct instance access by static ID — returns reactive Ref */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Ref<Instance | null>;
/** Direct instance access by compound key — returns reactive Ref */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  ...key: [string | number, string | number, ...(string | number)[]]
): Ref<Instance | null>;
/** Reactive instance access by Store<ID | null> — returns reactive Ref */
export function useModel<Instance>(
  model: ModelLike<Instance>,
  id: Store<ModelInstanceId | null>,
): Ref<Instance | null>;

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
