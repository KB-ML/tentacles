import { createStore, type EventCallable, type Store } from "effector";
import { type ContractEntity, ContractFieldKind, type ContractStore } from "../contract";
import { TentaclesError } from "../shared/tentacles-error";

/**
 * Reactive index state derived from $dataMap. Stored inside an effector store
 * so per-scope mirrors come for free from effector's scope semantics.
 *
 * Updates are immutable copy-on-write per affected field — fork()-safe.
 */
export interface IndexState {
  /** field → value → Set<id>. Read by query layer for O(1) eq/oneOf candidate lookup. */
  readonly byValue: ReadonlyMap<string, ReadonlyMap<unknown, ReadonlySet<string>>>;
  /** id → field → value. Used internally for cleanup on remove/update. */
  readonly byId: ReadonlyMap<string, ReadonlyMap<string, unknown>>;
}

type DataMapSetEvent = EventCallable<{ id: string; data: Record<string, unknown> }>;
type DataMapSetManyEvent = EventCallable<Record<string, Record<string, unknown>>>;
type DataMapFieldUpdatedEvent = EventCallable<{ id: string; field: string; value: unknown }>;
type DataMapRemovedEvent = EventCallable<string>;
type DataMapClearedEvent = EventCallable<void>;

interface IndexEvents {
  dataMapSet: DataMapSetEvent;
  dataMapSetMany: DataMapSetManyEvent;
  dataMapFieldUpdated: DataMapFieldUpdatedEvent;
  dataMapRemoved: DataMapRemovedEvent;
  dataMapCleared: DataMapClearedEvent;
}

/**
 * Per-model secondary indexes. Used internally by the query layer to speed up
 * `eq` / `oneOf` lookups against `$dataMap` for fields marked `.unique()` /
 * `.index()` in the contract.
 *
 * The index is exposed as a single derived store (`$index`). Per-scope correctness
 * is automatic via effector's scope routing — `scope.getState($index)` returns the
 * index built from that scope's mutations.
 *
 * For SSR fork({values}) hydration where the dataMap is bulk-initialized but events
 * are not fired, the index will be empty in that scope and the query layer falls
 * back to a full scan (still correct, just not O(1)).
 */
export class ModelIndexes {
  public readonly hasIndexes: boolean;
  public readonly uniqueFields: ReadonlySet<string>;
  public readonly indexedFields: ReadonlySet<string>;
  /** Union of unique + indexed field names — every field tracked by the index. */
  private readonly trackedFields: ReadonlySet<string>;
  private _$index?: Store<IndexState>;

  constructor(contract: Record<string, ContractEntity<ContractFieldKind, unknown>>) {
    const unique = new Set<string>();
    const indexed = new Set<string>();
    for (const key of Object.keys(contract)) {
      const entity = contract[key];
      if (!entity || entity.kind !== ContractFieldKind.State) continue;
      const storeEntity = entity as ContractStore<unknown>;
      if (storeEntity.isUnique) unique.add(key);
      else if (storeEntity.isIndexed) indexed.add(key);
    }
    this.uniqueFields = unique;
    this.indexedFields = indexed;
    this.trackedFields = new Set([...unique, ...indexed]);
    this.hasIndexes = this.trackedFields.size > 0;
  }

  /**
   * Wire the $index store to model-level dataMap events. Must be called inside
   * the model's withRegion() so the store inherits the proper SID prefix.
   * No-op if there are no indexed fields.
   */
  wire(modelName: string, events: IndexEvents): void {
    if (!this.hasIndexes || this._$index) return;

    const fields = this.trackedFields;

    const initial: IndexState = {
      byValue: new Map(),
      byId: new Map(),
    };

    const $index = createStore<IndexState>(initial, {
      sid: `tentacles:${modelName}:__index__`,
      serialize: "ignore",
    });

    $index
      .on(events.dataMapSet, (state, { id, data }) => addEntry(state, id, data, fields))
      .on(events.dataMapSetMany, (state, entries) => {
        let next = state;
        for (const id of Object.keys(entries)) {
          next = addEntry(next, id, entries[id]!, fields);
        }
        return next;
      })
      .on(events.dataMapFieldUpdated, (state, { id, field, value }) => {
        if (!fields.has(field)) return state;
        return updateField(state, id, field, value);
      })
      .on(events.dataMapRemoved, (state, id) => removeEntry(state, id))
      .on(events.dataMapCleared, () => initial);

    this._$index = $index;
  }

