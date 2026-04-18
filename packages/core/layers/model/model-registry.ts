import {
  combine,
  createEvent,
  createStore,
  type EventCallable,
  type Store,
  type StoreWritable,
} from "effector";
import { type CompoundKey, InstanceCache } from "./instance-cache";
import type { ModelInstanceId } from "./types";

export class ModelRegistry<Instance> {
  public readonly $ids: Store<ModelInstanceId[]>;

  public readonly add: EventCallable<ModelInstanceId>;
  public readonly addMany: EventCallable<ModelInstanceId[]>;
  public readonly removed: EventCallable<ModelInstanceId>;
  public readonly clear: EventCallable<void>;
  public readonly reorder: EventCallable<ModelInstanceId[]>;

  /** O(1) membership check derived from $ids. Used internally by instance() and query layer. */
  public readonly $idSet: Store<Set<ModelInstanceId>>;

  private _$pkeys?: Store<CompoundKey[]>;
  private _$count?: Store<number>;
  private _$instances?: Store<Instance[]>;
  private readonly _instanceStores = new Map<string, Store<Instance | null>>();
  private readonly _partialKeyStores = new Map<string, Store<Instance[]>>();

  private readonly getCompoundKey: (id: string) => CompoundKey | undefined;
  private readonly getInstance: (id: ModelInstanceId) => Instance | undefined;
  /**
   * Scope-aware getInstance: receives $dataMap snapshot so reconstruction
   * can read scoped data (e.g. after fork({ values }) on the client).
   */
  private readonly getInstanceScoped: (
    id: ModelInstanceId,
    dataMap: Record<string, Record<string, unknown>>,
  ) => Instance | undefined;
  private readonly getDataMap: () => StoreWritable<Record<string, Record<string, unknown>>>;

  constructor(
    modelName: string,
    getCompoundKey: (id: string) => CompoundKey | undefined,
    getInstance: (id: ModelInstanceId) => Instance | undefined,
    getDataMap: () => StoreWritable<Record<string, Record<string, unknown>>>,
    getInstanceScoped: (
      id: ModelInstanceId,
      dataMap: Record<string, Record<string, unknown>>,
    ) => Instance | undefined,
  ) {
    this.getCompoundKey = getCompoundKey;
    this.getInstance = getInstance;
    this.getInstanceScoped = getInstanceScoped;
    this.getDataMap = getDataMap;

    this.add = createEvent<ModelInstanceId>();
    this.addMany = createEvent<ModelInstanceId[]>();
    this.removed = createEvent<ModelInstanceId>();
    this.clear = createEvent<void>();
    this.reorder = createEvent<ModelInstanceId[]>();

    this.$ids = createStore<ModelInstanceId[]>([], {
      sid: `tentacles:${modelName}:__registry__:ids`,
    })
      .on(this.add, (ids, id) => {
        // Fast path: ID is new (most common case during create())
        if (!ids.includes(id)) return [...ids, id];
        // Slow path: replacing existing ID — must remove old position
        return [...ids.filter((x) => x !== id), id];
      })
      .on(this.addMany, (ids, newIds) => {
        // Fast path: fresh model, no existing IDs to deduplicate
        if (ids.length === 0) return newIds;
        const newSet = new Set(newIds);
        const kept = ids.filter((x) => !newSet.has(x));
        // Fast path: no replacements, just append
        if (kept.length === ids.length) return [...ids, ...newIds];
        return [...kept, ...newIds];
      })
      .on(this.removed, (ids, id) => {
        const idx = ids.indexOf(id);
        if (idx === -1) return ids;
        const next = ids.slice();
        next.splice(idx, 1);
        return next;
      })
      .on(this.clear, () => [])
      .on(this.reorder, (_, newOrder) => newOrder);

    // O(1) Set derived from $ids — used for fast membership checks in instance()
    // and query-field updated filters. Avoids O(N) Array.includes() in hot paths.
    // Kept as derived store (not primary) for SSR correctness: fork({ values })
    // hydrates $ids, and $idSet must recompute from the hydrated $ids automatically.
    this.$idSet = this.$ids.map((ids) => new Set(ids));

    // Clean up memoized lookup stores when instances are removed or cleared
    this.removed.watch((id) => {
      this._instanceStores.delete(String(id));
    });
    this.clear.watch(() => {
      this._instanceStores.clear();
      this._partialKeyStores.clear();
    });
  }

