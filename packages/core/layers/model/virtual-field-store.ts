import { type EventCallable, type StoreWritable, sample } from "effector";

type FieldUpdatedEvent = EventCallable<{ id: string; field: string; value: unknown }>;
type SliceFieldUpdateGetter = () => EventCallable<{ field: string; value: unknown }> | undefined;

/**
 * Creates a virtual field store backed by $instanceSlice.
 *
 * The store is a `.map()` derivation — a real effector store that works with combine(),
 * sample(), is.store(). `.set()` and `.on()` are overridden to route through $instanceSlice
 * (O(1) per mutation). No per-field writeback samples — $instanceSlice → $dataMap sync is
 * handled by a single sample per instance in model.ts.
 *
 * For scoped mutations: `allSettled(inst.$field.set, { scope, params })` targets the .set
 * event, which routes through the full validation + sync path.
 */
export function createVirtualFieldStore<T>(
  $dataMap: StoreWritable<Record<string, Record<string, unknown>>>,
  $instanceSlice: StoreWritable<Record<string, unknown>>,
  instanceId: string,
  fieldName: string,
  fieldUpdated: FieldUpdatedEvent,
  getSliceFieldUpdate?: SliceFieldUpdateGetter,
): StoreWritable<T> {
  const $derived = $instanceSlice.map(
    (slice) => {
      if (!(fieldName in slice)) return undefined as T;
      return slice[fieldName] as T;
    },
    { skipVoid: false },
  );

  // Make targetable so sample({ target: $derived }) works (needed for resetOn, computed, user wiring).
  const store = $derived as StoreWritable<T> & {
    targetable: boolean;
    graphite: { meta: { derived: number } };
  };
  store.targetable = true;
  store.graphite.meta.derived = 0;

  // Single writeback: $derived.updates → $instanceSlice (NOT $dataMap — that's handled
  // by the per-instance sample in model.ts). Needed when $derived is targeted directly
  // (resetOn, allSettled, sample({ target })). Replaces the old 2-sample-per-field with 1.
  sample({
    clock: $derived.updates,
    source: $instanceSlice,
    fn: (slice: Record<string, unknown>, value: T) => {
      if (slice[fieldName] === value) return slice;
      return { ...slice, [fieldName]: value };
    },
    target: $instanceSlice,
  });

  const dataMapHandlers = new Map<EventCallable<unknown>, true>();

  // .set event — LAZY: created on first access to save graph nodes during bulk creation.
  let _set: EventCallable<T> | null = null;
  const ensureSet = (): EventCallable<T> => {
    if (!_set) {
      const sliceFieldUpdate = getSliceFieldUpdate?.();
      if (sliceFieldUpdate) {
        // Route through fieldUpdated for validation + $dataMap sync.
        _set = fieldUpdated.prepend((value: T) => ({
          id: instanceId,
          field: fieldName,
          value,
        }));
        // After $dataMap validates + updates, sync to $instanceSlice (O(1)).
        sample({
          clock: _set,
          source: $dataMap,
          filter: (map: Record<string, Record<string, unknown>>, value: T) => {
            const entry = map[instanceId];
            return entry != null && entry[fieldName] === value;
          },
          fn: (_map: Record<string, Record<string, unknown>>, value: T) => ({
            field: fieldName,
            value,
          }),
          target: sliceFieldUpdate,
        });
      } else {
        // Fallback: route through fieldUpdated → $dataMap (legacy path for reconstruct)
        _set = fieldUpdated.prepend((value: T) => ({
          id: instanceId,
          field: fieldName,
          value,
        }));
      }
      dataMapHandlers.set(_set as EventCallable<unknown>, true);
      Object.defineProperty($derived, "set", { value: _set, configurable: true });
    }
    return _set;
  };
  Object.defineProperty($derived, "set", {
    get: ensureSet,
    configurable: true,
  });

  // Override .off()
  Object.defineProperty($derived, "off", {
    value(clock: EventCallable<unknown>) {
      if (dataMapHandlers.has(clock)) {
        if (_set && clock === _set) {
          const node = clock as unknown as { graphite: { next: unknown[] } };
          node.graphite.next = [];
        }
        dataMapHandlers.delete(clock);
      }
      return $derived;
    },
    configurable: true,
  });

  // Override .on() — updates $instanceSlice directly (O(1)).
  // $dataMap sync happens via the per-instance $instanceSlice → $dataMap sample in model.ts.
  const proxy = $derived as StoreWritable<T>;
  Object.defineProperty(proxy, "on", {
    value(clock: EventCallable<unknown>, reducer: (state: T, payload: unknown) => T) {
      const sfu = getSliceFieldUpdate?.();
      if (sfu) {
        $instanceSlice.on(clock, (slice: Record<string, unknown>, payload: unknown) => {
          const oldVal = slice[fieldName] as T;
          let newVal: T;
          try {
            newVal = reducer(oldVal, payload);
          } catch {
            return slice;
          }
          if (oldVal === newVal) return slice;
          return { ...slice, [fieldName]: newVal };
        });
      } else {
        sample({
          clock,
          source: $dataMap,
          fn: (map: Record<string, Record<string, unknown>>, payload: unknown) => {
            const entry = map[instanceId];
            if (!entry) return map;
            const oldVal = entry[fieldName] as T;
            let newVal: T;
            try {
              newVal = reducer(oldVal, payload);
            } catch {
              return map;
            }
            if (oldVal === newVal) return map;
            return { ...map, [instanceId]: { ...entry, [fieldName]: newVal } };
          },
          target: $dataMap,
        });
      }
      dataMapHandlers.set(clock, true);
      return proxy;
    },
    configurable: true,
  });

  return proxy;
}