  /**
   * The reactive index store. `undefined` when the model has no indexed fields.
   * Consumers (the query layer) should treat `undefined` as "no index optimization
   * available — always fall back to full scan".
   */
  get $index(): Store<IndexState> | undefined {
    return this._$index;
  }

  /**
   * Validate uniqueness of a field write against a scope-correct dataMap snapshot.
   * Throws TentaclesError on violation.
   *
   * O(N) walk over the dataMap — acceptable since unique-field writes are rare.
   * Called from inside the `_$dataMap.on()` reducer where the `map` parameter
   * is already scope-correct (effector routes the reducer per scope).
   */
  validateUnique(
    map: Record<string, Record<string, unknown>>,
    id: string,
    field: string,
    value: unknown,
  ): void {
    if (!this.uniqueFields.has(field)) return;
    for (const otherId of Object.keys(map)) {
      if (otherId === id) continue;
      if (map[otherId]?.[field] === value) {
        throw new TentaclesError(
          `Unique constraint violated on field '${field}': ` +
            `value '${String(value)}' already exists on instance '${otherId}'`,
        );
      }
    }
  }

  /**
   * Validate uniqueness of all unique fields for a single insert against a
   * scope-correct dataMap snapshot. Throws on first violation. Cheap no-op when
   * the model has no unique fields.
   */
  validateUniqueInsert(
    map: Record<string, Record<string, unknown>>,
    id: string,
    data: Record<string, unknown>,
  ): void {
    if (this.uniqueFields.size === 0) return;
    for (const field of this.uniqueFields) {
      if (!(field in data)) continue;
      this.validateUnique(map, id, field, data[field]);
    }
  }

