import {
  allSettled,
  clearNode,
  createEvent,
  createNode,
  createStore,
  type EventCallable,
  type Node,
  type Scope,
  type Store,
  type StoreWritable,
  sample,
  withRegion,
} from "effector";
import {
  type ContractEntity,
  ContractFieldKind,
  type ContractInverse,
  type ContractRef,
  type ContractStore,
} from "../contract";
import type { QueryContext } from "../query";
import { type CollectionQuery, QueryDescriptor, QueryRegistry } from "../query";
import { TentaclesError } from "../shared/tentacles-error";
import { SharedOnRegistry } from "./field-proxy";
import { type CompoundKey, InstanceCache } from "./instance-cache";
import { InverseIndex } from "./inverse-index";
import { ModelEffects } from "./model-effects";
import { ModelIndexes } from "./model-indexes";
import { ModelRegistry } from "./model-registry";
import { PrimaryKeyResolver } from "./primary-key-resolver";
import { type ManyEntry, type OneEntry, RefApiFactory } from "./ref-api-factory";
import { ScopeManager } from "./scope-manager";
import { SidRegistry } from "./sid-registry";
import type {
  ContractModel,
  ContractModelFkData,
  ContractModelInverseData,
  ContractModelRefData,
  ContractModelStoreData,
  InstanceMeta,
  ModelInstanceId,
  RefManyApi,
  RefOneApi,
  UpdateData,
} from "./types";
import { type CategorizedFields, createUnits, validateInstanceId } from "./utils";

export type { CompoundKey } from "./instance-cache";
export type PkResult = string | number | CompoundKey;

export type CreateData<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
> = ContractModelStoreData<Contract, Generics> &
  ContractModelRefData<Contract, Generics> &
  ContractModelFkData<Contract> &
  ContractModelInverseData<Contract>;

/** Fields that need model binding: unbound refs (no inline thunk) + inverses */
type BindableFieldNames<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
> = {
  [K in keyof Contract]: Contract[K] extends ContractRef<any, any>
    ? Contract[K]["ref"] extends () => any
      ? never
      : K
    : Contract[K] extends ContractInverse
      ? K
      : never;
}[keyof Contract] &
  string;

type BindConfig<Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>> =
  BindableFieldNames<Contract> extends never
    ? Record<string, never>
    : { [K in BindableFieldNames<Contract>]: (() => Model<any, any>) | undefined };

/** Replaces ContractRef target model types with actual bound model types from .bind() config */
export type ApplyBind<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  B,
> = {
  [K in keyof Contract]: K extends keyof B
    ? B[K] extends () => infer M
      ? Contract[K] extends ContractRef<infer C, any, infer FK>
        ? M extends Model<any, any, any, any>
          ? ContractRef<C, M, FK>
          : Contract[K]
        : Contract[K]
      : Contract[K]
    : Contract[K];
};

type FullInstance<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown> = {},
> = ContractModel<Contract, Generics> &
  Ext &
  InstanceMeta & { "@@unitShape": () => ContractModel<Contract, Generics> & Ext };

type InstanceEntry<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown> = {},
> = {
  model: FullInstance<Contract, Generics, Ext>;
  units: Record<string, unknown>;
  region: Node | null;
  registeredSids: string[];
};

export class Model<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown> = {},
  PkFields extends string = string,
