import type { EventCallable, StoreWritable } from "effector";

type DataMapStore = StoreWritable<Record<string, Record<string, unknown>>>;

/**
 * Registry for shared model-level .on() handlers.
 *
 * When fn does `$count.on(increment, n => n + 1)`, instead of creating a per-instance
 * handler, we register the reducer at the model level. ONE $dataMap.on() handler per
 * contract event serves ALL instances.
 */
export class SharedOnRegistry {
  // event → field → reducer
  private readonly reducers = new Map<
    EventCallable<unknown>,
    Map<string, (state: unknown, payload: unknown) => unknown>
  >();

  /**
   * Wire all model events eagerly at construction time so the $dataMap.on()
   * handlers live at the model level (NOT inside any instance region).
   * This prevents clearNode(region, { deep: true }) from destroying them
   * when instances are deleted or replaced.
   */
  constructor(
    private readonly $dataMap: DataMapStore,
    modelEvents: Iterable<EventCallable<unknown>>,
  ) {
    const reducersRef = this.reducers;
    for (const clock of modelEvents) {
      this.$dataMap.on(clock as EventCallable<{ id: string; payload?: unknown }>, (map, params) => {
        const id =
          typeof params === "object" && params !== null && "id" in params
            ? (params as { id: string }).id
            : undefined;
        if (!id) return map;
        const entry = map[id];
        if (!entry) return map;
        const fieldReducers = reducersRef.get(clock);
        if (!fieldReducers) return map;
        const updated = { ...entry };
        let changed = false;
        const payload =
          typeof params === "object" && params !== null && "payload" in params
            ? (params as { payload: unknown }).payload
            : undefined;
        for (const [field, fn] of fieldReducers) {
          const oldVal = updated[field];
          let newVal: unknown;
          try {
            newVal = fn(oldVal, payload);
          } catch {
            continue;
          }
          if (oldVal !== newVal) {
            updated[field] = newVal;
            changed = true;
          }
        }
        return changed ? { ...map, [id]: updated } : map;
      });
    }
  }

  /**
   * Register a field reducer for an event. The $dataMap.on() handler was
   * already wired in the constructor — this just adds the field reducer
   * to the map that the handler consults.
   */
  register(
    clock: EventCallable<unknown>,
    fieldName: string,
    reducer: (state: unknown, payload: unknown) => unknown,
  ): void {
    let fieldMap = this.reducers.get(clock);
    if (!fieldMap) {
      fieldMap = new Map();
      this.reducers.set(clock, fieldMap);
    }
    fieldMap.set(fieldName, reducer);
  }

  /** Check if a (clock, field) combination is already registered. */
  has(clock: EventCallable<unknown>, fieldName: string): boolean {
    return this.reducers.get(clock)?.has(fieldName) ?? false;
  }
}

/**
 * Creates a zero-cost proxy for a contract state field.
 *
 * NOT an effector store — no graph nodes. Delegates:
 * - .getState() → reads $dataMap (O(1), no node)
 * - .defaultState → reads $dataMap default (O(1), no node)
 * - .set(value) → fires model-level event (no per-instance node)
 * - .on(event, reducer) → shared model-level $dataMap handler (no per-instance node)
 * - .map()/.graphite/combine(it) → MATERIALIZES into real store (rare, lazy)
 */
export function createFieldProxy<T>(
  $dataMap: DataMapStore,
  instanceId: string,
  fieldName: string,
  fieldSetEvent: EventCallable<{ id: string; value: unknown }>,
  sharedOnRegistry: SharedOnRegistry,
  materializeFn: () => StoreWritable<T>,
  instanceToModelEvent?: Map<EventCallable<unknown>, EventCallable<unknown>>,
): StoreWritable<T> {
  let _materialized: StoreWritable<T> | null = null;

  function materialize(): StoreWritable<T> {
    if (!_materialized) {
      _materialized = materializeFn();
    }
    return _materialized;
  }

  const proxy: Record<string, unknown> = {
    // ═══ Fast path — no effector nodes ═══

    getState(): T {
      if (_materialized) return _materialized.getState();
      const entry = $dataMap.getState()[instanceId];
      return (entry ? entry[fieldName] : undefined) as T;
    },

    // .set — LAZY prepend on model-level event. Created on first access.
    // IS a real effector event so allSettled(inst.$field.set, { scope }) works.
    get set() {
      // Fast path: direct mutation + version bump (avoids O(N) $dataMap spread).
      // The fieldSetEvent creates an effector prepend for allSettled compatibility,
      // but for direct calls we can also offer a fast non-spreading path.
      const setEvent = fieldSetEvent.prepend((value: T) => ({ id: instanceId, value }));
      Object.defineProperty(proxy, "set", { value: setEvent, configurable: true });
      return setEvent;
    },

    // .on — shared model-level handler for contract events, materialize for external events
    on(clock: EventCallable<unknown>, reducer: (state: T, payload: unknown) => T) {
      const modelEvent = instanceToModelEvent?.get(clock);
      if (modelEvent) {
        // Contract event → shared model-level $dataMap handler (no per-instance node)
        if (!sharedOnRegistry.has(modelEvent, fieldName)) {
          sharedOnRegistry.register(
            modelEvent,
            fieldName,
            reducer as (state: unknown, payload: unknown) => unknown,
          );
        }
      } else {
        // External event (createEffect.doneData, etc.) → materialize and use real .on()
        materialize().on(clock, reducer);
      }
      return proxy;
    },

    off(clock: EventCallable<unknown>) {
      if (_materialized) _materialized.off(clock);
      return proxy;
    },

    // ═══ Materialization triggers ═══

    get kind() {
      return "store";
    },
    get targetable() {
      return true;
    },
    get graphite() {
      return (materialize() as unknown as Record<string, unknown>).graphite;
    },
    get sid() {
      return _materialized?.sid ?? null;
    },
    get stateRef() {
      return (materialize() as unknown as Record<string, unknown>).stateRef;
    },
    get updates() {
      return materialize().updates;
    },
    get subscribe() {
      return materialize().subscribe.bind(materialize());
    },
    get watch() {
      return materialize().watch.bind(materialize());
    },
    get map() {
      return materialize().map.bind(materialize()) as StoreWritable<T>["map"];
    },
    get compositeName() {
      return (materialize() as unknown as Record<string, unknown>).compositeName;
    },
    get or() {
      return (materialize() as unknown as Record<string, unknown>).or;
    },
    get and() {
      return (materialize() as unknown as Record<string, unknown>).and;
    },
    // Do NOT delegate @@unitShape to materialized store — .map() stores don't have it.
    // Framework bindings (effector-solid, effector-react) fall through to .subscribe() path.
  };

  // .defaultState — reads from $dataMap's default state (no node)
  Object.defineProperty(proxy, "defaultState", {
    get(): T {
      if (_materialized)
        return (_materialized as StoreWritable<T> & { defaultState: T }).defaultState;
      const store = $dataMap as DataMapStore & {
        defaultState: Record<string, Record<string, unknown>>;
      };
      const entry = store.defaultState[instanceId];
      return (entry ? entry[fieldName] : undefined) as T;
    },
    configurable: true,
  });

  // .shortName — combine accesses this
  Object.defineProperty(proxy, "shortName", {
    get() {
      if (_materialized) return (_materialized as unknown as Record<string, unknown>).shortName;
      return fieldName;
    },
    configurable: true,
  });

  return proxy as unknown as StoreWritable<T>;
}
