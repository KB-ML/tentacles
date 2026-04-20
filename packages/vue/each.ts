import type { ScopeEntry } from "@kbml-tentacles/core";
import { resolveFrom } from "@kbml-tentacles/core";
import { is, type Scope, type Store } from "effector";
import { useUnit } from "effector-vue/composition";
import {
  type Component,
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  type InjectionKey,
  inject,
  markRaw,
  provide,
  type Ref,
  ref,
  toRaw,
  type VNode,
} from "vue";
import type { ModelInstanceId, ModelLike } from "./types";

/**
 * Mirrors effector-vue/composition's internal scope resolution so we can pass
 * the current scope to `model.getSync`. See `packages/vue/use-model.ts`.
 */
function useProvidedScope(): Scope | null {
  const instance = getCurrentInstance();
  const scopeName = instance?.appContext.config.globalProperties.scopeName as string | undefined;
  if (!scopeName) return null;
  const scope = inject<Scope | null>(scopeName, null);
  return scope ?? null;
}

// ═══ Context infrastructure ═══
//
// Context maps are stored on globalThis via Symbol.for keys so that even if
// this module is loaded twice (common in Vite monorepo setups with linked
// workspace packages), both copies share the same WeakMaps and contexts
// propagate correctly from <View>/<Each> to useModel.

type VueCtx = InjectionKey<Ref<unknown>>;

const MODEL_CTX_KEY = Symbol.for("tentacles:vue:modelContexts");
const VIEW_CTX_KEY = Symbol.for("tentacles:vue:viewContexts");

interface TentaclesGlobalVue {
  [key: symbol]: WeakMap<object, VueCtx> | undefined;
}

function getMap(key: symbol): WeakMap<object, VueCtx> {
  const g = globalThis as TentaclesGlobalVue;
  let map = g[key];
  if (!map) {
    map = new WeakMap();
    g[key] = map;
  }
  return map;
}

export function getModelContext(model: object): VueCtx {
  const map = getMap(MODEL_CTX_KEY);
  let key = map.get(model);
  if (!key) {
    key = Symbol() as InjectionKey<Ref<unknown>>;
    map.set(model, key);
  }
  return key;
}

export function getViewContext(definition: object): VueCtx {
  const map = getMap(VIEW_CTX_KEY);
  let key = map.get(definition);
  if (!key) {
    key = Symbol() as InjectionKey<Ref<unknown>>;
    map.set(definition, key);
  }
  return key;
}

export const ScopeStackKey: InjectionKey<Ref<readonly ScopeEntry[]>> = Symbol("ScopeStack");

// ═══ Helpers ═══

function useScopeStack(): Ref<readonly ScopeEntry[]> {
  return inject(ScopeStackKey, ref<readonly ScopeEntry[]>([]));
}

// ═══ <Each> component ═══

export const Each: Component = defineComponent({
  name: "Each",
  props: {
    model: { type: Object, required: true },
    source: { type: Object, default: undefined },
    id: { type: [String, Number, Object], default: undefined },
    from: { type: String, default: undefined },
    fallback: { type: Object, default: undefined },
  },
  setup(props, { slots }) {
    // toRaw unwraps Vue's readonly proxy, markRaw prevents re-wrapping when
    // passed as props to child components. Without this, Vue wraps effector's
    // internal graphite nodes in readonly proxies, causing
    // "[Vue warn] Set operation on key failed: target is readonly".
    const model = markRaw(toRaw(props.model)) as ModelLike;
    const source = props.source
      ? (markRaw(toRaw(props.source)) as Store<ModelInstanceId[]>)
      : undefined;
    const id =
      props.id != null && typeof props.id === "object"
        ? (markRaw(toRaw(props.id)) as Store<ModelInstanceId | null>)
        : (props.id as ModelInstanceId | undefined);

    if (source) {
      return setupEachSource(model, source, slots, props.fallback as VNode | undefined);
    }
    if (props.from) {
      return setupEachFrom(model, props.from, slots, props.fallback as VNode | undefined);
    }
    if (id != null) {
      if (is.store(id)) {
        return setupEachReactiveId(model, id as Store<ModelInstanceId | null>, slots);
      }
      return setupEachStaticId(model, id as ModelInstanceId, slots);
    }
    throw new Error("<Each> requires source, id, or from prop");
  },
});

// ═══ Source mode ═══

function setupEachSource(
  model: ModelLike,
  source: Store<ModelInstanceId[]>,
  slots: Record<string, Function | undefined>,
  fallback?: VNode,
) {
  const ids = useUnit(source);
  const parentStack = useScopeStack();

  return () => {
    const currentIds = ids.value as ModelInstanceId[];
    if (currentIds.length === 0 && fallback) return fallback;

    return currentIds.map((id) =>
      h(EachItem, { key: String(id), id, model, parentStack: parentStack.value }, slots),
    );
  };
}

// ═══ Per-item wrapper ═══

