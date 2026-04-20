import { createEvent, createStore, type EventCallable, type Store } from "effector";
import { type CompoundKey, InstanceCache } from "./instance-cache";
import type { ModelInstanceId } from "./types";

export class ModelRegistry<Instance> {
  public readonly $ids: Store<ModelInstanceId[]>;

  public readonly add: EventCallable<ModelInstanceId>;
  public readonly addMany: EventCallable<ModelInstanceId[]>;
  public readonly removed: EventCallable<ModelInstanceId>;
  public readonly clear: EventCallable<void>;
  public readonly reorder: EventCallable<ModelInstanceId[]>;

  /** O(1) membership check derived from $ids. */
  public readonly $idSet: Store<Set<ModelInstanceId>>;

  private _$pkeys?: Store<CompoundKey[]>;
  private _$count?: Store<number>;
  private readonly _hasStores = new Map<string, Store<boolean>>();

  private readonly getCompoundKey: (id: string) => CompoundKey | undefined;
  private readonly getInstance: (id: ModelInstanceId) => Instance | undefined;
  /**
   * Reconstructs from the global `$dataMap` if needed. Used by the sync
   * `.get()` / `.instances()` APIs.
   */
  private readonly getInstanceOrReconstruct: (id: ModelInstanceId) => Instance | undefined;

  constructor(
    modelName: string,
    getCompoundKey: (id: string) => CompoundKey | undefined,
    getInstance: (id: ModelInstanceId) => Instance | undefined,
    getInstanceOrReconstruct: (id: ModelInstanceId) => Instance | undefined,
  ) {
    this.getCompoundKey = getCompoundKey;
    this.getInstance = getInstance;
    this.getInstanceOrReconstruct = getInstanceOrReconstruct;

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

    // O(1) Set derived from $ids — used for fast membership checks.
    this.$idSet = this.$ids.map((ids) => new Set(ids));
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

  /**
   * Returns a memoized scalar boolean store: `true` if `id` is in `$ids`.
   *
   * Because effector's default equality suppresses duplicate emissions for
   * primitive values, consumers subscribed via `useUnit(model.has(id))`
   * re-render only when membership actually flips — NOT when unrelated ids
   * or fields change (which is the problem with `$idSet`, whose `.map` emits
   * a fresh `Set` reference on every upstream emission).
   *
   * **Laziness.** The returned value is a Store-shaped proxy — the underlying
   * `$ids.map(...)` effector node is NOT created until a store member is
   * actually accessed (`.graphite`, `.watch`, `.subscribe`, `.map`,
   * `.getState`, `.updates`, etc.). Mirrors the lazy pattern used by
   * `createFieldProxy` in `field-proxy.ts`.
   *
   * The cache is unbounded for the model's lifetime — each entry is a single
   * proxy (and at most one underlying `.map` store) tied to a specific id.
   * Rule #6 (no `watch`) forbids a clear-time cleanup watcher; the leak is
   * negligible in practice.
   */
  has(id: ModelInstanceId): Store<boolean> {
    const key = String(id);
    const cached = this._hasStores.get(key);
    if (cached) return cached;
    const ids$ = this.$ids;
    let inner: Store<boolean> | null = null;
    const ensure = (): Store<boolean> => {
      if (!inner) inner = ids$.map((ids) => ids.includes(key));
      return inner;
    };
    const proxy = {
      kind: "store" as const,
      get sid() {
        return ensure().sid;
      },
      get shortName() {
        return ensure().shortName;
      },
      get compositeName() {
        return ensure().compositeName;
      },
      get graphite() {
        return (ensure() as unknown as { graphite: unknown }).graphite;
      },
      get stateRef() {
        return (ensure() as unknown as { stateRef: unknown }).stateRef;
      },
      get updates() {
        return ensure().updates;
      },
      get defaultState() {
        return ensure().defaultState;
      },
      getState(): boolean {
        return ensure().getState();
      },
      watch(...args: Parameters<Store<boolean>["watch"]>) {
        return ensure().watch(...args);
      },
      subscribe(...args: Parameters<Store<boolean>["subscribe"]>) {
        return ensure().subscribe(...args);
      },
      map(...args: Parameters<Store<boolean>["map"]>) {
        return (ensure().map as (...a: unknown[]) => unknown)(...args);
      },
      thru(...args: Parameters<Store<boolean>["thru"]>) {
        return (ensure().thru as (...a: unknown[]) => unknown)(...args);
      },
    };
    const store = proxy as unknown as Store<boolean>;
    this._hasStores.set(key, store);
    return store;
  }

  /**
   * Synchronous instance lookup. Returns the stable proxy Instance or null.
   *
   * - Fast path: global cache hit.
   * - Otherwise: if `$dataMap` has data for this id (e.g. after
   *   `fork({ values })` hydration), reconstructs and caches the proxy.
   *
   * Instance field stores are scope-aware via `$dataMap`, so a single proxy
   * safely serves all scopes.
   */
  get(id: ModelInstanceId): Instance | null;
  get(...parts: [string | number, string | number, ...(string | number)[]]): Instance | null;
  get(...args: (string | number)[]): Instance | null {
    const serializedId =
      args.length === 1
        ? String(args[0])
        : args.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);
    const cached = this.getInstance(serializedId);
    if (cached) return cached;
    const reconstructed = this.getInstanceOrReconstruct(serializedId);
    return reconstructed ?? null;
  }

  /**
   * Synchronous list of all live Instance proxies (global scope).
   * For scoped reads, use `scope.getState(model.$ids)` + `model.get(id)`.
   */
  instances(): Instance[] {
    const ids = this.$ids.getState();
    const out: Instance[] = [];
    for (const id of ids) {
      const cached = this.getInstance(id);
      if (cached) {
        out.push(cached);
        continue;
      }
      const reconstructed = this.getInstanceOrReconstruct(id);
      if (reconstructed) out.push(reconstructed);
    }
    return out;
  }
}