  get $pkeys(): Store<CompoundKey[]> {
    if (!this._$pkeys) {
      this._$pkeys = this.$ids.map((ids) =>
        ids
          .map((id) => this.getCompoundKey(String(id)))
          .filter((pk): pk is CompoundKey => pk != null),
      );
    }
    return this._$pkeys;
  }

  get $count(): Store<number> {
    if (!this._$count) {
      this._$count = this.$ids.map((ids) => ids.length);
    }
    return this._$count;
  }

  get $instances(): Store<Instance[]> {
    if (!this._$instances) {
      // combine with $dataMap so reconstruction can read scoped data
      // (e.g. after fork({ values }) on the client where global $dataMap is empty).
      // Stable reference: avoid re-renders when instances haven't changed.
      let prev: Instance[] = [];
      this._$instances = combine(this.$ids, this.getDataMap(), (ids, dataMap) => {
        const result = ids
          .map((id) => this.getInstanceScoped(id, dataMap))
          .filter(Boolean) as Instance[];
        if (result.length === prev.length && result.every((inst, i) => inst === prev[i])) {
          return prev;
        }
        prev = result;
        return result;
      });
    }
    return this._$instances;
  }

  instance(id: ModelInstanceId): Store<Instance | null>;
  instance(
    ...parts: [string | number, string | number, ...(string | number)[]]
  ): Store<Instance | null>;
  instance(...args: (string | number)[]): Store<Instance | null> {
    const serializedId =
      args.length === 1
        ? String(args[0])
        : args.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);

    let store = this._instanceStores.get(serializedId);
    if (store) return store;

    // combine with $idSet (O(1) lookup) and $dataMap for scoped reconstruction.
    // .map() suppresses same-value (===) updates — combine() alone does not
    // in scoped contexts, causing spurious EachItem rerenders.
    store = combine(this.$idSet, this.getDataMap(), (idSet, dataMap) => {
      if (!idSet.has(serializedId)) return null;
      // Fast path: already cached globally
      const cached = this.getInstance(serializedId);
      if (cached) return cached;
      // Scope-aware: reconstruct from scoped $dataMap
      return this.getInstanceScoped(serializedId, dataMap) ?? null;
    }).map((inst) => inst, { skipVoid: false });

    this._instanceStores.set(serializedId, store);
    return store;
  }

  byPartialKey(...prefix: [string | number, ...(string | number)[]]): Store<Instance[]> {
    const memoKey = prefix.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);

    let store = this._partialKeyStores.get(memoKey);
    if (store) return store;

    const prefixStrs = prefix.map(String);
    const prefixLen = prefixStrs.length;

    // combine with $dataMap so byPartialKey works against SSR-hydrated scopes
    // where the imperative compound-key map and global cache are empty. The
    // compound key parts are parsed from the serialised id string directly
    // (instead of the cache's compoundKeys map), and instances are reconstructed
    // via the scope-aware path.
    store = combine(this.$ids, this.getDataMap(), (ids, dataMap) => {
      const results: Instance[] = [];
      for (const id of ids) {
        const idStr = String(id);
        const parts = idStr.split(InstanceCache.COMPOUND_PK_DELIMITER);
        if (parts.length < prefixLen) continue;
        let matches = true;
        for (let i = 0; i < prefixLen; i++) {
          if (parts[i] !== prefixStrs[i]) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        const cached = this.getInstance(id);
        if (cached) {
          results.push(cached);
          continue;
        }
        const reconstructed = this.getInstanceScoped(id, dataMap);
        if (reconstructed) results.push(reconstructed);
      }
      return results;
    });

    this._partialKeyStores.set(memoKey, store);
    return store;
  }
}
