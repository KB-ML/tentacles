import { type EventCallable, type StoreWritable, sample } from "effector";

type FieldUpdatedEvent = EventCallable<{ id: string; field: string; value: unknown }>;
type SliceFieldUpdateGetter = () => EventCallable<{ field: string; value: unknown }> | undefined;

/**
 * Creates a virtual field store backed by `$dataMap` (matching state-field derivation).
 *
 * The store is a `.map()` derivation over `$dataMap` — a real effector store that works
 * with `combine()`, `sample()`, `is.store()`. `.set()` routes through the shared
 * `fieldUpdated` event and `.on()` routes through a `sample({ target: $dataMap })`.
 *
 * Historically this derived from a per-instance `$instanceSlice` for O(1) mutation,
 * but that broke SSR hydration via `@effector/next`: `$slice` values in the client
 * `sidMap` never propagated through downstream `.map()` derivations after subsequent
 * server cycles, so refs returned stale ids. Deriving from `$dataMap` matches how
 * state fields already work and keeps hydration correct.
 */
export function createVirtualFieldStore<T>(
  $dataMap: StoreWritable<Record<string, Record<string, unknown>>>,
  _$instanceSlice: StoreWritable<Record<string, unknown>> | undefined,
  instanceId: string,
  fieldName: string,
  fieldUpdated: FieldUpdatedEvent,
  _getSliceFieldUpdate?: SliceFieldUpdateGetter,
): StoreWritable<T> {
  const $derived = $dataMap.map(
    (map) => {
      const entry = map[instanceId];
      if (!entry || !(fieldName in entry)) return undefined as T;
      return entry[fieldName] as T;
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

  // Writeback: when the derived store is targeted directly (resetOn, allSettled,
  // sample({ target })), sync the new value back to $dataMap so queries and
  // serialize see the update.
  sample({
    clock: $derived.updates,
    source: $dataMap,
    fn: (map: Record<string, Record<string, unknown>>, value: T) => {
      const entry = map[instanceId];
      if (!entry || entry[fieldName] === value) return map;
      return { ...map, [instanceId]: { ...entry, [fieldName]: value } };
    },
    target: $dataMap,
  });

  const dataMapHandlers = new Map<EventCallable<unknown>, true>();

  // .set event — LAZY: created on first access to save graph nodes during bulk creation.
  let _set: EventCallable<T> | null = null;
  const ensureSet = (): EventCallable<T> => {
    if (!_set) {
      _set = fieldUpdated.prepend((value: T) => ({
        id: instanceId,
        field: fieldName,
        value,
      }));
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

  // Override .on() — route through $dataMap directly (same shape as state-field .on()).
  const proxy = $derived as StoreWritable<T>;
  Object.defineProperty(proxy, "on", {
    value(clock: EventCallable<unknown>, reducer: (state: T, payload: unknown) => T) {
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
      dataMapHandlers.set(clock, true);
      return proxy;
    },
    configurable: true,
  });

  return proxy;
}
