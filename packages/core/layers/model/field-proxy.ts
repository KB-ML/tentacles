import type { EventCallable, StoreWritable } from "effector";

type DataMapStore = StoreWritable<Record<string, Record<string, unknown>>>;
type FieldUpdatedEvent = EventCallable<{ id: string; field: string; value: unknown }>;

/**
 * Registry for shared model-level .on() handlers.
 *
 * When fn does `$count.on(increment, n => n + 1)`, instead of creating a per-instance
 * handler, we register the reducer at the model level. ONE $dataMap.on() handler per
 * contract event serves ALL instances.
 */
export class SharedOnRegistry {
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

  has(clock: EventCallable<unknown>, fieldName: string): boolean {
    return this.reducers.get(clock)?.has(fieldName) ?? false;
  }
}

/**
 * Zero-cost proxy for a contract state field.
 *
 * NOT an effector store — no graph nodes until materialized. Delegates:
 * - .getState() → reads $dataMap (O(1), no node)
 * - .defaultState → reads $dataMap default (O(1), no node)
 * - .set(value) → prepends on shared _dataMapFieldUpdated (1 node, created lazily)
 * - .on(event, reducer) → shared model-level $dataMap handler (no per-instance node)
 * - .map()/.graphite/combine(it) → MATERIALIZES into real store (rare, lazy)
 *
 * Class-based (not plain object) so methods/getters live on the prototype — allocation
 * is O(instance fields) rather than O(methods+getters) per instance.
 */
class FieldProxy<T> {
  readonly kind = "store";
  readonly targetable = true;

  private _materialized: StoreWritable<T> | null = null;

  constructor(
    private readonly _dataMap: DataMapStore,
    private readonly _instanceId: string,
    private readonly _fieldName: string,
    private readonly _fieldUpdated: FieldUpdatedEvent,
    private readonly _sharedOnRegistry: SharedOnRegistry,
    private readonly _materializeFn: () => StoreWritable<T>,
    private readonly _instanceToModelEvent?: Map<EventCallable<unknown>, EventCallable<unknown>>,
  ) {}

  private _materialize(): StoreWritable<T> {
    if (!this._materialized) this._materialized = this._materializeFn();
    return this._materialized;
  }

  getState(): T {
    if (this._materialized) return this._materialized.getState();
    const entry = this._dataMap.getState()[this._instanceId];
    return (entry ? entry[this._fieldName] : undefined) as T;
  }

  // .set — LAZY prepend on shared _dataMapFieldUpdated. First access creates the
  // prepend (1 effector node) and caches it as a direct own-property, replacing
  // this getter so subsequent reads skip the getter call entirely.
  get set(): EventCallable<T> {
    const id = this._instanceId;
    const field = this._fieldName;
    const setEvent = this._fieldUpdated.prepend((value: T) => ({ id, field, value }));
    Object.defineProperty(this, "set", {
      value: setEvent,
      configurable: true,
      writable: false,
      enumerable: false,
    });
    return setEvent;
  }

  on(clock: EventCallable<unknown>, reducer: (state: T, payload: unknown) => T): this {
    const modelEvent = this._instanceToModelEvent?.get(clock);
    if (modelEvent) {
      if (!this._sharedOnRegistry.has(modelEvent, this._fieldName)) {
        this._sharedOnRegistry.register(
          modelEvent,
          this._fieldName,
          reducer as (state: unknown, payload: unknown) => unknown,
        );
      }
    } else {
      this._materialize().on(clock, reducer);
    }
    return this;
  }

  off(clock: EventCallable<unknown>): this {
    if (this._materialized) this._materialized.off(clock);
    return this;
  }

  // ═══ Materialization triggers (rare — only when effector internals poke the store) ═══

  get graphite() {
    return (this._materialize() as unknown as Record<string, unknown>).graphite;
  }
  get sid() {
    return this._materialized?.sid ?? null;
  }
  get stateRef() {
    return (this._materialize() as unknown as Record<string, unknown>).stateRef;
  }
  get updates() {
    return this._materialize().updates;
  }
  get subscribe() {
    const m = this._materialize();
    return m.subscribe.bind(m);
  }
  get watch() {
    const m = this._materialize();
    return m.watch.bind(m);
  }
  get map() {
    const m = this._materialize();
    return m.map.bind(m) as StoreWritable<T>["map"];
  }
  get compositeName() {
    return (this._materialize() as unknown as Record<string, unknown>).compositeName;
  }
  get or() {
    return (this._materialize() as unknown as Record<string, unknown>).or;
  }
  get and() {
    return (this._materialize() as unknown as Record<string, unknown>).and;
  }
  get defaultState(): T {
    if (this._materialized)
      return (this._materialized as StoreWritable<T> & { defaultState: T }).defaultState;
    const store = this._dataMap as DataMapStore & {
      defaultState: Record<string, Record<string, unknown>>;
    };
    const entry = store.defaultState[this._instanceId];
    return (entry ? entry[this._fieldName] : undefined) as T;
  }
  get shortName() {
    if (this._materialized)
      return (this._materialized as unknown as Record<string, unknown>).shortName;
    return this._fieldName;
  }
}

export function createFieldProxy<T>(
  $dataMap: DataMapStore,
  instanceId: string,
  fieldName: string,
  fieldUpdated: FieldUpdatedEvent,
  sharedOnRegistry: SharedOnRegistry,
  materializeFn: () => StoreWritable<T>,
  instanceToModelEvent?: Map<EventCallable<unknown>, EventCallable<unknown>>,
): StoreWritable<T> {
  return new FieldProxy<T>(
    $dataMap,
    instanceId,
    fieldName,
    fieldUpdated,
    sharedOnRegistry,
    materializeFn,
    instanceToModelEvent,
  ) as unknown as StoreWritable<T>;
}