> {
  private static readonly sidRegistry = new SidRegistry();
  private static readonly deletionInProgress = new Set<string>();

  private readonly cache: InstanceCache<InstanceEntry<Contract, Generics, Ext>>;
  private readonly pkResolver: PrimaryKeyResolver<Contract>;
  private readonly refApiFactory: RefApiFactory;
  private readonly scopeManager: ScopeManager<Contract>;
  private registry!: ModelRegistry<FullInstance<Contract, Generics, Ext>>;
  private effects!: ModelEffects<Contract, Generics, FullInstance<Contract, Generics, Ext>>;
  private readonly indexes: ModelIndexes;
  private readonly inverseIndexes = new Map<string, InverseIndex>();
  /** Per-instance standalone stores. Decoupled from $dataMap to avoid O(N) graph traversal on field updates. */
  private readonly _instanceSlices = new Map<string, StoreWritable<Record<string, unknown>>>();
  /** Per-instance field update events: mutate a single field in the instance slice (O(1)). */
  private readonly _instanceSliceFieldUpdates = new Map<
    string,
    EventCallable<{ field: string; value: unknown }>
  >();
  /** Per-instance full-replace events: set the entire instance slice (for bulk/SSR). */
  private readonly _instanceSliceSets = new Map<string, EventCallable<Record<string, unknown>>>();
  private readonly autoIncrementFields: string[] = [];
  /** Cached contract keys — avoids repeated Object.keys(contract) calls */
  private readonly contractKeys: string[];
  /** Pre-computed field categories — avoids O(C) kind-checking per create */
  private readonly stateFieldKeys: string[] = [];
  private readonly eventFieldKeys: string[] = [];
  private readonly refFieldKeys: string[] = [];
  private readonly inverseFieldKeys: string[] = [];
  private readonly computedFieldKeys: string[] = [];
  /** Pre-computed $-prefix mapping for builder fn. Avoids per-instance kind-checking. */
  private readonly prefixMapping: Array<{ from: string; to: string }> = [];
  /** Model-level events per contract event field: ONE event per event field, shared by all instances.
   *  Payload: { id: string; payload: unknown }. Per-instance events are prepends on these. */
  private readonly _modelEvents = new Map<
    string,
    EventCallable<{ id: string; payload: unknown }>
  >();
  /** Shared .on() handler registry: accumulates event→field→reducer mappings at model level. */
  private _sharedOnRegistry?: SharedOnRegistry;
  private autoIncrementCounters: Record<string, number> = {};
  private _$autoIncrement!: StoreWritable<Record<string, number>>;
  private _autoIncrementSet!: EventCallable<Record<string, number>>;
  private _autoIncrementReset!: EventCallable<void>;
  private _hasAutoIncrement = false;
  private inverseSources?: Record<string, () => Model<any, any>>;
  private refTargets?: Record<string, () => Model<any, any>>;
  private _updatedWired = false;
  private _inversesResolved = false;
  private _bulkClearing = false;
  private _hasInverseFields = false;
  /** True when model has no fn, no refs, no computed, no resetOn — can skip region. */
  private _isLightweight = true;
  private _queryRegistry?: QueryRegistry<
    Contract,
    Generics,
    Ext,
    FullInstance<Contract, Generics, Ext>
  >;

  // Shared region for model-level lazy units (carries sidRoot for SID consistency)
  private _modelRegion?: Node;

  // Reactive data snapshot — source of truth for instance field values (SSR-serializable)
  // Assigned in constructor inside withRegion — TS can't see through the callback
  private _$dataMap!: StoreWritable<Record<string, Record<string, unknown>>>;
  private _dataMapSet!: EventCallable<{ id: string; data: Record<string, unknown> }>;
  private _dataMapSetMany!: EventCallable<Record<string, Record<string, unknown>>>;
  private _dataMapFieldUpdated!: EventCallable<{ id: string; field: string; value: unknown }>;
  private _dataMapRemoved!: EventCallable<string>;
  private _dataMapCleared!: EventCallable<void>;
  private _dataMapWired = false;
  private _syncDirty = false;

  /**
   * Sync $dataMap's default state with its current global value.
   * Effector's fork() starts scopes from createStore defaults, not current global state.
   * Without this, fork() would see an empty $dataMap even after global model.create() calls.
   */
  private syncDataMapDefault(): void {
    this._syncDirty = false;
    const current = this._$dataMap.getState();
    const store = this._$dataMap as StoreWritable<Record<string, Record<string, unknown>>> & {
      graphite: { scope: { state: { initial: typeof current } } };
      defaultState: typeof current;
    };
    store.graphite.scope.state.initial = current;
    store.defaultState = current;
  }

  /** Mark that $dataMap default needs syncing. Deferred to public API boundaries. */
  private markSyncDirty(): void {
    this._syncDirty = true;
  }

  /** Sync $autoIncrement default state for fork() isolation (mirrors syncDataMapDefault). */
  private syncAutoIncrementDefault(): void {
    const current = this._$autoIncrement.getState();
    const store = this._$autoIncrement as StoreWritable<Record<string, number>> & {
      graphite: { scope: { state: { initial: Record<string, number> } } };
      defaultState: Record<string, number>;
    };
    store.graphite.scope.state.initial = current;
    store.defaultState = current;
  }

  /**
   * Sync $instanceSlice defaults from $dataMap for fork() isolation.
   * Uses === to skip slices that haven't changed — amortized O(1) per create.
   */
  private syncSliceDefaults(): void {
    if (this._instanceSlices.size === 0) return;
    const dataMap = this._$dataMap.getState();
    for (const [id, $slice] of this._instanceSlices) {
      const data = dataMap[id];
      if (!data) continue;
      const store = $slice as StoreWritable<Record<string, unknown>> & {
        graphite: { scope: { state: { initial: Record<string, unknown> } } };
        defaultState: Record<string, unknown>;
      };
      if (store.defaultState === data) continue;
      store.graphite.scope.state.initial = data;
      store.defaultState = data;
    }
  }

  /** Flush deferred sync if needed. Called at public API boundaries only. */
  private flushSync(): void {
    if (this._syncDirty) {
      this.syncDataMapDefault();
      this.syncSliceDefaults();
      if (this._hasAutoIncrement) {
        this.syncAutoIncrementDefault();
      }
    }
  }

  // ═══ Public API proxied from sub-components ═══

  public get $ids() {
    return this.registry.$ids;
  }
  public get $pkeys() {
    return this.registry.$pkeys;
  }
  public get $count() {
    return this.registry.$count;
  }
  public get $instances() {
    return this.registry.$instances;
  }
  public get reorder() {
    return this.registry.reorder;
  }

  public get createFx() {
    return this.effects.createFx;
  }
  public get createManyFx() {
    return this.effects.createManyFx;
  }
  public get deleteFx() {
    return this.effects.deleteFx;
  }
  public get clearFx() {
    return this.effects.clearFx;
  }
  public get updateFx() {
    return this.effects.updateFx;
  }

  public get created() {
    return this.effects.created;
  }
  public get deleted() {
    return this.effects.deleted;
  }
  public get cleared() {
    return this.effects.cleared;
  }
  public get updated() {
    if (!this._updatedWired) {
      this._updatedWired = true;
      // Retroactively wire all existing instances
      for (const id of this.cache.keys()) {
        const entry = this.cache.get(id);
        if (entry) {
          const wireFn = () => this.wireUpdatedForInstance(id, entry.units);
          if (entry.region) {
            withRegion(entry.region, wireFn);
          } else {
            wireFn();
          }
        }
      }
    }
    return this.effects.updated;
  }

  constructor(
    private readonly contract: Contract,
    private readonly builder: (
      model: ContractModel<Contract, Generics>,
    ) => ContractModel<Contract, Generics> & Ext,
    private readonly modelName: string = "unnamed",
    pk: (data: any) => PkResult,
    private readonly sidRoot?: string,
    private readonly factoryDefaults?: Record<string, (data: Record<string, unknown>) => unknown>,
    private readonly _noUserFn?: boolean,
  ) {
    this.cache = new InstanceCache();
    this.contractKeys = Object.keys(contract);

    this.pkResolver = new PrimaryKeyResolver(
      contract,
      pk,
      this.cache,
      (entity: ContractRef, fieldName: string) => {
        const target = this.resolveRefTarget(fieldName, entity);
        return { pkResolver: target.getPkResolver() };
      },
    );

    this.scopeManager = new ScopeManager(contract);

    this.refApiFactory = new RefApiFactory(
      (id) => this.getInstanceOrReconstruct(id),
      Model.sidRegistry,
      () => this._dataMapFieldUpdated,
    );

    this.indexes = new ModelIndexes(contract);

    // Pre-compute field categories — avoids O(C) kind-checking in hot paths
    for (const key of Object.keys(contract)) {
      const entity = contract[key];
      if (!entity) continue;
      if (entity.kind === ContractFieldKind.State) {
        this.stateFieldKeys.push(key);
        if ((entity as ContractStore<unknown>).isAutoIncrement) {
          this.autoIncrementFields.push(key);
        }
        const storeEntity = entity as ContractStore<unknown>;
        if (storeEntity.resetOn?.length || storeEntity.isUnique || storeEntity.isIndexed) {
          this._isLightweight = false;
        }
      } else if (entity.kind === ContractFieldKind.Event) {
        this.eventFieldKeys.push(key);
      } else if (entity.kind === ContractFieldKind.Ref) {
        this.refFieldKeys.push(key);
        this._isLightweight = false;
      } else if (entity.kind === ContractFieldKind.Inverse) {
        this.inverseFieldKeys.push(key);
        this._hasInverseFields = true;
        this._isLightweight = false;
      } else if (entity.kind === ContractFieldKind.Computed) {
        this.computedFieldKeys.push(key);
        this._isLightweight = false;
      }
      // Pre-compute $-prefix mapping for builder fn
      const needsPrefix =
        entity.kind === ContractFieldKind.State ||
        entity.kind === ContractFieldKind.Computed ||
        entity.kind === ContractFieldKind.Inverse;
      this.prefixMapping.push({ from: key, to: needsPrefix ? `$${key}` : key });
    }

    // Create ALL model-level effector units inside sidRoot region.
    // This ensures babel/swc plugin's withFactory prefix propagates to
    // $ids, $dataMap, updated event, and all model-level SIDs.
    const modelRegion = this.getModelRegion();
    withRegion(modelRegion, () => {
      this.registry = new ModelRegistry<FullInstance<Contract, Generics, Ext>>(
        modelName,
        (id) => this.cache.getCompoundKey(id),
        (id) => this.getInstanceOrReconstruct(id),
        () => this._$dataMap,
        (id, dataMap) => this.getInstanceOrReconstructScoped(id, dataMap),
      );

      this.effects = new ModelEffects<Contract, Generics, FullInstance<Contract, Generics, Ext>>(
        modelName,
        sidRoot,
        () => this._$dataMap,
        {
          create: (data) => {
            this.remapFkFields(data as Record<string, unknown>);
            const resolved = this.resolveDefaults(data as Record<string, unknown>);
            return this.handleCreate(resolved);
          },
          createMany: (items) => this.handleCreateMany(items as Record<string, unknown>[]),
          delete: (dataMap, id) => {
            // `dataMap` is the scope-correct snapshot supplied by the attach-
            // based deleteFx. Passing it through to validateDeleteRestrictions
            // lets restrict/cascade policies enforce against the right data
            // even in true two-process SSR where the global $dataMap is empty.
            this.validateDeleteRestrictions(id, new Set(), dataMap);
            // Cache-hit path: clearInstance walks entry.units and drives
            // cascade itself. Cache-miss (two-process SSR) needs help —
            // collect cascade targets from the scoped snapshot before
            // clearInstance runs, and drive their removal afterwards.
            const hadCacheEntry = this.cache.get(id) !== undefined;
            const cascadeTargets = hadCacheEntry
              ? null
              : this.collectCascadeTargetsFromSnapshot(id, dataMap);
            this.clearInstance(id);
            if (cascadeTargets) {
              for (const { model, ids } of cascadeTargets) {
                for (const targetId of ids) {
                  model.clearInstance(targetId);
                }
              }
            }
          },
          clear: (dataMap) => this.handleClear(dataMap),
          update: (dataMap, id, data) =>
            this.handleUpdate(id, data as UpdateData<Contract, Generics>, dataMap),
        },
      );
      this._dataMapSet = createEvent<{ id: string; data: Record<string, unknown> }>({
        sid: `tentacles:${modelName}:__dataMap__:set`,
      });
      this._dataMapSetMany = createEvent<Record<string, Record<string, unknown>>>();
      this._dataMapFieldUpdated = createEvent<{
        id: string;
        field: string;
        value: unknown;
      }>({
        sid: `tentacles:${modelName}:__dataMap__:fieldUpdated`,
      });
      this._dataMapRemoved = createEvent<string>({
        sid: `tentacles:${modelName}:__dataMap__:removed`,
      });
      this._dataMapCleared = createEvent<void>({
        sid: `tentacles:${modelName}:__dataMap__:cleared`,
      });
      this._$dataMap = createStore<Record<string, Record<string, unknown>>>(
        {},
        { sid: `tentacles:${modelName}:__dataMap__` },
      )
        .on(this._dataMapSet, (map, { id, data }) => {
          this.indexes.validateUniqueInsert(map, id, data);
          return { ...map, [id]: data };
        })
        .on(this._dataMapSetMany, (map, entries) => {
          this.indexes.validateUniqueBatch(map, entries);
          return { ...map, ...entries };
        })
        .on(this._dataMapFieldUpdated, (map, { id, field, value }) => {
          const existing = map[id];
          if (!existing) return map;
          if (existing[field] === value) return map;
          this.indexes.validateUnique(map, id, field, value);
          this._syncDirty = true;
          return { ...map, [id]: { ...existing, [field]: value } };
        })
        .on(this._dataMapRemoved, (map, id) => {
          const next = { ...map };
          delete next[id];
          return next;
        })
        .on(this._dataMapCleared, () => ({}));

      // Wire registry events → $dataMap removal/clear
      sample({
        clock: this.registry.removed,
        fn: (id: ModelInstanceId) => String(id),
        target: this._dataMapRemoved,
      });
      sample({ clock: this.registry.clear, target: this._dataMapCleared });

      // Per-field .set() routes directly through _dataMapFieldUpdated (the same
      // event used by incremental query updates). The $dataMap.on(_dataMapFieldUpdated)
      // handler above already performs unique validation + the spread, so there's no
      // need for per-field setEvents or intermediate samples — one event, one graph hop.

      // Wire $index store as a derived view of $dataMap events. Per-scope
      // routing is automatic — the query layer reads scope-correct $index
      // through its `combine()`. Skips wiring for models with no indexed fields.
      this.indexes.wire(modelName, {
        dataMapSet: this._dataMapSet,
        dataMapSetMany: this._dataMapSetMany,
        dataMapFieldUpdated: this._dataMapFieldUpdated,
        dataMapRemoved: this._dataMapRemoved,
        dataMapCleared: this._dataMapCleared,
      });

      // Model-level events per contract event field.
      // Per-instance events become prepends: inst.increment = modelIncrement.prepend(p => ({id, payload: p}))
      for (const key of this.eventFieldKeys) {
        const modelEvent = createEvent<{ id: string; payload: unknown }>({
          sid: `tentacles:${modelName}:__modelEvent__:${key}`,
        });
        this._modelEvents.set(key, modelEvent);
      }

      // Shared .on() registry for model-level event → field → reducer wiring.
      // Pass model events so handlers are wired at model level (not inside instance regions).
      this._sharedOnRegistry = new SharedOnRegistry(this._$dataMap, [
        ...this._modelEvents.values(),
      ] as EventCallable<unknown>[]);

      // Lightweight only when no user fn AND no refs/computed/resetOn
      if (!this._noUserFn) this._isLightweight = false;

      // Per-field autoincrement counter store (serializable for SSR hydration)
      if (this.autoIncrementFields.length > 0) {
        this._hasAutoIncrement = true;
        this._autoIncrementSet = createEvent<Record<string, number>>({
          sid: `tentacles:${modelName}:__autoIncrement__:set`,
        });
        this._autoIncrementReset = createEvent<void>({
          sid: `tentacles:${modelName}:__autoIncrement__:reset`,
        });
        this._$autoIncrement = createStore<Record<string, number>>(
          {},
          { sid: `tentacles:${modelName}:__autoIncrement__` },
        )
          .on(this._autoIncrementSet, (current, next) => {
            const result = { ...current };
            let changed = false;
            for (const key of Object.keys(next)) {
              const val = next[key]!;
              if (val > (result[key] ?? 0)) {
                result[key] = val;
                changed = true;
              }
            }
            return changed ? result : current;
          })
          .on(this._autoIncrementReset, () => ({}));
      }
    });
  }

  public get name(): string {
    return this.modelName;
  }

  /** Expose PK resolver for cross-model ref resolution (e.g. compound PKs from inline ref data). */
  public getPkResolver(): PrimaryKeyResolver<Contract> {
    return this.pkResolver;
  }

  // ═══ Synchronous instance access ═══

  /**
   * Synchronous instance lookup.
   *
   * Without a scope, this is an O(1) global cache lookup — the fast path used
   * by imperative code and non-SSR callers.
   *
   * When `scope` is provided, the lookup reads from the scope's view of
   * `$dataMap`, materialising the instance via `getInstanceOrReconstructScoped`
   * if the global cache is empty. This is the correct path for server
   * components and test code that have a `fork({values})` scope but never
   * imperatively populated the global cache.
   */
  public getSync(
    id: ModelInstanceId,
    scope?: Scope,
  ): FullInstance<Contract, Generics, Ext> | undefined {
    if (!scope) return this.cache.get(id)?.model;
    const dataMap = scope.getState(this._$dataMap);
    if (!(String(id) in dataMap)) return undefined;
    return this.getInstanceOrReconstructScoped(id, dataMap);
  }

  /**
   * Synchronous compound key lookup — O(1) against the cache (no scope) or
   * against the scope's `$dataMap` snapshot (with scope).
   */
  public getByKeySync(
    ...parts:
      | [string | number, string | number, ...(string | number)[]]
      | [string | number, string | number, ...(string | number)[], Scope]
  ): FullInstance<Contract, Generics, Ext> | undefined {
    const last = parts[parts.length - 1];
    const hasScope = typeof last === "object" && last !== null && "getState" in (last as object);
    const scope = hasScope ? (last as Scope) : undefined;
    const keyParts = (hasScope ? parts.slice(0, -1) : parts) as [
      string | number,
      string | number,
      ...(string | number)[],
    ];

    if (!scope) {
      return this.cache.getByParts(...keyParts)?.model;
    }
    const serializedId = keyParts.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);
    const dataMap = scope.getState(this._$dataMap);
    if (!(serializedId in dataMap)) return undefined;
    return this.getInstanceOrReconstructScoped(serializedId as ModelInstanceId, dataMap);
  }

  // ═══ Public query methods (reactive) ═══

  public instance(id: ModelInstanceId): Store<FullInstance<Contract, Generics, Ext> | null>;
  public instance(
    ...parts: [string | number, string | number, ...(string | number)[]]
  ): Store<FullInstance<Contract, Generics, Ext> | null>;
  public instance(
    ...args: (string | number)[]
  ): Store<FullInstance<Contract, Generics, Ext> | null> {
    return this.registry.instance(...(args as [string | number]));
  }

  public byPartialKey(
    ...prefix: [string | number, ...(string | number)[]]
  ): Store<FullInstance<Contract, Generics, Ext>[]> {
    return this.registry.byPartialKey(...prefix);
  }

  /** Get model-level event for a contract event field (used by createUnits). */
  getModelEvent(
    eventFieldName: string,
  ): EventCallable<{ id: string; payload: unknown }> | undefined {
    return this._modelEvents.get(eventFieldName);
  }

  /** Get shared .on() registry (used by field proxies). */
  getSharedOnRegistry(): SharedOnRegistry {
    return this._sharedOnRegistry!;
  }

  // ═══ Collection query API ═══

  public query(): CollectionQuery<Contract, Generics, Ext, FullInstance<Contract, Generics, Ext>> {
    return this.getQueryRegistry().getOrCreate(QueryDescriptor.empty());
  }

  private _categorizedFields?: CategorizedFields;
  private getCategorizedFields(): CategorizedFields {
    if (!this._categorizedFields) {
      this._categorizedFields = {
        stateFieldKeys: this.stateFieldKeys,
        eventFieldKeys: this.eventFieldKeys,
        refFieldKeys: this.refFieldKeys,
        inverseFieldKeys: this.inverseFieldKeys,
        computedFieldKeys: this.computedFieldKeys,
        prefixMapping: this.prefixMapping,
      };
    }
    return this._categorizedFields;
  }

  private getModelRegion(): Node {
    if (!this._modelRegion) {
      this._modelRegion = createNode({
        meta: this.sidRoot ? { sidRoot: this.sidRoot } : {},
      });
    }
    return this._modelRegion;
  }

  private ensureDataMap(): StoreWritable<Record<string, Record<string, unknown>>> {
    if (!this._dataMapWired) {
      this._dataMapWired = true;
      // Note: model.updated → _dataMapFieldUpdated wiring removed.
      // The proxy .set() path prepends directly onto _dataMapFieldUpdated (one event,
      // one graph hop). The SharedOnRegistry .on() path updates $dataMap via
      // model-level event handlers.
      //
      // Phase 5b: inverse fields are no longer mirrored into $dataMap. The
      // derived `InverseIndex.$byTarget` store is the source of truth for
      // inverse reads; `$dataMap[id][inverseField]` stays at its initial `[]`.
    }
    return this._$dataMap;
  }

  /** Called from createInstance to wire extension fields and inverse data into $dataMap.
   *  Accepts storeData from createInstance to avoid re-reading $dataMap via getState(). */
  private notifyDataMap(
    id: string,
    units: Record<string, unknown>,
    storeData: Record<string, unknown>,
  ): void {
    // Merge extension fields and computed fields into $dataMap.
    // buildStoreData only covers state/ref/inverse — computed fields don't exist yet at that
    // point, and extension fields aren't in the contract at all.
    const extData: Record<string, unknown> = { ...storeData };
    let hasExtra = false;
    for (const key of Object.keys(units)) {
      const entity = this.contract[key];
      // Skip non-computed contract fields — already in $dataMap from buildStoreData
      if (entity && entity.kind !== ContractFieldKind.Computed) continue;
      const unit = units[key];
      if (unit && typeof (unit as Store<unknown>).getState === "function") {
        extData[key] = (unit as Store<unknown>).getState();
        hasExtra = true;
      }
    }
    if (hasExtra) {
      // Update $dataMap with computed/extension fields + propagate to $instanceSlice
      this._dataMapSet({ id, data: extData });
    }
    // Phase 5b: inverse fields are derived from the source model's $dataMap via
    // InverseIndex.$byTarget — they are no longer mirrored into the target's
    // $dataMap. Eliminates the circular derivation that happens for self-ref
    // inverses (source === target) and removes per-instance wiring overhead.
  }

  private getQueryRegistry(): QueryRegistry<
    Contract,
    Generics,
    Ext,
    FullInstance<Contract, Generics, Ext>
  > {
    if (!this._queryRegistry) {
      const self = this;
      const $dataMap = this.ensureDataMap();
      const context: QueryContext<FullInstance<Contract, Generics, Ext>> = {
        $ids: this.registry.$ids,
        $idSet: this.registry.$idSet,
        get $instances() {
          return self.registry.$instances;
        },
        $dataMap,
        getInstance: (id) => this.cache.get(id)?.model,
        getInstanceFromData: (id, dataMap) => this.getInstanceOrReconstructScoped(id, dataMap),
        getUpdated: () => this.updated,
        handleDelete: (id) => this.delete(id),
        handleUpdate: (id, data) => this.handleUpdate(id, data as UpdateData<Contract, Generics>),
        getContract: () => this.contract,
        $index: this.indexes.$index,
        $fieldUpdated: this._dataMapFieldUpdated,
      };
      this._queryRegistry = new QueryRegistry(context);
    }
    return this._queryRegistry;
  }

  // ═══ Public mutation methods ═══

  public create(
    data: CreateData<Contract, Generics>,
    options: { scope: Scope },
  ): Promise<FullInstance<Contract, Generics, Ext>>;
  public create(data: CreateData<Contract, Generics>): FullInstance<Contract, Generics, Ext>;
  public create(
    data: CreateData<Contract, Generics>,
    options?: { scope?: Scope },
  ): FullInstance<Contract, Generics, Ext> | Promise<FullInstance<Contract, Generics, Ext>> {
    const scope = options?.scope;
    this.remapFkFields(data as Record<string, unknown>);
    const resolved = this.resolveDefaults(data as Record<string, unknown>);
    const id = this.extractId(resolved);
    validateInstanceId(id);

    if (scope) {
      const autoIncrementSnapshot = this._hasAutoIncrement
        ? { ...this.autoIncrementCounters }
        : null;
      return this.scopeManager.enqueue(scope, id, async () => {
        let entry = this.cache.get(id);
        if (!entry) {
          this.createInstance(id, resolved as CreateData<Contract, Generics>);
          entry = this.cache.get(id);
          if (!entry) return;
        }
        // Flush deferred sync — fork() needs defaults synced before allSettled
        this.flushSync();
        // Sync per-field autoincrement counters to scope for SSR serialization
        if (autoIncrementSnapshot) {
          await allSettled(this._autoIncrementSet, {
            scope,
            params: autoIncrementSnapshot,
          });
        }
        // 1. Set $dataMap in scope FIRST — virtual stores derive from it.
        // Build filtered storeData (state + inverse + ref defaults only).
        // Raw ref data may contain inline objects — processRefs resolves them later.
        // Include computed field values so derived fields (e.g. priorityNumber)
        // are available in the scope for query sorting/filtering.
        const scopeData = this.buildStoreData(resolved);
        for (const key of this.computedFieldKeys) {
          const unit = entry.units[key];
          if (unit && typeof (unit as Store<unknown>).getState === "function") {
            scopeData[key] = (unit as Store<unknown>).getState();
          }
        }
        await allSettled(this._dataMapSet, {
          scope,
          params: { id: String(id), data: scopeData },
        });
        const sliceSet = this.getSliceSet(String(id));
        if (sliceSet) {
          await allSettled(sliceSet, { scope, params: scopeData });
        }
        // 2. Initialize ref stores in scope
        await this.scopeManager.applyScopeValues(entry.units, scope);
        // 3. Process ref + inverse data from create() params
        await this.processRefs(resolved, entry.units, scope);
        await this.processInverseRefs(resolved, id, scope);
        // 4. Add to $ids in scope
        await allSettled(this.registry.add, { scope, params: id });
        return entry.model;
      }) as Promise<FullInstance<Contract, Generics, Ext>>;
    }

    return this.handleCreate(resolved);
  }

  public createMany(
    items: CreateData<Contract, Generics>[],
    options: { scope: Scope },
  ): Promise<FullInstance<Contract, Generics, Ext>[]>;
  public createMany(
    items: CreateData<Contract, Generics>[],
  ): FullInstance<Contract, Generics, Ext>[];
  public createMany(
    items: CreateData<Contract, Generics>[],
    options?: { scope?: Scope },
  ): FullInstance<Contract, Generics, Ext>[] | Promise<FullInstance<Contract, Generics, Ext>[]> {
    if (options?.scope) {
      const { scope } = options;
      return Promise.all(items.map((item) => this.create(item, { scope })));
    }
    return this.handleCreateMany(items as Record<string, unknown>[]);
  }

  /**
   * Batched creation: resolves all data, updates $dataMap once, builds all instances,
   * then updates $ids once. Turns O(N²) into O(N) by avoiding N individual $dataMap
   * spread operations and N individual $ids rebuilds.
   */
  private handleCreateMany(
    items: Record<string, unknown>[],
  ): FullInstance<Contract, Generics, Ext>[] {
    if (items.length === 0) return [];

    // Phase 1: resolve all data and IDs upfront
    const resolved: {
      id: string;
      data: Record<string, unknown>;
      storeData: Record<string, unknown>;
    }[] = [];
    for (const item of items) {
      this.remapFkFields(item);
      const data = this.resolveDefaults(item);
      const id = this.extractId(data);
      validateInstanceId(id);
      // Clear previous instance if replacing
      this.clearInstance(id);
      resolved.push({ id, data, storeData: this.buildStoreData(data) });
    }

    if (this._hasInverseFields) {
      this.resolveInverses();
    }

    // Phase 2: single $dataMap update with ALL entries.
    // Pre-validate uniqueness against the current global $dataMap so the throw
    // is synchronous (the .on(_dataMapSetMany) reducer also validates as
    // defense-in-depth for scoped paths).
    const batchEntries: Record<string, Record<string, unknown>> = {};
    for (const { id, storeData } of resolved) {
      batchEntries[id] = storeData;
    }
    if (this.indexes.uniqueFields.size > 0) {
      this.indexes.validateUniqueBatch(this._$dataMap.getState(), batchEntries);
    }
    this._dataMapSetMany(batchEntries);

    // Phase 3: build all instance objects (virtual stores derive from $dataMap)
    const results: FullInstance<Contract, Generics, Ext>[] = [];
    const allIds: ModelInstanceId[] = [];
    const extBatch: Record<string, Record<string, unknown>> = {};
    let hasExtBatch = false;
    for (const { id, storeData } of resolved) {
      const built = this.buildInstance(id, storeData);

      // Collect extension + computed fields for batched $dataMap update
      const extData: Record<string, unknown> = { ...storeData };
      let hasExt = false;
      for (const key of Object.keys(built.units)) {
        const entity = this.contract[key];
        // Skip non-computed contract fields — already in $dataMap from buildStoreData
        if (entity && entity.kind !== ContractFieldKind.Computed) continue;
        const unit = built.units[key];
        if (unit && typeof (unit as Store<unknown>).getState === "function") {
          extData[key] = (unit as Store<unknown>).getState();
          hasExt = true;
        }
      }
      if (hasExt) {
        extBatch[id] = extData;
        hasExtBatch = true;
      }
      allIds.push(id);
      results.push(built.result);
    }

    // Single batched $dataMap update for all extension fields
    if (hasExtBatch) {
      this._dataMapSetMany(extBatch);
    }

    // Phase 4: single $ids update with ALL IDs
    this.registry.addMany(allIds);
    this.flushSync();

    // Phase 5: process refs and inverses (after all instances exist)
    for (let i = 0; i < resolved.length; i++) {
      const { id, data } = resolved[i]!;
      const entry = this.cache.get(id);
      if (entry) {
        this.processRefs(data, entry.units);
        this.processInverseRefs(data, id);
      }
    }
    return results;
  }

  public update(
    id: ModelInstanceId,
    data: UpdateData<Contract, Generics>,
  ): FullInstance<Contract, Generics, Ext> {
    return this.handleUpdate(id, data);
  }

  public delete(id: ModelInstanceId, scope?: Scope) {
    if (scope) {
      return this.handleScopedDelete(id, scope);
    }
    this.validateDeleteRestrictions(id, new Set());
    this.clearInstance(id);
    this.flushSync();
  }

  public clear(scope?: Scope) {
    if (scope) {
      return this.handleScopedClear(scope);
    }
    this.handleClear();
  }

  /**
   * Scoped clear: semantically "revert all instances' scope-local mutations".
   * Parallel to `handleScopedDelete` but operating on every cached id.
   *
   * Clears the scoped `$ids`, re-seeds the scoped `$dataMap` with the
   * *current* global entries, and resets scope value overrides on every
   * instance. After this call, reads in `scope` fall through to global
   * state rather than the prior scoped overrides.
   *
   * This is NOT the same as `clear()` without a scope (which wipes global
   * state via `handleClear`).
   */
  private async handleScopedClear(scope: Scope): Promise<void> {
    // Reset ref scope values for each instance
    for (const id of this.cache.keys()) {
      const entry = this.cache.get(id);
      if (entry) {
        await this.scopeManager.resetScopeValues(entry.units, scope);
      }
    }
    // Clear scoped $ids (sample wiring also empties scoped $dataMap).
    await allSettled(this.registry.clear, { scope });
    // Re-seed scoped $dataMap with current global values so scoped reads
    // fall through to global state.
    const globalData = this._$dataMap.getState();
    for (const [id, data] of Object.entries(globalData)) {
      await allSettled(this._dataMapSet, { scope, params: { id, data } });
      const sliceSet = this.getSliceSet(id);
      if (sliceSet) {
        await allSettled(sliceSet, { scope, params: data });
      }
    }
    // Reset autoincrement counters in scope
    if (this._hasAutoIncrement) {
      await allSettled(this._autoIncrementReset, { scope });
    }
  }

  // ═══ Relationship binding ═══

  public bind<B extends BindConfig<Contract>>(
    config: B,
  ): Model<ApplyBind<Contract, B>, Generics, Ext, PkFields> {
    for (const [key, thunk] of Object.entries(config)) {
      if (!thunk) continue;
      const entity = this.contract[key];
      if (!entity) continue;

      if (entity.kind === ContractFieldKind.Ref) {
        if (!this.refTargets) this.refTargets = {};
        this.refTargets[key] = thunk as () => Model<any, any>;
      } else if (entity.kind === ContractFieldKind.Inverse) {
        if (!this.inverseSources) this.inverseSources = {};
        this.inverseSources[key] = thunk as () => Model<any, any>;
      }
    }
    return this as Model<any, any, any, any> as Model<
      ApplyBind<Contract, B>,
      Generics,
      Ext,
      PkFields
    >;
  }

  /** Get ref metadata for a field. Returns cardinality + resolved target model, or undefined. */
  public getRefMeta(
    fieldName: string,
  ): { cardinality: "one" | "many"; target: Model<any, any> } | undefined {
    const entity = this.contract[fieldName];
    if (!entity || entity.kind !== ContractFieldKind.Ref) return undefined;
    const ref = entity as ContractRef;
    return {
      cardinality: ref.cardinality,
      target: this.resolveRefTarget(fieldName, ref),
    };
  }

  /** Resolve ref target: refTargets config > contract thunk > self (self-ref) */
  resolveRefTarget(
    fieldName: string | undefined,
    entity?: ContractRef<"many" | "one">,
  ): Model<any, any> {
    if (fieldName) {
      const thunk = this.refTargets?.[fieldName];
      if (thunk) return thunk() as Model<any, any, any>;
    }
    if (entity?.ref) return entity.ref() as Model<any, any, any>;
    // Self-ref fallback — valid for refs that reference the same model
    return this as Model<any, any, any>;
  }

  private validateInverseBound(fieldName: string): void {
    if (this.inverseSources?.[fieldName]) return;
    // Self-ref inverse: the refField exists on this model — valid
    const inverseEntity = this.contract[fieldName] as ContractInverse;
    if (this.contract[inverseEntity.refField]?.kind === ContractFieldKind.Ref) return;
    throw new TentaclesError(
      `Model "${this.modelName}": inverse "${fieldName}" is not bound. ` +
        `Call ${this.modelName}.bind({ ${fieldName}: () => sourceModel }) before create().`,
    );
  }

  // ═══ Used by createUnits (ref creation) ═══

  createRefApi(
    cardinality: "many" | "one",
    fieldName: string,
    makeSid: (field: string) => string,
    scope: Scope | undefined,
    sourceInstanceId?: ModelInstanceId,
    $sourceDataMap?: StoreWritable<Record<string, Record<string, unknown>>>,
    sourceId?: string,
    $instanceSlice?: StoreWritable<Record<string, unknown>>,
    getSliceFieldUpdate?: () => EventCallable<{ field: string; value: unknown }> | undefined,
  ): { api: RefManyApi | RefOneApi; registeredSids: string[] } {
    return this.refApiFactory.create(
      cardinality,
      fieldName,
      makeSid,
      scope,
      sourceInstanceId,
      $sourceDataMap,
      sourceId,
      $instanceSlice,
      getSliceFieldUpdate,
    );
  }

  // ═══ Used by createUnits (inverse creation) ═══

  getInverseIndex(fieldName: string): InverseIndex | undefined {
    this.resolveInverses();
    return this.inverseIndexes.get(fieldName);
  }

  // ═══ Internal handlers ═══

  private resolveInverses(): void {
    if (this._inversesResolved) return;
    this._inversesResolved = true;

    if (!this._hasInverseFields) return;

    // Construct inverse indexes inside the target (this) model's region so the
    // derived `$byTarget` stores inherit the model's SID prefix and effector
    // scope routing wires them into forked scopes correctly.
    withRegion(this.getModelRegion(), () => {
      for (const key of this.contractKeys) {
        const entity = this.contract[key];
        if (!entity || entity.kind !== ContractFieldKind.Inverse) continue;

        const refField = (entity as ContractInverse).refField;

        // Source model comes from the `sources` config, or defaults to self
        const sourceThunk = this.inverseSources?.[key];
        const sourceModel = (sourceThunk ? sourceThunk() : this) as Model<any, any, any>;

        // Validate that the source model has the referenced ref field
        const refEntity = sourceModel.contract[refField];
        if (!refEntity || refEntity.kind !== ContractFieldKind.Ref) {
          throw new TentaclesError(
            `Inverse "${key}" on "${this.modelName}": source model has no ref field "${refField}"`,
          );
        }

        // Ensure the source model's $dataMap is wired before the derivation
        // subscribes to it. ensureDataMap() is idempotent.
        const sourceDataMap = sourceModel.ensureDataMap();
        const refContractEntity = refEntity as ContractRef;
        const cardinality = refContractEntity.cardinality;

        const inverseIndex = new InverseIndex(
          sourceDataMap,
          this.modelName,
          refField,
          cardinality,
          (id, dataMap) => sourceModel.getInstanceOrReconstructScoped(id, dataMap),
        );
        this.inverseIndexes.set(key, inverseIndex);
      }
    });
  }

  private handleCreate(data: Record<string, unknown>): FullInstance<Contract, Generics, Ext> {
    const id = this.extractId(data);
    validateInstanceId(id);
    const { result, units } = this.createInstance(id, data as CreateData<Contract, Generics>);
    this.processRefs(data, units);
    this.processInverseRefs(data, id);
    this.flushSync();
    return result;
  }

  private handleClear(dataMap?: Record<string, Record<string, unknown>>): void {
    // For scoped `clearFx` the attach wiring supplies `dataMap` from the
    // active scope; otherwise fall back to the imperative cache keys (which
    // match the global `$dataMap`). Iterating the snapshot lets us validate
    // restrict policies against scope-only data in two-process SSR scenarios
    // where the global cache is empty but a hydrated scope carries records.
    const ids: Iterable<ModelInstanceId> = dataMap
      ? (Object.keys(dataMap) as ModelInstanceId[])
      : this.cache.keys();
    for (const id of ids) {
      this.validateDeleteRestrictions(id, new Set(), dataMap);
    }
    // Bulk clear: skip per-instance reactive events, fire registry.clear() once at the end
    this._bulkClearing = true;
    for (const id of [...this.cache.keys()]) {
      this.clearInstance(id);
    }
    this._bulkClearing = false;
    this.registry.clear();
    this.autoIncrementCounters = {};
    if (this._hasAutoIncrement) {
      this._autoIncrementReset();
    }
    // Evict cached query objects to prevent unbounded growth
    this._queryRegistry?.dispose();
    this.flushSync();
  }

  private handleUpdate(
    id: ModelInstanceId,
    data: UpdateData<Contract, Generics>,
    scopedDataMap?: Record<string, Record<string, unknown>>,
  ): FullInstance<Contract, Generics, Ext> {
    const raw = data as Record<string, unknown>;
    this.remapFkFields(raw);

    const normalizedId = String(id) as ModelInstanceId;
    const entry = this.cache.get(normalizedId);
    if (!entry) {
      // No global cache entry. Two sub-cases:
      // (a) Instance exists only in a fork scope (SSR hydration) — fire reactive
      //     field-update events; they propagate in the active scope context.
      // (b) Instance doesn't exist anywhere — preserve the historical behavior
      //     and throw, so unscoped callers get a clear error.
      // We distinguish by checking the scoped $dataMap (preferred in two-
      // process SSR) and fall back to the global snapshot for unscoped calls.
      const dataMap = scopedDataMap ?? this._$dataMap.getState();
      if (!(normalizedId in dataMap)) {
        throw new TentaclesError(`Instance ${String(id)} not found`);
      }
      const idStr = String(normalizedId);
      const currentRow = dataMap[normalizedId] as Record<string, unknown>;
      // Per-instance slice write event (if the instance slice has been
      // materialised globally — usually yes, because the instance was
      // created in a server scope earlier and created a global slice store).
      // Refs and materialised store fields derive `$ids` / `$id` / `.map()`
      // stores from `$instanceSlice`, so updating only `$dataMap` would not
      // flow into them. Fire the slice field update in parallel so both
      // stores stay in sync in the active scope.
      const sliceFieldUpdate = this.getSliceFieldUpdate(idStr);
      const writeField = (field: string, value: unknown): void => {
        this._dataMapFieldUpdated({ id: idStr, field, value });
        if (sliceFieldUpdate) {
          sliceFieldUpdate({ field, value });
        }
      };
      for (const [key, value] of Object.entries(raw)) {
        const entity = this.contract[key];
        if (!entity) continue;
        if (entity.kind === ContractFieldKind.State) {
          writeField(key, value);
          continue;
        }
        if (entity.kind === ContractFieldKind.Ref) {
          const refEntity = entity as ContractRef<"many" | "one">;
          const resolved = this.resolveScopedRefValue(refEntity, key, value, currentRow, dataMap);
          if (resolved !== undefined) {
            writeField(key, resolved);
          }
        }
      }
      return null as unknown as FullInstance<Contract, Generics, Ext>;
    }

    // 1. Update store fields
    for (const [key, value] of Object.entries(raw)) {
      const entity = this.contract[key];
      if (entity && entity.kind !== ContractFieldKind.State) continue;
      const unit = entry.units[key] as StoreWritable<unknown> & { set?: EventCallable<unknown> };
      if (unit && typeof unit.set === "function") {
        unit.set(value);
      }
    }

    // 2. Process ref operations
    this.processRefsForUpdate(raw, entry.units);

    // 3. Process inverse ref operations
    this.processInverseRefsForUpdate(raw, id);

    // 4. Sync FK stores when ref changed
    this.syncFkStoresFromRefs(raw, entry.units);

    // Lightweight sync: only $dataMap default, not all slice defaults.
    // Slice defaults are synced at heavier boundaries (create, delete, clear).
    this.syncDataMapDefault();
    return entry.model;
  }

  /** Resolve a single ref element (scalar, { connect }, { create }, { connectOrCreate }) to an ID */
  private resolveRefElement(element: unknown, targetModel: Model<any, any>): ModelInstanceId {
    if (typeof element === "string" || typeof element === "number") {
      // Scalar shorthand = connect. Normalize for cache lookup, return original.
      if (!targetModel.cache.get(String(element) as ModelInstanceId)) {
        throw new TentaclesError(
          `Ref connect: instance "${element}" not found in "${targetModel.modelName}"`,
        );
      }
      return element as ModelInstanceId;
    }

    const op = element as Record<string, unknown>;

    if ("connect" in op) {
      const connectVal = op.connect;
      // connect accepts scalar ID or object (extract PK)
      const connectId =
        typeof connectVal === "string" || typeof connectVal === "number"
          ? (connectVal as ModelInstanceId)
          : (targetModel
              .getPkResolver()
              .resolve(connectVal as Record<string, unknown>) as ModelInstanceId);
      if (!targetModel.cache.get(String(connectId) as ModelInstanceId)) {
        throw new TentaclesError(
          `Ref connect: instance "${connectId}" not found in "${targetModel.modelName}"`,
        );
      }
      return connectId;
    }

    if ("create" in op) {
      const created = (targetModel as Model<any, any>).create(
        op.create as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    }

    if ("connectOrCreate" in op) {
      const createData = op.connectOrCreate as Record<string, unknown>;
      const existingId = targetModel.getPkResolver().resolve(createData);
      if (targetModel.cache.get(existingId as ModelInstanceId)) {
        return existingId as ModelInstanceId;
      }
      const created = (targetModel as Model<any, any>).create(
        createData as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    }

    throw new TentaclesError(`Invalid ref operation: ${JSON.stringify(element)}`);
  }

  private processRefsForUpdate(
    data: Record<string, unknown>,
    units: Record<string, unknown>,
  ): void {
    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;

      const value = data[key];
      if (value === undefined) continue;

      const refEntity = entity as ContractRef;
      const targetModel = this.resolveRefTarget(key, refEntity);
      const refApi = units[key] as RefManyApi | RefOneApi;
      const cardinality = refEntity.cardinality as "many" | "one";

      if (cardinality === "one") {
        this.processOneRefUpdate(value, targetModel, refApi as RefOneApi);
      } else {
        this.processManyRefUpdate(value, targetModel, refApi as RefManyApi);
      }
    }
  }

  private processOneRefUpdate(
    value: unknown,
    targetModel: Model<any, any>,
    refApi: RefOneApi,
  ): void {
    // Scalar shorthand: connect directly
    if (typeof value === "string" || typeof value === "number") {
      const resolvedId = this.resolveRefElement(value, targetModel);
      refApi.set(resolvedId);
      return;
    }

    const op = value as Record<string, unknown>;

    if ("disconnect" in op && op.disconnect === true) {
      refApi.clear();
      return;
    }

    // Plain object (no operation key) = connectOrCreate shortcut
    const resolved =
      !("connect" in op) && !("create" in op) && !("connectOrCreate" in op)
        ? { connectOrCreate: value }
        : value;
    const resolvedId = this.resolveRefElement(resolved, targetModel);
    refApi.set(resolvedId);
  }

  private processManyRefUpdate(
    value: unknown,
    targetModel: Model<any, any>,
    refApi: RefManyApi,
  ): void {
    // Plain array shortcut = add with connectOrCreate for each
    if (Array.isArray(value)) {
      for (const item of value) {
        const resolvedId = this.resolveRefElement({ connectOrCreate: item }, targetModel);
        refApi.add(resolvedId);
      }
      return;
    }

    const op = value as Record<string, unknown>;

    if ("set" in op && op.set !== undefined) {
      if ("add" in op || "disconnect" in op) {
        throw new TentaclesError('Ref "set" is mutually exclusive with "add" and "disconnect"');
      }
      // Replace: remove all existing, then add new
      const currentIds = refApi.$ids.getState();
      for (const oldId of currentIds) {
        refApi.remove(oldId);
      }
      for (const element of op.set as unknown[]) {
        const resolvedId = this.resolveRefElement(element, targetModel);
        refApi.add(resolvedId);
      }
      return;
    }

    if ("disconnect" in op && op.disconnect !== undefined) {
      for (const id of op.disconnect as ModelInstanceId[]) {
        refApi.remove(id);
      }
    }

    if ("add" in op && op.add !== undefined) {
      for (const element of op.add as unknown[]) {
        const resolvedId = this.resolveRefElement(element, targetModel);
        refApi.add(resolvedId);
      }
    }
  }

  /**
   * Cache-miss variant of ref update resolution. Used from `handleUpdate` when
   * the instance exists only in a fork scope (SSR hydration: global cache is
   * empty, but the scope's `$dataMap` has the record). Returns the new ref
   * field value to write to `$dataMap`, or `undefined` to signal "no change"
   * for unsupported operation shapes.
   *
   * Supported operations:
   *   - one ref: scalar id, `{ connect: id }`, `{ disconnect: true }`,
   *     `{ create }`, `{ connectOrCreate }`
   *   - many ref: plain array (scalar shortcut), `{ set: [...] }`, `{ add }`,
   *     `{ disconnect }`, `{ create }`, `{ connectOrCreate }`
   *
   * Additive ops (`add`, `disconnect`) read the current scoped value from the
   * `currentRow` snapshot supplied by the caller (which was itself read from
   * the scope-aware `attach` source in `updateFx`), so they compute the new
   * value purely against scoped data — never touching the global dataMap.
   *
   * Creation ops (`create`, `connectOrCreate`) delegate to `targetModel.create`,
   * which runs through its own `createFx` path and therefore writes into the
   * same active scope. The returned id is appended to the computed value.
   *
   * The `scopedDataMap` parameter is the full scope snapshot and is currently
   * unused in this helper (retained for symmetry with the cascade-snapshot
   * helpers and to allow future extensions — e.g. resolving nested
   * `connectOrCreate` lookups against the scoped view of the target model's
   * entries).
   */
  private resolveScopedRefValue(
    refEntity: ContractRef<"many" | "one">,
    fieldKey: string,
    value: unknown,
    currentRow: Record<string, unknown>,
    _scopedDataMap: Record<string, Record<string, unknown>>,
  ): unknown {
    if (value == null) return null;

    const targetModel = this.resolveRefTarget(fieldKey, refEntity);

    if (refEntity.cardinality === "one") {
      return this.resolveScopedOneRef(value, targetModel);
    }

    return this.resolveScopedManyRef(value, targetModel, currentRow, fieldKey);
  }

  private resolveScopedOneRef(value: unknown, targetModel: Model<any, any>): unknown {
    if (typeof value === "string" || typeof value === "number") return value;

    const op = value as Record<string, unknown>;
    if ("disconnect" in op && op.disconnect === true) return null;

    if ("connect" in op) {
      const c = op.connect;
      if (typeof c === "string" || typeof c === "number") return c;
      // Object-shaped connect (compound PK) — resolve via the target
      // model's PK resolver. Works against any scope because the resolver is
      // a pure function of the input object.
      try {
        return targetModel.getPkResolver().resolve(c as Record<string, unknown>);
      } catch {
        return undefined;
      }
    }

    if ("create" in op) {
      const created = (targetModel as Model<any, any>).create(
        op.create as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    }

    if ("connectOrCreate" in op) {
      const createData = op.connectOrCreate as Record<string, unknown>;
      const existingId = targetModel.getPkResolver().resolve(createData);
      // Can't reliably check "already exists" on the cache-miss path because
      // the target's global cache may also be empty. Create unconditionally
      // — model.create is idempotent on its PK: a duplicate create will
      // overwrite the existing dataMap entry with the same id. That matches
      // the prisma semantics of connectOrCreate in an idempotent write.
      if (targetModel.cache.get(existingId as ModelInstanceId)) {
        return existingId;
      }
      const created = (targetModel as Model<any, any>).create(
        createData as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    }

    // Plain object (no known op key) — unsupported on this path.
    return undefined;
  }

  private resolveScopedManyRef(
    value: unknown,
    targetModel: Model<any, any>,
    currentRow: Record<string, unknown>,
    fieldKey: string,
  ): unknown {
    // Plain array shortcut — each element is either a scalar id, a `{connect}`
    // wrapper, or a `{create}` / `{connectOrCreate}` object. The shortcut
    // semantics say "append these to the existing list" in the cache-hit
    // path; mirror that here by computing a merged array off of `currentRow`.
    const currentIds = this.readScopedRefIds(currentRow, fieldKey);

    if (Array.isArray(value)) {
      const merged = [...currentIds];
      for (const element of value) {
        const resolvedId = this.resolveScopedManyElement(element, targetModel);
        if (resolvedId !== undefined && !merged.includes(resolvedId)) {
          merged.push(resolvedId);
        }
      }
      return merged;
    }

    const op = value as Record<string, unknown>;

    if ("set" in op && Array.isArray(op.set)) {
      const replaced: ModelInstanceId[] = [];
      for (const element of op.set as unknown[]) {
        const resolvedId = this.resolveScopedManyElement(element, targetModel);
        if (resolvedId !== undefined && !replaced.includes(resolvedId)) {
          replaced.push(resolvedId);
        }
      }
      return replaced;
    }

    // Additive + subtractive ops — start from current scoped value and layer
    // mutations. Order mirrors `processManyRefUpdate`: disconnect first, then
    // add, so `{ disconnect: [x], add: [y] }` removes x before possibly
    // re-adding it.
    let next: ModelInstanceId[] | undefined;

    if ("disconnect" in op && Array.isArray(op.disconnect)) {
      next = next ?? [...currentIds];
      const toRemove = new Set((op.disconnect as ModelInstanceId[]).map(String));
      next = next.filter((id) => !toRemove.has(String(id)));
    }

    if ("add" in op && Array.isArray(op.add)) {
      next = next ?? [...currentIds];
      for (const element of op.add as unknown[]) {
        const resolvedId = this.resolveScopedManyElement(element, targetModel);
        if (resolvedId !== undefined && !next.includes(resolvedId)) {
          next.push(resolvedId);
        }
      }
    }

    return next;
  }

  /**
   * Scope-safe variant of `resolveRefElement` for the cache-miss path. Handles
   * the same element shapes (scalar id, `{connect}`, `{create}`,
   * `{connectOrCreate}`) but never reads from `targetModel.cache` for
   * existence checks beyond best-effort; `{create}` and `{connectOrCreate}`
   * delegate to `targetModel.create`, which routes through the attach-based
   * `createFx` and therefore writes into the active scope.
   */
  private resolveScopedManyElement(
    element: unknown,
    targetModel: Model<any, any>,
  ): ModelInstanceId | undefined {
    if (typeof element === "string" || typeof element === "number") {
      return element as ModelInstanceId;
    }

    const op = element as Record<string, unknown>;

    if ("connect" in op) {
      const c = op.connect;
      if (typeof c === "string" || typeof c === "number") return c as ModelInstanceId;
      try {
        return targetModel.getPkResolver().resolve(c as Record<string, unknown>) as ModelInstanceId;
      } catch {
        return undefined;
      }
    }

    if ("create" in op) {
      const created = (targetModel as Model<any, any>).create(
        op.create as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    }

    if ("connectOrCreate" in op) {
      const createData = op.connectOrCreate as Record<string, unknown>;
      const existingId = targetModel.getPkResolver().resolve(createData);
      if (targetModel.cache.get(existingId as ModelInstanceId)) {
        return existingId as ModelInstanceId;
      }
      const created = (targetModel as Model<any, any>).create(
        createData as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    }

    // Plain object w/o recognised op key — treat as connectOrCreate shortcut.
    try {
      const pk = targetModel.getPkResolver().resolve(op);
      if (targetModel.cache.get(pk as ModelInstanceId)) {
        return pk as ModelInstanceId;
      }
      const created = (targetModel as Model<any, any>).create(
        op as CreateData<any, any>,
      ) as InstanceMeta;
      return created.__id;
    } catch {
      return undefined;
    }
  }

  /** Read the current many-ref ids for a field out of a scoped row snapshot. */
  private readScopedRefIds(row: Record<string, unknown>, fieldKey: string): ModelInstanceId[] {
    const raw = row[fieldKey];
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).filter(
      (v): v is ModelInstanceId => typeof v === "string" || typeof v === "number",
    );
  }

  private processInverseRefsForUpdate(
    data: Record<string, unknown>,
    instanceId: ModelInstanceId,
  ): void {
    if (!this._hasInverseFields) return;
    this.resolveInverses();

    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Inverse) continue;

      const value = data[key];
      if (value === undefined) continue;

      this.validateInverseBound(key);

      const refField = (entity as ContractInverse).refField;
      const sourceThunk = this.inverseSources?.[key];
      const sourceModel = (sourceThunk ? sourceThunk() : this) as Model<any, any, any>;

      const op = value as Record<string, unknown>;

      if ("disconnect" in op && op.disconnect === true) {
        // For inverse "one": find source that points to us and clear its ref
        // We need to find which source instance has this ref pointing to instanceId
        // This is complex — for now, disconnect on inverses is not supported
        throw new TentaclesError("disconnect on inverse refs is not supported in update");
      }

      // Resolve the operation to get source instance ID
      let sourceId: ModelInstanceId;

      if ("connect" in op) {
        sourceId = op.connect as ModelInstanceId;
        const sourceEntry = sourceModel.cache.get(String(sourceId) as ModelInstanceId);
        if (!sourceEntry) {
          throw new TentaclesError(
            `Inverse "${key}": source instance "${sourceId}" not found in "${sourceModel.modelName}"`,
          );
        }
      } else if ("create" in op) {
        const created = (sourceModel as Model<any, any>).create(
          op.create as CreateData<any, any>,
        ) as InstanceMeta;
        sourceId = created.__id;
      } else if ("connectOrCreate" in op) {
        const createData = op.connectOrCreate as Record<string, unknown>;
        const existingId = sourceModel.getPkResolver().resolve(createData);
        if (sourceModel.cache.get(existingId as ModelInstanceId)) {
          sourceId = existingId as ModelInstanceId;
        } else {
          const created = (sourceModel as Model<any, any>).create(
            createData as CreateData<any, any>,
          ) as InstanceMeta;
          sourceId = created.__id;
        }
      } else {
        throw new TentaclesError(
          `Invalid inverse ref operation for "${key}": ${JSON.stringify(value)}`,
        );
      }

      // Link: call source's ref add/set
      const sourceEntry = sourceModel.cache.get(String(sourceId) as ModelInstanceId);
      if (!sourceEntry) return;
      const refApiOnSource = sourceEntry.units[refField] as RefManyApi | RefOneApi;
      if ("$ids" in refApiOnSource) {
        refApiOnSource.add(instanceId);
      } else {
        refApiOnSource.set(instanceId);
      }
    }
  }

  /** After ref operations, sync FK store fields that correspond to changed refs */
  private syncFkStoresFromRefs(
    data: Record<string, unknown>,
    units: Record<string, unknown>,
  ): void {
    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      if (!(key in data)) continue;

      const fk = (entity as ContractRef).fk;
      if (!fk) continue;

      // Only sync if FK is a declared store field
      const fkEntity = this.contract[fk];
      if (!fkEntity || fkEntity.kind !== ContractFieldKind.State) continue;

      const refEntity = entity as ContractRef;
      const refApi = units[key] as RefManyApi | RefOneApi;
      const cardinality = refEntity.cardinality as "many" | "one";

      if (cardinality === "one") {
        const currentId = (refApi as RefOneApi).$id.getState();
        const fkUnit = units[fk] as StoreWritable<unknown> & { set?: EventCallable<unknown> };
        if (fkUnit && typeof fkUnit.set === "function") {
          fkUnit.set(currentId);
        }
      }
    }
  }

  private clearInstance(id: ModelInstanceId): void {
    const deletionKey = `${this.modelName}:${String(id)}`;
    if (Model.deletionInProgress.has(deletionKey)) return;

    const entry = this.cache.get(id);
    if (!entry) {
      // No global cache entry. The instance may exist only in a fork scope
      // (SSR hydration: scope's $ids/$dataMap have the data, but this process
      // never imperatively created it). Fire registry.removed reactively —
      // the call is happening inside an effect handler running in the active
      // scope, so the event propagates to that scope's $ids and $dataMap.
      // For non-scoped callers with no cache entry, this is an idempotent no-op
      // because filter on an absent id is a no-op.
      this.registry.removed(id);
      return;
    }

    // Collect cascade targets BEFORE cleanup (refs are still readable)
    const cascadeTargets: Array<{ model: Model<any, any>; ids: ModelInstanceId[] }> = [];
    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      const refEntity = entity as ContractRef;
      if (refEntity.onDelete !== "cascade") continue;

      const targetIds = this.getRefTargetIds(refEntity, entry.units[key] as RefManyApi | RefOneApi);
      if (targetIds.length > 0) {
        cascadeTargets.push({
          model: this.resolveRefTarget(key, refEntity),
          ids: targetIds,
        });
      }
    }

    Model.deletionInProgress.add(deletionKey);
    try {
      // $index updates automatically via _dataMapRemoved (fired by registry.removed below).
      for (const sid of entry.registeredSids) {
        Model.sidRegistry.unregister(sid);
      }

      // Unregister ref entries from the RefApiFactory sets
      for (const key of this.contractKeys) {
        const entity = this.contract[key];
        if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
        const refEntity = entity as ContractRef;
        const targetModel = this.resolveRefTarget(key, refEntity);
        const refApi = entry.units[key] as { __refEntry?: ManyEntry | OneEntry };
        const refEntry = refApi?.__refEntry;
        if (refEntry) {
          if ("$ids" in refEntry) {
            targetModel.refApiFactory.unregisterMany(refEntry);
          } else {
            targetModel.refApiFactory.unregisterOne(refEntry);
          }
        }
      }

      // Inverse indexes update automatically when _dataMapRemoved fires below
      // (they derive from $dataMap). We only need to drop the per-target cached
      // $forTarget / $resolvedForTarget stores so future instances with the
      // same id don't inherit stale derivations.
      for (const [, index] of this.inverseIndexes) {
        index.clearTarget(id);
      }

      if (entry.region) clearNode(entry.region, { deep: true });
      // Clean up instance slice (two-tier derivation intermediate store)
      const slice = this._instanceSlices.get(String(id));
      if (slice) {
        clearNode((slice as unknown as { graphite: Node }).graphite, { deep: false });
        this._instanceSlices.delete(String(id));
        this._instanceSliceFieldUpdates.delete(String(id));
        this._instanceSliceSets.delete(String(id));
      }
      this.cache.delete(id);
      if (!this._bulkClearing) {
        this.refApiFactory.cleanupRefsForDeletedId(id);
        this.registry.removed(id);
      }

      // Execute cascade deletes AFTER owner is fully cleaned up
      for (const { model, ids } of cascadeTargets) {
        for (const targetId of ids) {
          model.clearInstance(targetId);
        }
      }
    } finally {
      Model.deletionInProgress.delete(deletionKey);
      this.markSyncDirty();
    }
  }

  /**
   * Walk the onDelete policies of every ref on the instance being deleted and
   * enforce restrict / cascade. The caller may pass a scope-correct `$dataMap`
   * snapshot (supplied by the attach-based `deleteFx` / `clearFx` from the
   * active scope); if omitted, we fall back to the global snapshot.
   *
   * Reading from a snapshot rather than the imperative cache lets validation
   * cover two scenarios:
   *   1. Memory-efficient delete where the cache has been trimmed but the
   *      record still lives in `$dataMap` (unscoped calls).
   *   2. True two-process SSR where both the cache and global `$dataMap` are
   *      empty but the caller's fork-hydrated scope carries the data.
   */
  private validateDeleteRestrictions(
    id: ModelInstanceId,
    visited: Set<string>,
    dataMap?: Record<string, Record<string, unknown>>,
  ): void {
    const key = `${this.modelName}:${String(id)}`;
    if (visited.has(key)) return;
    visited.add(key);

    const map = dataMap ?? this._$dataMap.getState();
    const data = map[String(id)];
    if (!data) return;

    for (const fieldName of this.contractKeys) {
      const entity = this.contract[fieldName];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;

      const refEntity = entity as ContractRef;
      const policy = refEntity.onDelete ?? "nullify";
      if (policy === "nullify") continue;

      const refValue = data[fieldName];
      const targetIds =
        refEntity.cardinality === "many"
          ? Array.isArray(refValue)
            ? (refValue as ModelInstanceId[])
            : []
          : refValue != null
            ? [refValue as ModelInstanceId]
            : [];

      if (policy === "restrict" && targetIds.length > 0) {
        throw new TentaclesError(
          `Cannot delete "${this.modelName}" instance "${String(id)}": ` +
            `ref "${fieldName}" has restrict policy and references [${targetIds.join(", ")}]`,
        );
      }

      if (policy === "cascade") {
        const targetModel = this.resolveRefTarget(fieldName, refEntity);
        // Cross-model cascade: we can't obtain the target model's scoped
        // $dataMap without a scope handle, so cascade recursion reads the
        // target's global snapshot. This is acceptable because cascade
        // semantics don't *prevent* the delete — they only recurse to drive
        // further deletes, and the reactive side-effects propagate to the
        // active scope automatically when `clearInstance` fires.
        for (const targetId of targetIds) {
          targetModel.validateDeleteRestrictions(targetId, visited);
        }
      }
    }
  }

  /** Read current ref target IDs from the instance's units. Uses getState() —
   *  used by `clearInstance` and `handleScopedDelete`. */
  private getRefTargetIds(
    refEntity: ContractRef,
    refApi: RefManyApi | RefOneApi,
  ): ModelInstanceId[] {
    if (refEntity.cardinality === "many") {
      return (refApi as RefManyApi).$ids.getState();
    }
    const val = (refApi as RefOneApi).$id.getState();
    return val != null ? [val] : [];
  }

  /**
   * Collect cascade-delete targets for `id` from a `$dataMap` snapshot rather
   * than `entry.units`. Used by the scoped `deleteFx` handler to drive cascade
   * in two-process SSR scenarios where the instance only exists in the
   * active scope's hydrated dataMap (so there's no cache entry for
   * `clearInstance` to walk).
   */
  private collectCascadeTargetsFromSnapshot(
    id: ModelInstanceId,
    dataMap: Record<string, Record<string, unknown>>,
  ): Array<{ model: Model<any, any>; ids: ModelInstanceId[] }> {
    const result: Array<{ model: Model<any, any>; ids: ModelInstanceId[] }> = [];
    const data = dataMap[String(id)];
    if (!data) return result;

    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      const refEntity = entity as ContractRef;
      if (refEntity.onDelete !== "cascade") continue;

      const refValue = data[key];
      const targetIds: ModelInstanceId[] =
        refEntity.cardinality === "many"
          ? Array.isArray(refValue)
            ? (refValue as ModelInstanceId[])
            : []
          : refValue != null
            ? [refValue as ModelInstanceId]
            : [];

      if (targetIds.length > 0) {
        result.push({
          model: this.resolveRefTarget(key, refEntity),
          ids: targetIds,
        });
      }
    }
    return result;
  }

  /**
   * Scoped delete: semantically "revert this instance's scope-local
   * mutations". Removes `id` from the scoped `$ids`, re-seeds the scoped
   * `$dataMap[id]` with the *current* global entry, and resets scope
   * value overrides. After this call, reads in `scope` fall through to
   * the global state rather than the prior scoped overrides.
   *
   * This is NOT the same as permanently destroying the instance — for
   * that, call `delete(id)` without a scope (which mutates global state).
   */
  private async handleScopedDelete(id: ModelInstanceId, scope: Scope): Promise<void> {
    this.validateDeleteRestrictions(id, new Set());

    const entry = this.cache.get(id);
    if (!entry) return;

    // Collect cascade targets before resetting
    const cascadeTargets: Array<{ model: Model<any, any>; ids: ModelInstanceId[] }> = [];
    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      const refEntity = entity as ContractRef;
      if (refEntity.onDelete !== "cascade") continue;

      const targetIds = this.getRefTargetIds(refEntity, entry.units[key] as RefManyApi | RefOneApi);
      if (targetIds.length > 0) {
        cascadeTargets.push({
          model: this.resolveRefTarget(key, refEntity),
          ids: targetIds,
        });
      }
    }

    // Remove id from scoped $ids. The sample wiring also removes the entry
    // from scoped $dataMap — we re-seed it below with the current global
    // values so scoped reads fall through to global state.
    await allSettled(this.registry.removed, { scope, params: id });

    const globalData = this._$dataMap.getState()[String(id)];
    if (globalData) {
      await allSettled(this._dataMapSet, {
        scope,
        params: { id: String(id), data: globalData },
      });
      const sliceSet = this.getSliceSet(String(id));
      if (sliceSet) {
        await allSettled(sliceSet, { scope, params: globalData });
      }
    }

    // Reset ref scope values
    await this.scopeManager.resetScopeValues(entry.units, scope);

    // Cascade: scope-reset targets
    for (const { model, ids } of cascadeTargets) {
      for (const targetId of ids) {
        await model.delete(targetId, scope);
      }
    }
  }

  /**
   * Returns cached instance, or reconstructs from the global `$dataMap` if
   * data exists (e.g. after hydration on the client). Convenience wrapper
   * around `getInstanceOrReconstructScoped` that reads the global snapshot.
   */
  private getInstanceOrReconstruct(
    id: ModelInstanceId,
  ): FullInstance<Contract, Generics, Ext> | undefined {
    return this.getInstanceOrReconstructScoped(id, this._$dataMap.getState());
  }

  /**
   * Scope-aware variant: receives $dataMap snapshot from combine() so it can
   * reconstruct from scoped data (e.g. after fork({ values }) on the client).
   */
  private getInstanceOrReconstructScoped(
    id: ModelInstanceId,
    dataMap: Record<string, Record<string, unknown>>,
  ): FullInstance<Contract, Generics, Ext> | undefined {
    const cached = this.cache.get(id);
    if (cached) return cached.model;

    const data = dataMap[String(id)];
    if (!data) return undefined;

    this.reconstructInstance(String(id), dataMap);
    return this.cache.get(id)?.model;
  }

  /**
   * Get or lazily create a per-instance standalone store.
   * Decoupled from $dataMap to avoid O(N) graph traversal on field updates.
   */
  private getOrCreateInstanceSlice(
    id: string,
    initialData?: Record<string, unknown>,
  ): StoreWritable<Record<string, unknown>> {
    const existing = this._instanceSlices.get(id);
    if (existing) return existing;

    const instanceId = id;
    const $slice = createStore<Record<string, unknown>>(initialData ?? {}, {
      sid: this.sidRoot
        ? `${this.sidRoot}/tentacles:${this.modelName}:${id}:__slice__`
        : `tentacles:${this.modelName}:${id}:__slice__`,
    });

    // Single per-instance sync: $instanceSlice → $dataMap.
    // Fires when .on(clock, reducer) or resetOn updates $instanceSlice.
    // IMPORTANT: Only merge fields that actually changed in the slice (comparing
    // old slice → new slice). $instanceSlice may have stale values for fields
    // updated via SharedOnRegistry (which updates $dataMap directly, bypassing
    // $instanceSlice). Writing stale slice values back would clobber those updates.
    const contractKeys = this.contractKeys;
    let prevSlice: Record<string, unknown> = initialData ?? {};
    sample({
      clock: $slice,
      source: this._$dataMap,
      fn: (map: Record<string, Record<string, unknown>>, sliceData: Record<string, unknown>) => {
        const existing = map[instanceId];
        if (!existing) {
          prevSlice = sliceData;
          return map;
        }
        // Find fields that changed in this slice update (old slice → new slice)
        const merged = { ...existing };
        let changed = false;
        for (const key of contractKeys) {
          if (prevSlice[key] !== sliceData[key]) {
            merged[key] = sliceData[key];
            changed = true;
          }
        }
        prevSlice = sliceData;
        return changed ? { ...map, [instanceId]: merged } : map;
      },
      target: this._$dataMap,
    });

    this._instanceSlices.set(id, $slice);
    return $slice;
  }

  /** Get or lazily create per-instance field update event. */
  private getSliceFieldUpdate(
    id: string,
  ): EventCallable<{ field: string; value: unknown }> | undefined {
    if (!this._instanceSlices.has(id)) return undefined;
    let ev = this._instanceSliceFieldUpdates.get(id);
    if (!ev) {
      ev = createEvent<{ field: string; value: unknown }>();
      const $slice = this._instanceSlices.get(id)!;
      $slice.on(ev, (s, { field, value }) => {
        if (s[field] === value) return s;
        return { ...s, [field]: value };
      });
      this._instanceSliceFieldUpdates.set(id, ev);
    }
    return ev;
  }

  /** Get or lazily create per-instance full-replace event. */
  private getSliceSet(id: string): EventCallable<Record<string, unknown>> | undefined {
    if (!this._instanceSlices.has(id)) return undefined;
    let ev = this._instanceSliceSets.get(id);
    if (!ev) {
      ev = createEvent<Record<string, unknown>>();
      const $slice = this._instanceSlices.get(id)!;
      $slice.on(ev, (_, data) => data);
      this._instanceSliceSets.set(id, ev);
    }
    return ev;
  }

  /** Shared instance building: create region, units, run builder, cache result. */
  private buildInstance(
    id: string,
    initialData?: Record<string, unknown>,
  ): { result: FullInstance<Contract, Generics, Ext>; units: Record<string, unknown> } {
    let units: Record<string, unknown> = {};
    let registeredSids: string[] = [];

    const getSlice = () => this.getOrCreateInstanceSlice(id, initialData);
    const getSliceFU = () => this.getSliceFieldUpdate(id);

    const buildUnitsAndRun = () => {
      ({ units, registeredSids } = createUnits(
        this.contract,
        (field: string) => `tentacles:${this.modelName}:${id}:${field}`,
        Model.sidRegistry,
        this,
        this._$dataMap,
        getSlice,
        id,
        this._dataMapFieldUpdated,
        this.getCategorizedFields(),
        getSliceFU,
      ));

      if (this._updatedWired) {
        this.wireUpdatedForInstance(id, units);
      }

      // Create $-prefixed view for builder fn using pre-computed mapping
      const prefixedUnits: Record<string, unknown> = {};
      for (const { from, to } of this.prefixMapping) {
        if (from in units) prefixedUnits[to] = units[from];
      }

      return this.builder(prefixedUnits as ContractModel<Contract, Generics>);
    };

    // Lightweight path: skip region + withRegion when model has no refs, computed,
    // resetOn, or inverse fields. Saves 1 createNode (~0.5KB) per instance.
    let region: Node | null = null;
    let result: ContractModel<Contract, Generics> & Ext;
    if (this._isLightweight) {
      try {
        result = buildUnitsAndRun();
      } catch (error) {
        throw error;
      }
    } else {
      region = createNode({
        meta: this.sidRoot ? { sidRoot: this.sidRoot } : {},
      });
      try {
        result = withRegion(region, buildUnitsAndRun);
      } catch (error) {
        for (const sid of registeredSids) {
          Model.sidRegistry.unregister(sid);
        }
        clearNode(region, { deep: true });
        const failedSlice = this._instanceSlices.get(id);
        if (failedSlice) {
          clearNode((failedSlice as unknown as { graphite: Node }).graphite, { deep: false });
          this._instanceSlices.delete(id);
          this._instanceSliceFieldUpdates.delete(id);
          this._instanceSliceSets.delete(id);
        }
        throw error;
      }
    }

    // Merge extensions from builder result into units (skip $-prefixed contract fields)
    for (const key of Object.keys(result)) {
      const bareKey = key.startsWith("$") ? key.slice(1) : key;
      if (bareKey in units || key in units) continue;
      units[key] = (result as Record<string, unknown>)[key];
    }

    const unitShape = { ...result };
    (result as Record<string, unknown>).__id = id;
    (result as Record<string, unknown>).__model = this;
    (result as Record<string, unknown>)["@@unitShape"] = () => unitShape;

    const instanceResult = result as FullInstance<Contract, Generics, Ext>;
    this.cache.set(id, { model: instanceResult, units, region, registeredSids });
    return { result: instanceResult, units };
  }

  /**
   * Build instance WITHOUT withRegion. Used for reconstruction inside combine/map
   * evaluations where withRegion causes graph connections to silently fail.
   * The trade-off: units created here are not owned by a region, so clearNode
   * won't clean them up. This is acceptable for reconstructed instances because
   * they reuse existing $dataMap data and their lifecycle is tied to the model.
   */
  private buildInstanceNoRegion(
    id: string,
    initialData?: Record<string, unknown>,
  ): {
    result: FullInstance<Contract, Generics, Ext>;
    units: Record<string, unknown>;
  } {
    let units: Record<string, unknown> = {};
    let registeredSids: string[] = [];

    const getSlice = () => this.getOrCreateInstanceSlice(id, initialData);
    const getSliceFU = () => this.getSliceFieldUpdate(id);
    const { units: u, registeredSids: s } = createUnits(
      this.contract,
      (field: string) => `tentacles:${this.modelName}:${id}:${field}`,
      Model.sidRegistry,
      this,
      this._$dataMap,
      getSlice,
      id,
      this._dataMapFieldUpdated,
      this.getCategorizedFields(),
      getSliceFU,
    );
    units = u;
    registeredSids = s;

    if (this._updatedWired) {
      this.wireUpdatedForInstance(id, units);
    }

    // Create $-prefixed view for builder fn using pre-computed mapping
    const prefixedUnits: Record<string, unknown> = {};
    for (const { from, to } of this.prefixMapping) {
      if (from in units) prefixedUnits[to] = units[from];
    }

    const result = this.builder(prefixedUnits as ContractModel<Contract, Generics>);

    // Merge extensions from builder result into units
    for (const key of Object.keys(result)) {
      const bareKey = key.startsWith("$") ? key.slice(1) : key;
      if (bareKey in units || key in units) continue;
      units[key] = (result as Record<string, unknown>)[key];
    }

    const unitShape = { ...result };
    (result as Record<string, unknown>).__id = id;
    (result as Record<string, unknown>).__model = this;
    (result as Record<string, unknown>)["@@unitShape"] = () => unitShape;

    const region = this._isLightweight ? null : createNode({});
    const instanceResult = result as FullInstance<Contract, Generics, Ext>;
    this.cache.set(id, { model: instanceResult, units, region, registeredSids });
    return { result: instanceResult, units };
  }

  /**
   * Reconstruct instance from existing $dataMap data (no $dataMap mutation).
   * Used for lazy hydration after fork({ values }).
   *
   * Unlike createInstance, this skips withRegion because reconstruction can be called
   * from inside combine/map evaluations (e.g. model.instance(id)), where withRegion
   * causes all effector graph connections to silently fail with the SWC plugin.
   */
  private reconstructInstance(
    id: string,
    scopedDataMap?: Record<string, Record<string, unknown>>,
  ): void {
    if (this._hasInverseFields) {
      this.resolveInverses();
    }
    const dataMap = scopedDataMap ?? this._$dataMap.getState();
    const initialData = dataMap[id];
    this.buildInstanceNoRegion(id, initialData);
  }

  private createInstance(
    id: string,
    data: CreateData<Contract, Generics>,
  ): { result: FullInstance<Contract, Generics, Ext>; units: Record<string, unknown> } {
    this.clearInstance(id);

    if (this._hasInverseFields) {
      this.resolveInverses();
    }

    // Populate $dataMap entry FIRST — virtual stores derive from it.
    // We pre-validate uniqueness against the current global $dataMap so the
    // throw is synchronous and propagates to the caller. The .on(_dataMapSet)
    // reducer also runs validateUniqueInsert as defense-in-depth for scoped
    // paths (where it propagates as a rejected promise via allSettled).
    const storeData = this.buildStoreData(data as Record<string, unknown>);
    if (this.indexes.uniqueFields.size > 0) {
      this.indexes.validateUniqueInsert(this._$dataMap.getState(), id, storeData);
    }
    this._dataMapSet({ id, data: storeData });

    const built = this.buildInstance(id, storeData);
    this.notifyDataMap(id, built.units, storeData);
    this.registry.add(id);
    this.markSyncDirty();
    return { result: built.result, units: built.units };
  }

  private wireUpdatedForInstance(id: ModelInstanceId, units: Record<string, unknown>): void {
    const target = this.effects.updated as EventCallable<any>;
    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (
        !entity ||
        (entity.kind !== ContractFieldKind.State && entity.kind !== ContractFieldKind.Computed)
      ) {
        continue;
      }
      const store = units[key] as Store<unknown>;
      const fieldName = key;
      sample({
        clock: store.updates,
        fn: (value: unknown) => ({ id, field: fieldName, value }),
        target,
      });
    }
  }

  private extractId(data: Record<string, unknown>): string {
    return this.pkResolver.resolve(data);
  }

  private resolveDefaults(data: Record<string, unknown>): Record<string, unknown> {
    const resolved = { ...data };

    // Pass 0: autoincrement fields (per-field counters)
    if (this._hasAutoIncrement) {
      let changed = false;
      for (const key of this.autoIncrementFields) {
        if (resolved[key] === undefined) {
          this.autoIncrementCounters[key] = (this.autoIncrementCounters[key] ?? 0) + 1;
          resolved[key] = this.autoIncrementCounters[key];
          changed = true;
        } else {
          // Explicit value: bump counter past it to avoid future collisions
          const explicit = resolved[key];
          if (typeof explicit === "number" && explicit >= (this.autoIncrementCounters[key] ?? 0)) {
            this.autoIncrementCounters[key] = explicit;
            changed = true;
          }
        }
      }
      if (changed) {
        this._autoIncrementSet({ ...this.autoIncrementCounters });
      }
    }

    // Pass 1: static defaults from contract (uses pre-computed stateFieldKeys)
    for (const key of this.stateFieldKeys) {
      const storeEntity = this.contract[key] as ContractStore<unknown>;
      if (resolved[key] === undefined && storeEntity.defaultValue !== undefined) {
        resolved[key] = storeEntity.defaultValue;
      }
    }

    // Pass 2: factory defaults from config (may depend on statics resolved above)
    if (this.factoryDefaults) {
      for (const [key, factory] of Object.entries(this.factoryDefaults)) {
        if (resolved[key] === undefined) {
          resolved[key] = factory(resolved);
        }
      }
    }

    return resolved;
  }

  /** Build $dataMap entry: state values + inverse/ref defaults.
   *  Uses pre-computed field category lists to avoid O(C) kind-checking. */
  private buildStoreData(data: Record<string, unknown>): Record<string, unknown> {
    const storeData: Record<string, unknown> = {};
    for (const key of this.stateFieldKeys) {
      storeData[key] = data[key];
    }
    for (const key of this.inverseFieldKeys) {
      storeData[key] = [];
    }
    for (const key of this.refFieldKeys) {
      const refEntity = this.contract[key] as ContractRef;
      if (refEntity.cardinality === "many") {
        storeData[key] = [];
      } else {
        const v = data[key];
        // Pre-populate scalar ref values so processRefs' set() is a $dataMap no-op
        storeData[key] = typeof v === "string" || typeof v === "number" ? v : null;
      }
    }
    return storeData;
  }

  private remapFkFields(data: Record<string, unknown>): void {
    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      const fk = (entity as ContractRef).fk;
      if (!fk) continue;

      if (fk in data && !(key in data)) {
        // Forward: FK → ref (e.g. categoryId: 1 → category: 1)
        const refEntity = entity as ContractRef;
        const fkValue = data[fk];
        if (refEntity.cardinality === "many" && Array.isArray(fkValue)) {
          data[key] = { connect: fkValue };
        } else {
          data[key] = fkValue;
        }
        // Only delete FK key if it's not also a declared store field
        const fkEntity = this.contract[fk];
        if (!fkEntity || fkEntity.kind !== ContractFieldKind.State) {
          delete data[fk];
        }
      } else if (key in data && !(fk in data)) {
        // Reverse: ref → FK (e.g. category: { connect: 1 } → categoryId: 1)
        // Only populate FK if it's a declared store field
        const fkEntity = this.contract[fk];
        if (!fkEntity || fkEntity.kind !== ContractFieldKind.State) continue;
        const refValue = data[key];
        const resolvedId = this.resolveRefValueToId(refValue, key, entity as ContractRef);
        if (resolvedId !== undefined) {
          data[fk] = resolvedId;
        }
      }
    }
  }

  /** Extract the target ID from a ref value (scalar, { connect }, { create }, { connectOrCreate }, inline object) without side effects */
  private resolveRefValueToId(
    value: unknown,
    fieldName?: string,
    refEntity?: ContractRef,
  ): ModelInstanceId | undefined {
    if (typeof value === "string" || typeof value === "number") return value as ModelInstanceId;
    if (typeof value !== "object" || value === null) return undefined;
    const op = value as Record<string, unknown>;

    const resolveViaTarget = (obj: Record<string, unknown>): ModelInstanceId | undefined => {
      if (!refEntity) return undefined;
      const target = this.resolveRefTarget(fieldName, refEntity);
      const raw = target.pkResolver.resolveRaw(obj);
      // Compound keys can't populate a single FK store field
      if (Array.isArray(raw)) return undefined;
      return raw as ModelInstanceId;
    };

    if ("connect" in op) {
      const connectVal = op.connect;
      if (typeof connectVal === "string" || typeof connectVal === "number") {
        return connectVal as ModelInstanceId;
      }
      if (typeof connectVal === "object" && connectVal !== null) {
        return resolveViaTarget(connectVal as Record<string, unknown>);
      }
      return undefined;
    }
    if ("create" in op && typeof op.create === "object" && op.create !== null) {
      return resolveViaTarget(op.create as Record<string, unknown>);
    }
    if (
      "connectOrCreate" in op &&
      typeof op.connectOrCreate === "object" &&
      op.connectOrCreate !== null
    ) {
      return resolveViaTarget(op.connectOrCreate as Record<string, unknown>);
    }
    // Plain inline object — resolve via target pkResolver
    return resolveViaTarget(op);
  }

  private processInverseRefs(
    data: Record<string, unknown>,
    instanceId: ModelInstanceId,
    scope?: Scope,
  ): void | Promise<void> {
    if (!this._hasInverseFields) return;
    this.resolveInverses();

    const promises: Promise<unknown>[] = [];

    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Inverse) continue;

      const value = data[key];
      if (value == null) continue;

      this.validateInverseBound(key);

      const refField = (entity as ContractInverse).refField;
      const sourceThunk = this.inverseSources?.[key];
      const sourceModel = (sourceThunk ? sourceThunk() : this) as Model<any, any, any>;

      const entries = Array.isArray(value) ? value : [value];

      for (const entry of entries) {
        const isId = typeof entry === "string" || typeof entry === "number";

        if (!scope) {
          let sourceId: ModelInstanceId;
          if (isId) {
            sourceId = entry as ModelInstanceId;
            if (!sourceModel.cache.get(String(sourceId) as ModelInstanceId)) {
              throw new TentaclesError(
                `Inverse "${key}": source instance "${sourceId}" not found in "${sourceModel.modelName}"`,
              );
            }
          } else {
            sourceId = (this as Model<any, any, any>).resolveRefElement(entry, sourceModel);
          }
          const sourceEntry = sourceModel.cache.get(String(sourceId) as ModelInstanceId);
          if (!sourceEntry) continue;
          const refApi = sourceEntry.units[refField] as RefManyApi | RefOneApi;
          if ("$ids" in refApi) {
            refApi.add(instanceId);
          } else {
            refApi.set(instanceId);
          }
          continue;
        }

        // Scoped path
        const linkInScope = (srcId: ModelInstanceId) => {
          const srcEntry = sourceModel.cache.get(String(srcId) as ModelInstanceId);
          if (!srcEntry) return Promise.resolve();
          const refApi = srcEntry.units[refField] as RefManyApi | RefOneApi;
          const link = "$ids" in refApi ? refApi.add : refApi.set;
          return allSettled(link, { scope, params: instanceId });
        };

        if (isId) {
          if (!sourceModel.cache.get(String(entry) as ModelInstanceId)) {
            throw new TentaclesError(
              `Inverse "${key}": source instance "${entry}" not found in "${sourceModel.modelName}"`,
            );
          }
          promises.push(linkInScope(entry as ModelInstanceId));
        } else {
          const resolvedId = (this as Model<any, any, any>).resolveRefElement(entry, sourceModel);
          promises.push(linkInScope(resolvedId));
        }
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then(() => {});
    }
  }

  private processRefs(
    data: Record<string, unknown>,
    units: Record<string, unknown>,
    scope?: Scope,
  ): void | Promise<void> {
    const promises: Promise<unknown>[] = [];

    for (const key of this.contractKeys) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;

      const refValue = data[key];
      if (refValue == null) continue;

      const refEntity = entity as ContractRef;
      const targetModel = this.resolveRefTarget(key, refEntity);
      const refApi = units[key] as RefManyApi | RefOneApi;

      if (refEntity.cardinality === "many") {
        const add = (refApi as RefManyApi).add;
        const linkId = (id: ModelInstanceId) => {
          if (!scope) {
            add(id);
          } else {
            promises.push(allSettled(add, { scope, params: id }));
          }
        };

        if (Array.isArray(refValue)) {
          // Plain array shortcut: scalars become `connect`, full objects
          // become `connectOrCreate`. Matches the documented public API
          // where `items: ["i1", "i2"]` == `{ connect: ["i1", "i2"] }` and
          // `items: [{ name: "Foo" }]` == `{ connectOrCreate: [...] }`.
          for (const item of refValue) {
            if (typeof item === "string" || typeof item === "number") {
              linkId(this.resolveRefElement(item as ModelInstanceId, targetModel));
            } else {
              linkId(this.resolveRefElement({ connectOrCreate: item }, targetModel));
            }
          }
        } else {
          // Operation object: { connect?, create?, connectOrCreate? }
          const ops = refValue as Record<string, unknown>;
          if (ops.connect) {
            for (const id of ops.connect as ModelInstanceId[]) {
              linkId(this.resolveRefElement(id, targetModel));
            }
          }
          if (ops.create) {
            for (const createData of ops.create as Record<string, unknown>[]) {
              linkId(this.resolveRefElement({ create: createData }, targetModel));
            }
          }
          if (ops.connectOrCreate) {
            for (const cocData of ops.connectOrCreate as Record<string, unknown>[]) {
              linkId(this.resolveRefElement({ connectOrCreate: cocData }, targetModel));
            }
          }
        }
      } else {
        // "one" refs: scalar | { connect } | { create } | { connectOrCreate } | plain object (connectOrCreate shortcut)
        const link = (refApi as RefOneApi).set;
        const resolved =
          typeof refValue === "object" &&
          refValue !== null &&
          !("connect" in (refValue as Record<string, unknown>)) &&
          !("create" in (refValue as Record<string, unknown>)) &&
          !("connectOrCreate" in (refValue as Record<string, unknown>)) &&
          !("disconnect" in (refValue as Record<string, unknown>))
            ? { connectOrCreate: refValue }
            : refValue;
        const id = this.resolveRefElement(resolved, targetModel);
        if (!scope) {
          link(id);
        } else {
          promises.push(allSettled(link, { scope, params: id }));
        }
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then(() => {});
    }
  }
}