  /**
   * Validate uniqueness for a batch insert. Each entry is checked against:
   *   1. The existing dataMap (skipping ids being replaced)
   *   2. Other entries in the same batch (catches batch-internal collisions)
   * Throws on first violation. Cheap no-op when the model has no unique fields.
   */
  validateUniqueBatch(
    map: Record<string, Record<string, unknown>>,
    entries: Record<string, Record<string, unknown>>,
  ): void {
    if (this.uniqueFields.size === 0) return;
    const entryIds = Object.keys(entries);
    for (const newId of entryIds) {
      const newData = entries[newId]!;
      for (const field of this.uniqueFields) {
        if (!(field in newData)) continue;
        const newValue = newData[field];
        // Existing map: skip ids being replaced in this batch
        for (const existingId of Object.keys(map)) {
          if (existingId === newId || existingId in entries) continue;
          if (map[existingId]?.[field] === newValue) {
            throw new TentaclesError(
              `Unique constraint violated on field '${field}': ` +
                `value '${String(newValue)}' already exists on instance '${existingId}'`,
            );
          }
        }
        // Other entries in the same batch
        for (const otherId of entryIds) {
          if (otherId === newId) continue;
          if (entries[otherId]?.[field] === newValue) {
            throw new TentaclesError(
              `Unique constraint violated on field '${field}': ` +
                `value '${String(newValue)}' already exists on instance '${otherId}'`,
            );
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Immutable index helpers (copy-on-write per affected field).
//
// Each helper returns a new IndexState wrapper. Inner Maps for unaffected
// fields are reused by reference — only the changed slices are cloned.
// This is fork()-safe: no mutation leaks across scopes.
// ─────────────────────────────────────────────────────────────────────────

type MutableState = {
  byValue: Map<string, Map<unknown, Set<string>>>;
  byId: Map<string, Map<string, unknown>>;
};

function cloneState(state: IndexState): MutableState {
  return {
    byValue: new Map(state.byValue as Map<string, Map<unknown, Set<string>>>),
    byId: new Map(state.byId as Map<string, Map<string, unknown>>),
  };
}

function ensureFieldMap(
  next: MutableState,
  state: IndexState,
  field: string,
  cloned: Set<string>,
): Map<unknown, Set<string>> {
  if (cloned.has(field)) {
    return next.byValue.get(field)!;
  }
  const existing = state.byValue.get(field) as Map<unknown, Set<string>> | undefined;
  const fieldMap = existing ? new Map(existing) : new Map<unknown, Set<string>>();
  next.byValue.set(field, fieldMap);
  cloned.add(field);
  return fieldMap;
}

function cloneIdSet(fieldMap: Map<unknown, Set<string>>, value: unknown): Set<string> {
  const existing = fieldMap.get(value);
  if (existing) {
    const cloned = new Set(existing);
    fieldMap.set(value, cloned);
    return cloned;
  }
  const fresh = new Set<string>();
  fieldMap.set(value, fresh);
  return fresh;
}

function addEntry(
  state: IndexState,
  id: string,
  data: Record<string, unknown>,
  fields: ReadonlySet<string>,
): IndexState {
  const next = cloneState(state);
  const clonedFields = new Set<string>();

  // Clean up any prior bindings for this id (handles replacement / re-create)
  const oldIdMap = state.byId.get(id);
  if (oldIdMap) {
    for (const [field, oldValue] of oldIdMap) {
      const fieldMap = ensureFieldMap(next, state, field, clonedFields);
      const idSet = cloneIdSet(fieldMap, oldValue);
      idSet.delete(id);
      if (idSet.size === 0) fieldMap.delete(oldValue);
    }
  }

  // Add new bindings for tracked fields present in `data`
  const newIdMap = new Map<string, unknown>();
  for (const field of fields) {
    if (!(field in data)) continue;
    const value = data[field];
    const fieldMap = ensureFieldMap(next, state, field, clonedFields);
    const idSet = cloneIdSet(fieldMap, value);
    idSet.add(id);
    newIdMap.set(field, value);
  }

  next.byId.set(id, newIdMap);
  return next;
}

function updateField(state: IndexState, id: string, field: string, value: unknown): IndexState {
  const oldIdMap = state.byId.get(id);
  if (!oldIdMap) return state;
  const oldValue = oldIdMap.get(field);
  if (Object.is(oldValue, value)) return state;

  const next = cloneState(state);
  const clonedFields = new Set<string>();
  const fieldMap = ensureFieldMap(next, state, field, clonedFields);

  // Remove old binding (if any)
  if (oldIdMap.has(field)) {
    const oldSet = cloneIdSet(fieldMap, oldValue);
    oldSet.delete(id);
    if (oldSet.size === 0) fieldMap.delete(oldValue);
  }

  // Add new binding
  const newSet = cloneIdSet(fieldMap, value);
  newSet.add(id);

  // Clone the id row and update the field binding
  const newIdMap = new Map(oldIdMap);
  newIdMap.set(field, value);
  next.byId.set(id, newIdMap);

  return next;
}

function removeEntry(state: IndexState, id: string): IndexState {
  const oldIdMap = state.byId.get(id);
  if (!oldIdMap) return state;

  const next = cloneState(state);
  const clonedFields = new Set<string>();

  for (const [field, value] of oldIdMap) {
    const fieldMap = ensureFieldMap(next, state, field, clonedFields);
    const idSet = cloneIdSet(fieldMap, value);
    idSet.delete(id);
    if (idSet.size === 0) fieldMap.delete(value);
  }

  next.byId.delete(id);
  return next;
}