const EachItem = defineComponent({
  name: "EachItem",
  props: {
    id: { type: [String, Number], required: true },
    model: { type: Object, required: true },
    parentStack: { type: Array as () => readonly ScopeEntry[], required: true },
  },
  setup(props, { slots }) {
    // toRaw unwraps Vue's readonly proxy so effector sees the real store/model.
    // Without it, Vue wraps effector's internal graphite nodes in a readonly proxy,
    // causing "[Vue warn] Set operation on key failed: target is readonly".
    const model = toRaw(props.model) as ModelLike;
    // Parent <EachSource> subscribes to $ids and removes rows when the id
    // disappears. We intentionally do NOT subscribe to $idSet here —
    // $idSet emits a fresh Set reference on every upstream $ids emission,
    // which would re-render every row on any field change.
    const scope = useProvidedScope();
    const id = props.id as ModelInstanceId;
    const instance = computed(() => {
      return scope ? (model.getSync(id, scope) ?? null) : (model.get(id) ?? null);
    });

    // Provide context when instance exists
    const parentStack = props.parentStack as readonly ScopeEntry[];
    const modelKey = getModelContext(model);
    const instanceRef = computed(() => {
      const val = instance.value;
      return val ? markRaw(val as Record<string, unknown>) : null;
    });
    provide(modelKey, instanceRef as Ref<unknown>);

    const stack = computed<readonly ScopeEntry[]>(() => {
      if (!instance.value) return parentStack;
      // markRaw prevents Vue from deep-proxying the instance (contains effector units)
      const entry: ScopeEntry = markRaw({
        model,
        instance: instance.value as Record<string, unknown>,
      });
      return [...parentStack, entry];
    });
    provide(ScopeStackKey, stack as Ref<readonly ScopeEntry[]>);

    return () => {
      if (!instance.value) return null;
      const renderFn = slots.default;
      if (!renderFn) return null;
      if (typeof renderFn === "function") return renderFn(instance.value);
      return null;
    };
  },
});

// ═══ Static ID mode ═══

function setupEachStaticId(
  model: ModelLike,
  id: ModelInstanceId,
  slots: Record<string, Function | undefined>,
) {
  const parentStack = useScopeStack();
  const presentRef = useUnit(markRaw(model.has(id)));
  const scope = useProvidedScope();
  const instance = computed(() => {
    if (!presentRef.value) return null;
    return scope ? (model.getSync(id, scope) ?? null) : (model.get(id) ?? null);
  });
  const modelKey = getModelContext(model);

  provide(
    modelKey,
    computed(() => {
      const val = instance.value;
      return val ? markRaw(val as Record<string, unknown>) : null;
    }) as Ref<unknown>,
  );

  const stack = computed<readonly ScopeEntry[]>(() => {
    if (!instance.value) return parentStack.value;
    const entry: ScopeEntry = markRaw({
      model,
      instance: instance.value as Record<string, unknown>,
    });
    return [...parentStack.value, entry];
  });
  provide(ScopeStackKey, stack as Ref<readonly ScopeEntry[]>);

  return () => {
    if (!instance.value) return null;
    const renderFn = slots.default;
    if (!renderFn) return null;
    if (typeof renderFn === "function") return renderFn(instance.value);
    return null;
  };
}

// ═══ Reactive ID mode ═══

function setupEachReactiveId(
  model: ModelLike,
  $id: Store<ModelInstanceId | null>,
  slots: Record<string, Function | undefined>,
) {
  const resolvedId = useUnit($id);
  const parentStack = useScopeStack();
  const scope = useProvidedScope();

  // Computed instance that updates when resolvedId changes
  const $inst = computed(() => {
    const id = resolvedId.value as ModelInstanceId | null;
    if (id == null) return null;
    return (scope ? model.getSync(id, scope) : model.getSync(id)) ?? null;
  });

  const modelKey = getModelContext(model);
  provide(
    modelKey,
    computed(() => {
      const val = $inst.value;
      return val ? markRaw(val as Record<string, unknown>) : null;
    }) as Ref<unknown>,
  );

  const stack = computed<readonly ScopeEntry[]>(() => {
    if (!$inst.value) return parentStack.value;
    const entry: ScopeEntry = markRaw({
      model,
      instance: $inst.value as Record<string, unknown>,
    });
    return [...parentStack.value, entry];
  });
  provide(ScopeStackKey, stack as Ref<readonly ScopeEntry[]>);

  return () => {
    if (!$inst.value) return null;
    const renderFn = slots.default;
    if (!renderFn) return null;
    if (typeof renderFn === "function") return renderFn($inst.value);
    return null;
  };
}

// ═══ From mode ═══

function setupEachFrom(
  model: ModelLike,
  from: string,
  slots: Record<string, Function | undefined>,
  fallback?: VNode,
) {
  const parentStack = useScopeStack();
  const resolved = resolveFrom(parentStack.value, from, model);

  if (resolved.cardinality === "many") {
    return setupEachSource(model, resolved.store as Store<ModelInstanceId[]>, slots, fallback);
  }
  return setupEachReactiveId(model, resolved.store as Store<ModelInstanceId | null>, slots);
}
