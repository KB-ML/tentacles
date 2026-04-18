import { combine, type Store } from "effector";
import type { ModelInstanceId } from "./types";

/**
 * Cardinality of the underlying ref field whose inverse this index represents.
 * `many` → source's `refField` value is an array of target ids.
 * `one`  → source's `refField` value is a scalar target id (or null/undefined).
 */
export type InverseCardinality = "many" | "one";

/**
 * Per-target inverse index derived from the *source* model's `$dataMap` store
 * via a `.map()` derivation. Scope correctness is automatic because `.map()` is
 * a pure function of source state — `scope.getState($inverse)` evaluates the
 * derivation against the scope's source dataMap (including `fork({values})`
 * hydrated state).
 *
 * No imperative state lives here: no `Map<targetId, Set<sourceId>>` class field,
 * no `linkImperative` / `unlinkImperative`, no `bump` event. Ref mutations
 * write to the source's `$dataMap` via `virtual-field-store`; the inverse
 * recomputes downstream automatically.
 *
 * **Phase 9 investigation (deferred).** A prior revision of this file attempted
 * an incremental diff via effector's `.map((state, prev) => ...)` callback,
 * carrying forward both the prior `byTarget` and the prior dataMap reference.
 * Direct benchmarking showed the diff is NOT faster than a full rebuild on a
 * 10k-row source map because both approaches must walk `Object.keys(dataMap)`
 * O(N) times — the short-circuit `newRow === oldRow` comparison is cheap but
 * still requires iterating every key, and the two-pass structure (additions/
 * mutations, then deletions) doubled the iteration count. A genuine speedup
 * would require external "which row changed" signalling (e.g. a side-channel
 * store fed by `_dataMapFieldUpdated`) so the inverse can rewire exactly the
 * changed entry without iterating unchanged rows. That is a larger change
 * and is deferred until a real workload shows the rebuild cost matters — on
 * measured hardware, the `.map()` derivation costs ~250µs per full rebuild
 * on 10k rows, which supports ~4000 ref mutations/second of inverse headroom.
 */
export class InverseIndex {
  private readonly $byTarget: Store<ReadonlyMap<ModelInstanceId, ReadonlySet<ModelInstanceId>>>;
  private readonly sourceDataMap: Store<Record<string, Record<string, unknown>>>;
  private readonly getSourceInstanceScoped: (
    id: ModelInstanceId,
    dataMap: Record<string, Record<string, unknown>>,
  ) => unknown;
  private readonly storeCache = new Map<ModelInstanceId, Store<ModelInstanceId[]>>();
  private readonly resolvedCache = new Map<ModelInstanceId, Store<unknown[]>>();

  constructor(
    sourceDataMap: Store<Record<string, Record<string, unknown>>>,
    _modelName: string,
    private readonly refField: string,
    cardinality: InverseCardinality,
    getSourceInstanceScoped: (
      id: ModelInstanceId,
      dataMap: Record<string, Record<string, unknown>>,
    ) => unknown,
  ) {
    const field = this.refField;
    const isMany = cardinality === "many";

    this.sourceDataMap = sourceDataMap;
    this.getSourceInstanceScoped = getSourceInstanceScoped;
    this.$byTarget = sourceDataMap.map((dataMap) => buildByTarget(dataMap, field, isMany));
  }

  /**
   * Reactive list of source ids that point at `targetId`. Cached per target so
   * multiple consumers (e.g., widgets rendering the same category) share the
   * same `.map()` node in the effector graph.
   */
  $forTarget(targetId: ModelInstanceId): Store<ModelInstanceId[]> {
    const cached = this.storeCache.get(targetId);
    if (cached) return cached;

    const store = this.$byTarget.map((byTarget) => {
      const set = byTarget.get(targetId);
      return set ? [...set] : [];
    });
    this.storeCache.set(targetId, store);
    return store;
  }

  /**
   * Reactive list of resolved source instances for `targetId`. Filters out ids
   * that have no instance in the current scope (e.g., dangling refs after a
   * cascade delete).
   *
   * Uses `combine($forTarget, sourceDataMap)` so the scoped dataMap is
   * available inside the derivation. The source-instance retentacler receives
   * the scope-correct snapshot, so instances are materialised against the
   * right data even in `fork({values})` hydrated scopes where the global
   * cache is empty.
   */
  $resolvedForTarget(targetId: ModelInstanceId): Store<unknown[]> {
    const cached = this.resolvedCache.get(targetId);
    if (cached) return cached;

    const $ids = this.$forTarget(targetId);
    const getSourceInstanceScoped = this.getSourceInstanceScoped;
    const store = combine(
      $ids,
      this.sourceDataMap,
      (ids: ModelInstanceId[], dataMap: Record<string, Record<string, unknown>>) =>
        ids
          .map((id) => getSourceInstanceScoped(id, dataMap))
          .filter((inst): inst is NonNullable<typeof inst> => inst != null),
    );
    this.resolvedCache.set(targetId, store);
    return store;
  }

  /**
   * Drop the cached derived stores for a target. Called when a target instance
   * is deleted so future instances with the same id don't inherit a stale
   * `.map()` node. The underlying `$byTarget` state is not touched — it updates
   * automatically when the corresponding source entries mutate in `$dataMap`.
   */
  clearTarget(targetId: ModelInstanceId): void {
    this.storeCache.delete(targetId);
    this.resolvedCache.delete(targetId);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pure derivation — given a snapshot of the source dataMap, build the
// `byTarget` Map from scratch. Called from inside `.map()` so callers see
// per-scope state automatically.
// ─────────────────────────────────────────────────────────────────────────

function buildByTarget(
  dataMap: Record<string, Record<string, unknown>>,
  field: string,
  isMany: boolean,
): ReadonlyMap<ModelInstanceId, ReadonlySet<ModelInstanceId>> {
  const byTarget = new Map<ModelInstanceId, Set<ModelInstanceId>>();

  for (const sourceId of Object.keys(dataMap)) {
    const data = dataMap[sourceId];
    if (!data) continue;
    const value = data[field];

    if (isMany) {
      if (!Array.isArray(value)) continue;
      for (const target of value) {
        if (target == null) continue;
        const targetId = target as ModelInstanceId;
        let set = byTarget.get(targetId);
        if (!set) {
          set = new Set();
          byTarget.set(targetId, set);
        }
        set.add(sourceId as ModelInstanceId);
      }
    } else {
      if (value == null) continue;
      const targetId = value as ModelInstanceId;
      let set = byTarget.get(targetId);
      if (!set) {
        set = new Set();
        byTarget.set(targetId, set);
      }
      set.add(sourceId as ModelInstanceId);
    }
  }

  return byTarget;
}
