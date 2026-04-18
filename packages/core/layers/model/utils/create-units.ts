import { createEvent, type EventCallable, type StoreWritable, sample } from "effector";
import type {
  ContractComputed,
  ContractEntity,
  ContractFieldKind,
  ContractRef,
  ContractStore,
} from "../../contract";
import { createFieldProxy } from "../field-proxy";
import type { Model } from "../model";
import type { SidRegistry } from "../sid-registry";
import type { ModelInstanceId } from "../types";
import { createVirtualFieldStore } from "../virtual-field-store";

/** Pre-categorized field lists passed from Model to avoid per-instance kind-checking. */
export interface CategorizedFields {
  stateFieldKeys: string[];
  eventFieldKeys: string[];
  refFieldKeys: string[];
  inverseFieldKeys: string[];
  computedFieldKeys: string[];
  /** Pre-computed prefix mapping: { from, to } where to = "$"+from for state/computed/inverse */
  prefixMapping: Array<{ from: string; to: string }>;
}

export function createUnits(
  contract: Record<string, ContractEntity<ContractFieldKind, unknown> | undefined>,
  makeSid: (field: string) => string,
  registry: SidRegistry,
  owningModel: Model<any, any, any>,
  $dataMap: StoreWritable<Record<string, Record<string, unknown>>>,
  getInstanceSlice: () => StoreWritable<Record<string, unknown>>,
  instanceId: ModelInstanceId,
  fieldUpdated: EventCallable<{ id: string; field: string; value: unknown }>,
  fields: CategorizedFields,
  getSliceFieldUpdate?: () => EventCallable<{ field: string; value: unknown }> | undefined,
): { units: Record<string, unknown>; registeredSids: string[] } {
  const units: Record<string, unknown> = {};
  const registeredSids: string[] = [];
  const id = String(instanceId);

  // Event fields → LAZY prepend on model-level events.
  // The prepend (1 effector node) is only created when the event is called or
  // its graphite/prepend/watch is accessed. For .on() translation, the mapping
  // from event proxy → model event is registered upfront (zero-cost).
  const instanceToModelEvent = new Map<EventCallable<unknown>, EventCallable<unknown>>();
  for (const key of fields.eventFieldKeys) {
    const modelEvent = owningModel.getModelEvent(key);
    if (modelEvent) {
      let _prepend: EventCallable<unknown> | null = null;
      const ensurePrepend = () => {
        if (!_prepend) {
          _prepend = modelEvent.prepend((payload: unknown) => ({ id, payload }));
        }
        return _prepend;
      };
      const eventProxy: Record<string, unknown> = {
        get kind() {
          return "event";
        },
        get sid() {
          return null;
        },
        get graphite() {
          return (ensurePrepend() as unknown as Record<string, unknown>).graphite;
        },
        get prepend() {
          return ensurePrepend().prepend.bind(ensurePrepend());
        },
        get watch() {
          return ensurePrepend().watch.bind(ensurePrepend());
        },
        get subscribe() {
          return ensurePrepend().subscribe.bind(ensurePrepend());
        },
        get map() {
          return ensurePrepend().map.bind(ensurePrepend());
        },
        get filter() {
          return (ensurePrepend() as unknown as Record<string, Function>).filter?.bind(
            ensurePrepend(),
          );
        },
        get filterMap() {
          return (ensurePrepend() as unknown as Record<string, Function>).filterMap?.bind(
            ensurePrepend(),
          );
        },
        get shortName() {
          return key;
        },
        get compositeName() {
          return (ensurePrepend() as unknown as Record<string, unknown>).compositeName;
        },
        get targetable() {
          return true;
        },
      };
      // Make callable — firing the event creates the prepend and dispatches
      const callable = Object.assign(
        (...args: unknown[]) => (ensurePrepend() as Function)(...args),
        eventProxy,
      );
      // Register mapping: this proxy → model event (for field proxy .on() translation)
      instanceToModelEvent.set(
        callable as unknown as EventCallable<unknown>,
        modelEvent as EventCallable<unknown>,
      );
      units[key] = callable;
    } else {
      const event = createEvent({ sid: makeSid(key) });
      units[key] = event;
      registry.registerUnit(event, undefined, registeredSids);
    }
  }

  // State fields → zero-cost proxies (no effector nodes).
  // Materialized into real virtual stores only on .map()/.graphite/combine access.
  const sharedOnRegistry = owningModel.getSharedOnRegistry();
  for (const key of fields.stateFieldKeys) {
    const fieldSetEvent = owningModel.getFieldSetEvent(key);
    if (fieldSetEvent && sharedOnRegistry) {
      units[key] = createFieldProxy(
        $dataMap,
        id,
        key,
        fieldSetEvent,
        sharedOnRegistry,
        // Materialize as .map() from $dataMap with writeback for .on() support.
        () => {
          const fieldName = key;
          const $derived = $dataMap.map(
            (map) => {
              const entry = map[id];
              return (entry ? entry[fieldName] : undefined) as unknown;
            },
            { skipVoid: false },
          ) as StoreWritable<unknown>;
          const s = $derived as StoreWritable<unknown> & {
            targetable: boolean;
            graphite: { meta: { derived: number } };
          };
          s.targetable = true;
          s.graphite.meta.derived = 0;
          // Writeback: when materialized store changes (from .on() or allSettled),
          // sync back to $dataMap so queries and serialize see the update.
          sample({
            clock: $derived.updates,
            source: $dataMap,
            fn: (map: Record<string, Record<string, unknown>>, value: unknown) => {
              const entry = map[id];
              if (!entry || entry[fieldName] === value) return map;
              return { ...map, [id]: { ...entry, [fieldName]: value } };
            },
            target: $dataMap,
          });
          return s;
        },
        instanceToModelEvent,
      );
    } else {
      units[key] = createVirtualFieldStore(
        $dataMap,
        getInstanceSlice(),
        id,
        key,
        fieldUpdated,
        getSliceFieldUpdate,
      );
    }
  }

  // Ref fields → ref API (many/one) with virtual $ids/$id store
  for (const key of fields.refFieldKeys) {
    const refEntity = contract[key] as ContractRef;
    const targetModel = owningModel.resolveRefTarget(key, refEntity);
    const { api, registeredSids: refSids } = targetModel.createRefApi(
      refEntity.cardinality,
      key,
      makeSid,
      undefined,
      instanceId,
      $dataMap,
      id,
      getInstanceSlice(),
      getSliceFieldUpdate,
    );
    units[key] = api;
    registeredSids.push(...refSids);
  }

  // Inverse fields → read-only resolved stores
  for (const key of fields.inverseFieldKeys) {
    const inverseIndex = owningModel.getInverseIndex(key);
    if (inverseIndex && instanceId != null) {
      units[key] = inverseIndex.$resolvedForTarget(instanceId);
    }
  }

  // Computed fields (second pass) — depend on all other units existing
  if (fields.computedFieldKeys.length > 0) {
    // Build $-prefixed view for computed factories using pre-computed mapping
    const prefixedView: Record<string, unknown> = {};
    for (const { from, to } of fields.prefixMapping) {
      if (from in units) prefixedView[to] = units[from];
    }
    for (const key of fields.computedFieldKeys) {
      const computedEntity = contract[key] as ContractComputed<unknown>;
      const store = computedEntity.factory(prefixedView);
      units[key] = store;
      prefixedView[`$${key}`] = store;
    }
  }

  // Third pass: wire resetOn — reset store to default when source stores change
  for (const key of fields.stateFieldKeys) {
    const storeEntity = contract[key] as ContractStore<unknown>;
    if (!storeEntity.resetOn || storeEntity.resetOn.length === 0) continue;

    const target = units[key] as StoreWritable<unknown>;
    const defaultValue = storeEntity.defaultValue;

    for (const sourceField of storeEntity.resetOn) {
      const source = units[sourceField] as StoreWritable<unknown> | undefined;
      if (source) {
        sample({ clock: source.updates, fn: () => defaultValue, target });
      }
    }
  }

  return { units, registeredSids };
}
