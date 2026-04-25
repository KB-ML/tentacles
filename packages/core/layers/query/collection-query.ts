import {
  combine,
  createEffect,
  createEvent,
  createStore,
  type Event,
  type EventCallable,
  is,
  type Store,
  sample,
  withRegion,
} from "effector";
import type { ContractStore } from "../contract";
import { ContractFieldKind } from "../contract";
import type { IndexState } from "../model/model-indexes";
import type { ModelInstanceId, UpdateData } from "../model/types";
import { QueryDescriptor } from "./query-descriptor";
import { QueryField } from "./query-field";
import type { QueryRegistry } from "./query-registry";
import type { Operator, QueryContext, Reactive } from "./types";
import type {
  QueryableFieldNames,
  QueryDataRecord,
  QueryFieldValueType,
} from "./types/query-types";

type InstanceWithId = { __id: ModelInstanceId };

export class CollectionQuery<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
  Instance extends InstanceWithId = InstanceWithId,
> {
  private _$filtered?: Store<ModelInstanceId[]>;
  private _$sorted?: Store<ModelInstanceId[]>;
  private _$list?: Store<QueryDataRecord<Contract, Generics, Ext>[]>;
  private _$count?: Store<number>;
  private _$totalCount?: Store<number>;
  private _$ids?: Store<ModelInstanceId[]>;
  private _$first?: Store<QueryDataRecord<Contract, Generics, Ext> | null>;
  private _updated?: Event<{ id: string; field: string; value: unknown }>;
  private _update?: EventCallable<Record<string, unknown>>;
  private _delete?: EventCallable<void>;
  private readonly _fields = new Map<string, QueryField<unknown>>();

  constructor(
    readonly descriptor: QueryDescriptor,
    private readonly context: QueryContext<Instance>,
    private readonly queryRegistry: QueryRegistry<Contract, Generics, Ext, Instance>,
    private readonly presetIds?: Store<ModelInstanceId[]>,
  ) {}

  // ═══ Chaining ═══

  where<F extends QueryableFieldNames<Contract, Ext> & string>(
    field: F,
    operator: Operator<QueryFieldValueType<Contract, Generics, Ext, F>>,
  ): CollectionQuery<Contract, Generics, Ext, Instance> {
    return this.queryRegistry.getOrCreate(
      this.descriptor.addWhere({ field, operator: operator as Operator }),
    );
  }

  when<T>(
    $condition: Store<T | null>,
    fn: (
      query: CollectionQuery<Contract, Generics, Ext, Instance>,
      value: T,
    ) => CollectionQuery<Contract, Generics, Ext, Instance>,
  ): CollectionQuery<Contract, Generics, Ext, Instance> {
    return this.queryRegistry.getOrCreate(
      this.descriptor.addWhen({
        $condition: $condition as Store<unknown>,
        conditionId: QueryDescriptor.storeId($condition as Store<unknown>),
        applyFn: fn as (query: unknown, value: unknown) => unknown,
      }),
    );
  }

  orderBy<F extends QueryableFieldNames<Contract, Ext> & string>(
    field: F | Store<F>,
    direction: Reactive<"asc" | "desc"> = "asc",
  ): CollectionQuery<Contract, Generics, Ext, Instance> {
    return this.queryRegistry.getOrCreate(
      this.descriptor.addOrderBy({
        field: field as Reactive<string>,
        direction,
        fieldId: is.store(field) ? QueryDescriptor.storeId(field as Store<unknown>) : undefined,
        directionId: is.store(direction)
          ? QueryDescriptor.storeId(direction as Store<unknown>)
          : undefined,
      }),
    );
  }

  limit(n: Reactive<number>): CollectionQuery<Contract, Generics, Ext, Instance> {
    return this.queryRegistry.getOrCreate(this.descriptor.withLimit(n));
  }

  offset(n: Reactive<number>): CollectionQuery<Contract, Generics, Ext, Instance> {
    return this.queryRegistry.getOrCreate(this.descriptor.withOffset(n));
  }

  distinct<F extends QueryableFieldNames<Contract, Ext> & string>(
    field: F,
  ): CollectionQuery<Contract, Generics, Ext, Instance> {
    return this.queryRegistry.getOrCreate(this.descriptor.withDistinct(field));
  }

  groupBy<F extends QueryableFieldNames<Contract, Ext> & string>(field: F) {
    return this.queryRegistry.getOrCreateGrouped(
      this.descriptor.withGroupBy(field),
      () => this.$filtered,
    );
  }

  // ═══ Reactivity — staged pipeline (no getState) ═══
  //
  // All stages derive from $dataMap (reactive data snapshot) via combine().
  // No getState() calls anywhere in reactive derivations.
  //
  // Stage 1: $filtered  = WHERE + when() + DISTINCT
  // Stage 2: $sorted    = ORDER BY
  // Stage 3: $list      = OFFSET + LIMIT
  // $totalCount = $filtered.map(len)

  /** Cached empty query for when() clause evaluation — avoids repeated lookups. */
  private _emptyQuery?: CollectionQuery<Contract, Generics, Ext, Instance>;

  private getEmptyQuery(): CollectionQuery<Contract, Generics, Ext, Instance> {
    if (!this._emptyQuery) {
      this._emptyQuery = this.queryRegistry.getOrCreate(QueryDescriptor.empty());
    }
    return this._emptyQuery;
  }

  private matchesPredicate(
    data: Record<string, unknown>,
    reactiveValues: Map<Store<unknown>, unknown>,
  ): boolean {
    for (const clause of this.descriptor.whereClauses) {
      const value = data[clause.field];
      const operand = clause.operator.$operand
        ? reactiveValues.get(clause.operator.$operand)
        : clause.operator.operand;
      if (!clause.operator.predicate(value, operand)) return false;
    }
    // when() clauses
    for (const when of this.descriptor.whenClauses) {
      const conditionValue = reactiveValues.get(when.$condition);
      if (!conditionValue) continue;
      const subQuery = when.applyFn(this.getEmptyQuery(), conditionValue) as CollectionQuery<
        Contract,
        Generics,
        Ext,
        Instance
      >;
      for (const subClause of subQuery.descriptor.whereClauses) {
        const subValue = data[subClause.field];
        if (subValue === undefined) continue;
        const subOperand = subClause.operator.$operand
          ? reactiveValues.get(subClause.operator.$operand)
          : subClause.operator.operand;
        if (!subClause.operator.predicate(subValue, subOperand)) return false;
      }
    }
    return true;
  }

  /** Build a Map of Store → current value from combine() result array */
  private buildReactiveValues(
    stores: Store<unknown>[],
    values: unknown[],
  ): Map<Store<unknown>, unknown> {
    const map = new Map<Store<unknown>, unknown>();
    for (let i = 0; i < stores.length; i++) {
      map.set(stores[i] as Store<unknown>, values[i]);
    }
    return map;
  }

  // ═══ Index plan — detect indexable WHERE clauses ═══

  /**
   * Cached index plan. Depends only on the descriptor's where clauses + the
   * model contract, neither of which change after construction. `null` means
   * "no indexable clause", `undefined` means "not yet computed".
   */
  private _indexPlan?: { clauseIdx: number; field: string; type: "eq" | "oneOf" } | null;

  private getIndexPlan(): { clauseIdx: number; field: string; type: "eq" | "oneOf" } | null {
    if (this._indexPlan !== undefined) return this._indexPlan;
    if (!this.context.$index) {
      this._indexPlan = null;
      return null;
    }
    const contract = this.context.getContract();
    const clauses = this.descriptor.whereClauses;

    let best: { clauseIdx: number; field: string; type: "eq" | "oneOf"; unique: boolean } | null =
      null;

    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i] as (typeof clauses)[number];
      const opName = clause.operator.name;
      if (opName !== "eq" && opName !== "oneOf") continue;

      const entity = contract[clause.field];
      if (!entity || entity.kind !== ContractFieldKind.State) continue;
      const store = entity as ContractStore<unknown>;
      if (!store.isUnique && !store.isIndexed) continue;

      // Prefer unique (at most 1 result) over non-unique
      if (!best || (store.isUnique && !best.unique)) {
        best = {
          clauseIdx: i,
          field: clause.field,
          type: opName as "eq" | "oneOf",
          unique: store.isUnique,
        };
      }
    }

    this._indexPlan = best;
    return best;
  }

  /**
   * Resolve index candidates from a scope-correct IndexState. Returns null when
   * the index can't be trusted (e.g. SSR fork({values}) where the index store
   * was never populated by events) so the caller falls back to full scan.
   *
   * Consistency check is O(1): compare the index's tracked-id count against
   * the registry's id count. They match in normal flow (both updated by the
   * same model events) and diverge only in the fork({values}) hydration case
   * where $ids was rehydrated from serialized values but $index was not.
   */
  private resolveIndexCandidates(
    plan: { field: string; type: "eq" | "oneOf" },
    operandValue: unknown,
    indexState: IndexState,
    idsLength: number,
  ): string[] | null {
    if (indexState.byId.size !== idsLength) return null;

    const fieldMap = indexState.byValue.get(plan.field);
    if (!fieldMap) return null;

    if (plan.type === "eq") {
      const ids = fieldMap.get(operandValue);
      return ids ? [...ids] : [];
    }
    // oneOf: union index lookups for each value
    const values = operandValue as unknown[];
    if (!Array.isArray(values) || values.length === 0) return null;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const v of values) {
      const ids = fieldMap.get(v);
      if (ids) {
        for (const id of ids) {
          if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
          }
        }
      }
    }
    return result;
  }

  // ═══ Stage 1: $filtered — WHERE + when() + DISTINCT ═══
  //
  // Holds ModelInstanceId[] (ordered). Incremental: full scan on $ids/$operand
  // changes, O(1) update on field mutations via $fieldUpdated.

  /** Run full scan and return filtered ids in input order. */
  private fullScan(
    ids: ModelInstanceId[],
    dataMap: Record<string, Record<string, unknown>>,
    reactiveValues: Map<Store<unknown>, unknown>,
    indexState: IndexState | null,
  ): ModelInstanceId[] {
    const d = this.descriptor;
    const distinctField = d.distinctField;
    const indexPlan = indexState ? this.getIndexPlan() : null;

    let iterateIds: Iterable<string | ModelInstanceId> = ids;
    if (indexPlan && indexState) {
      const clause = d.whereClauses[indexPlan.clauseIdx] as (typeof d.whereClauses)[number];
      const operandValue = clause.operator.$operand
        ? reactiveValues.get(clause.operator.$operand)
        : clause.operator.operand;
      const candidates = this.resolveIndexCandidates(
        indexPlan,
        operandValue,
        indexState,
        ids.length,
      );
      if (candidates) iterateIds = candidates;
    }

    const results: ModelInstanceId[] = [];
    const seen = distinctField ? new Set<unknown>() : undefined;
    for (const id of iterateIds) {
      const data = dataMap[String(id)];
      if (!data) continue;
      if (!this.matchesPredicate(data, reactiveValues)) continue;
      if (seen) {
        const val = data[distinctField as string];
        if (seen.has(val)) continue;
        seen.add(val);
      }
      results.push(id as ModelInstanceId);
    }
    return results;
  }

  private get $filtered(): Store<ModelInstanceId[]> {
    if (this.presetIds) return this.presetIds;
    if (!this._$filtered) {
      this._$filtered = withRegion(this.context.region, (): Store<ModelInstanceId[]> => {
        const d = this.descriptor;
        const hasFilter = d.whereClauses.length > 0 || d.whenClauses.length > 0 || d.distinctField;

        if (!hasFilter) {
          return this.context.$ids;
        } else {
          const reactiveStores: Store<unknown>[] = [];
          for (const c of d.whereClauses) {
            if (c.operator.$operand) reactiveStores.push(c.operator.$operand);
          }
          for (const c of d.whenClauses) {
            reactiveStores.push(c.$condition);
          }

          const ctx = this.context;
          const buildRV = this.buildReactiveValues;
          const rStores = reactiveStores;

          // The model exposes $index only when it has unique/indexed fields.
          // We thread it through the combine so the query layer always reads the
          // scope-correct snapshot at filter time. When the model has no indexes
          // we skip it entirely (no extra graph node).
          const $index = ctx.$index;
          const indexSlot = $index ? 1 : 0;

          // Full scan on structural changes ($ids, operands). Field mutations handled incrementally.
          // $dataMap is always in the combine (for SSR scope correctness), but we skip full scan
          // when only $dataMap changed (field mutation) — the incremental sample handles it.
          const hasFU = !!ctx.$fieldUpdated && !d.distinctField;
          let prevIds: ModelInstanceId[] | null = null;
          let prevOperands: unknown[] | null = null;
          let prevResult: ModelInstanceId[] = [];

          const sources: Store<unknown>[] = $index
            ? [ctx.$ids, ctx.$dataMap, $index as Store<unknown>, ...reactiveStores]
            : [ctx.$ids, ctx.$dataMap, ...reactiveStores];

          const $store = combine(sources).map((combined) => {
            const ids = combined[0] as ModelInstanceId[];
            const dataMap = combined[1] as Record<string, Record<string, unknown>>;
            const indexState = ($index ? (combined[2] as IndexState) : null) as IndexState | null;
            const operandSlice = combined.slice(2 + indexSlot);
            const reactiveValues = buildRV(rStores, operandSlice);

            if (hasFU && prevIds !== null) {
              const idsChanged = ids !== prevIds;
              const operandsChanged =
                prevOperands !== null && operandSlice.some((v, i) => v !== prevOperands![i]);
              if (!idsChanged && !operandsChanged) {
                // Field mutation only — return same reference so effector skips update.
                // The incremental sample handles the actual update.
                prevIds = ids;
                prevOperands = operandSlice;
                return prevResult;
              }
            }
            prevIds = ids;
            prevOperands = operandSlice;
            prevResult = this.fullScan(ids, dataMap, reactiveValues, indexState);
            return prevResult;
          }) as unknown as ReturnType<typeof createStore<ModelInstanceId[]>>;
          ($store as unknown as { targetable: boolean }).targetable = true;
          ($store as unknown as { graphite: { meta: { derived: number } } }).graphite.meta.derived =
            0;

          // Incremental update on field mutations — O(1) per mutation instead of O(N).
          // Skipped for DISTINCT queries (need full scan to deduplicate).
          // Uses $store.on() instead of sample(target: $store) so that multiple field
          // updates in the same tick each see the result of the previous one.
          if (ctx.$fieldUpdated && !d.distinctField) {
            const matchPred = this.matchesPredicate.bind(this);
            const $operands = rStores.length > 0 ? combine(rStores) : createStore<unknown[]>([]);

            const fieldUpdatePayload = sample({
              clock: ctx.$fieldUpdated,
              source: {
                dataMap: ctx.$dataMap,
                idSet: ctx.$idSet,
                operands: $operands,
              },
              fn: (
                src: {
                  dataMap: Record<string, Record<string, unknown>>;
                  idSet: Set<ModelInstanceId>;
                  operands: unknown[];
                },
                clock: { id: string },
              ) => ({ ...src, id: clock.id }),
            });

            $store.on(
              fieldUpdatePayload,
              (
                filtered: ModelInstanceId[],
                payload: {
                  id: string;
                  dataMap: Record<string, Record<string, unknown>>;
                  idSet: Set<ModelInstanceId>;
                  operands: unknown[];
                },
              ) => {
                const { id, dataMap, idSet, operands } = payload;
                if (!idSet.has(id)) return filtered;
                const data = dataMap[id];
                if (!data) return filtered;

                const reactiveValues = buildRV(rStores, operands);
                const matches = matchPred(data, reactiveValues);

                const existingIdx = filtered.findIndex((fId) => String(fId) === id);
                const wasIn = existingIdx !== -1;

                if (matches && wasIn) return filtered;
                if (!matches && !wasIn) return filtered;

                let next: ModelInstanceId[];
                if (matches && !wasIn) {
                  next = [...filtered, id as ModelInstanceId];
                } else {
                  next = filtered.slice();
                  next.splice(existingIdx, 1);
                }
                // Keep prevResult in sync so the .map() closure doesn't overwrite
                // this result with a stale reference on the next $dataMap change.
                prevResult = next;
                return next;
              },
            );
          }

          return $store;
        }
      });
    }
    return this._$filtered;
  }

  // ═══ Stage 2: $sorted — ORDER BY ═══

  private get $sorted(): Store<ModelInstanceId[]> {
    if (!this._$sorted) {
      this._$sorted = withRegion(this.context.region, (): Store<ModelInstanceId[]> => {
        const d = this.descriptor;

        if (d.orderByClauses.length === 0) {
          return this.$filtered;
        } else {
          const reactiveStores: Store<unknown>[] = [];
          for (const o of d.orderByClauses) {
            if (is.store(o.field)) reactiveStores.push(o.field as Store<unknown>);
            if (is.store(o.direction)) reactiveStores.push(o.direction as Store<unknown>);
          }

          const ctx = this.context;
          const orderByClauses = d.orderByClauses;
          const rStores = reactiveStores;
          const buildRV = this.buildReactiveValues;

          // Resolve sort field names (static, not reactive) for cheap field-change detection
          const staticSortFields = new Set<string>();
          for (const o of orderByClauses) {
            if (!is.store(o.field)) staticSortFields.add(o.field as string);
          }

          const doSort = (
            filtered: ModelInstanceId[],
            dataMap: Record<string, Record<string, unknown>>,
            reactiveValues: Map<Store<unknown>, unknown>,
          ) => {
            const sorted = [...filtered];
            const resolvedClauses = orderByClauses.map((clause) => ({
              field: is.store(clause.field)
                ? (reactiveValues.get(clause.field as Store<unknown>) as string)
                : (clause.field as string),
              asc:
                (is.store(clause.direction)
                  ? (reactiveValues.get(clause.direction as Store<unknown>) as string)
                  : (clause.direction as string)) === "asc",
            }));
            sorted.sort((a, b) => {
              const dataA = dataMap[String(a)];
              const dataB = dataMap[String(b)];
              if (!dataA || !dataB) return 0;
              for (const { field, asc } of resolvedClauses) {
                const valA = dataA[field] as string | number;
                const valB = dataB[field] as string | number;
                if (valA < valB) return asc ? -1 : 1;
                if (valA > valB) return asc ? 1 : -1;
              }
              return 0;
            });
            return sorted;
          };

          // Sort-field mutation counter: bumps ONLY when a sort field is mutated.
          // Unlike `$lastField`, this emits a distinct value every time (via ++),
          // so repeated mutations to the same sort field all trigger re-sort.
          const $sortFieldBump = ctx.$fieldUpdated
            ? createStore(0).on(ctx.$fieldUpdated, (n, { field }) =>
                staticSortFields.has(field) ? n + 1 : n,
              )
            : null;

          // Derive $sorted from $filtered + $dataMap, but only re-sort when
          // $filtered changes (add/remove), sort operands change, or a sort-field
          // was mutated ($sortFieldBump incremented). $dataMap is in the combine
          // for SSR scope correctness but we memoize to skip re-sort (and avoid
          // emitting a new array ref) when only non-sort fields changed.
          const sortTriggers: Store<unknown>[] = [this.$filtered, ...reactiveStores];
          if ($sortFieldBump) sortTriggers.push($sortFieldBump as Store<unknown>);

          let prevFiltered: ModelInstanceId[] | null = null;
          let prevOperands: unknown[] | null = null;
          let prevBump: number | undefined;
          let prevSorted: ModelInstanceId[] = [];

          return combine([...sortTriggers, ctx.$dataMap]).map((combined) => {
            const filtered = combined[0] as ModelInstanceId[];
            const dataMap = combined[combined.length - 1] as Record<
              string,
              Record<string, unknown>
            >;
            const operandEnd = $sortFieldBump ? combined.length - 2 : combined.length - 1;
            const operandSlice = combined.slice(1, operandEnd);
            const currentBump = $sortFieldBump
              ? (combined[combined.length - 2] as number)
              : undefined;

            if (prevFiltered !== null) {
              const filteredChanged = filtered !== prevFiltered;
              const operandsChanged =
                prevOperands !== null && operandSlice.some((v, i) => v !== prevOperands![i]);
              const sortFieldMutated = currentBump !== prevBump;

              if (!filteredChanged && !operandsChanged && !sortFieldMutated) {
                prevFiltered = filtered;
                prevOperands = operandSlice;
                prevBump = currentBump;
                return prevSorted;
              }
            }

            prevFiltered = filtered;
            prevOperands = operandSlice;
            prevBump = currentBump;
            prevSorted = doSort(filtered, dataMap, buildRV(rStores, operandSlice));
            return prevSorted;
          });
        }
      });
    }
    return this._$sorted;
  }

  // ═══ Stage 3: $ids — OFFSET + LIMIT (id pipeline) ═══

  /**
   * Paginated ids in display order. Internally the authoritative post-pagination
   * stream — `$list` and `$first` project rows from it + `$dataMap`.
   */
  get $ids(): Store<ModelInstanceId[]> {
    if (!this._$ids) {
      this._$ids = withRegion(this.context.region, (): Store<ModelInstanceId[]> => {
        const d = this.descriptor;
        const hasPagination = d.limitValue !== undefined || d.offsetValue !== undefined;

        if (!hasPagination) {
          return this.$sorted;
        }
        const reactiveStores: Store<unknown>[] = [];
        if (is.store(d.offsetValue)) reactiveStores.push(d.offsetValue as Store<unknown>);
        if (is.store(d.limitValue)) reactiveStores.push(d.limitValue as Store<unknown>);

        const offsetValue = d.offsetValue;
        const limitValue = d.limitValue;

        return combine([this.$sorted, ...reactiveStores]).map((combined) => {
          let results = combined[0] as ModelInstanceId[];

          const offset =
            offsetValue !== undefined
              ? is.store(offsetValue)
                ? (combined[1] as number)
                : (offsetValue as number)
              : 0;
          if (offset > 0) results = results.slice(offset);

          const limitIdx = is.store(offsetValue) ? 2 : 1;
          const limit =
            limitValue !== undefined
              ? is.store(limitValue)
                ? (combined[limitIdx] as number)
                : (limitValue as number)
              : undefined;
          if (limit !== undefined) results = results.slice(0, limit);

          return results;
        });
      });
    }
    return this._$ids;
  }

  // ═══ Read terminals — plain data ═══

  /**
   * Paginated rows as plain data (fields only — no stores, no events, no `__id`).
   * Use `Model.instance(id)` / `query.field(name)` for reactive access; this
   * surface is intentionally inert so that `list.forEach(row => row.title)`
   * reads a snapshot instead of a live store.
   */
  get $list(): Store<QueryDataRecord<Contract, Generics, Ext>[]> {
    if (!this._$list) {
      this._$list = withRegion(this.context.region, () => {
        type Row = QueryDataRecord<Contract, Generics, Ext>;
        let prev: Row[] = [];
        return combine(this.$ids, this.context.$dataMap, (ids, dataMap) => {
          const next: Row[] = new Array(ids.length);
          let same = ids.length === prev.length;
          for (let i = 0; i < ids.length; i++) {
            const row = dataMap[String(ids[i])] as Row | undefined;
            if (!row) {
              same = false;
              continue;
            }
            next[i] = row;
            if (same && prev[i] !== row) same = false;
          }
          if (same) return prev;
          prev = next.filter(Boolean) as Row[];
          return prev;
        });
      });
    }
    return this._$list;
  }

  get $count(): Store<number> {
    if (!this._$count) {
      this._$count = withRegion(this.context.region, () => this.$ids.map((l) => l.length));
    }
    return this._$count;
  }

  get $totalCount(): Store<number> {
    if (!this._$totalCount) {
      const d = this.descriptor;
      if (d.offsetValue === undefined && d.limitValue === undefined) {
        this._$totalCount = this.$count;
      } else {
        this._$totalCount = withRegion(this.context.region, () =>
          this.$filtered.map((l) => l.length),
        );
      }
    }
    return this._$totalCount;
  }

  get $first(): Store<QueryDataRecord<Contract, Generics, Ext> | null> {
    if (!this._$first) {
      this._$first = withRegion(this.context.region, () => {
        type FirstData = QueryDataRecord<Contract, Generics, Ext> | null;

        const $firstId = this.$ids.map((l) => (l.length > 0 ? String(l[0]) : null), {
          skipVoid: false,
        });
        const $first = createStore<FirstData>(null);
        const init = createEvent();

        sample({
          clock: [init, $firstId],
          source: { id: $firstId, dataMap: this.context.$dataMap },
          fn: ({ id, dataMap }) => (id === null ? null : ((dataMap[id] ?? null) as FirstData)),
          target: $first,
        });

        sample({
          clock: this.context.$dataMap,
          source: $firstId,
          filter: (id) => id !== null,
          fn: (id, dataMap) => {
            return (dataMap[id as string] ?? null) as FirstData;
          },
          target: $first,
        });
        init();
        return $first;
      });
    }
    return this._$first;
  }

  /**
   * Fires when a field on any instance currently in this query's filtered
   * result set is mutated. Payload matches the internal field-updated signal
   * (`{ id, field, value }`). Lazy: nothing is wired until the getter is
   * first touched, and only the membership Set derivation is added to the
   * graph — no extra per-mutation cost for queries that don't subscribe.
   */
  get updated(): Event<{ id: string; field: string; value: unknown }> {
    if (!this._updated) {
      this._updated = withRegion(this.context.region, () => {
        const event = createEvent<{ id: string; field: string; value: unknown }>();
        const fieldUpdated = this.context.$fieldUpdated;
        if (fieldUpdated) {
          const $idSet = this.$filtered.map((ids) => new Set(ids.map(String)));
          sample({
            clock: fieldUpdated,
            source: $idSet,
            filter: (set, payload) => set.has(payload.id),
            fn: (_set, payload) => payload,
            target: event,
          });
        }
        return event;
      });
    }
    return this._updated;
  }

  // ═══ Field accessor ═══

  field<F extends QueryableFieldNames<Contract, Ext> & string>(
    name: F,
  ): QueryField<QueryFieldValueType<Contract, Generics, Ext, F>> {
    const existing = this._fields.get(name);
    if (existing) return existing as QueryField<QueryFieldValueType<Contract, Generics, Ext, F>>;

    const qf = new QueryField<QueryFieldValueType<Contract, Generics, Ext, F>>(
      name,
      this.isFieldWritable(name),
      this.context,
      () => this.$ids,
    );
    this._fields.set(name, qf as QueryField<unknown>);
    return qf;
  }

  private isFieldWritable(name: string): boolean {
    const contract = this.context.getContract();
    const entity = contract[name];
    if (entity) {
      return (
        entity.kind === ContractFieldKind.State ||
        entity.kind === ContractFieldKind.Ref ||
        entity.kind === ContractFieldKind.Inverse
      );
    }
    // Check FK alias fields
    for (const key of Object.keys(contract)) {
      const e = contract[key];
      if (e?.kind === ContractFieldKind.Ref && (e as { fk?: string }).fk === name) return true;
    }
    return true;
  }

  // ═══ Write terminals ═══

  get update(): EventCallable<UpdateData<Contract, Generics>> {
    if (!this._update) {
      this._update = withRegion(this.context.region, () => {
        const ev = createEvent<Record<string, unknown>>();
        const ctx = this.context;
        const fx = createEffect(
          ({ ids, data }: { ids: ModelInstanceId[]; data: Record<string, unknown> }) => {
            for (const id of ids) ctx.handleUpdate(id, data);
          },
        );
        sample({
          clock: ev,
          source: this.$ids,
          fn: (ids: ModelInstanceId[], data: Record<string, unknown>) => ({ ids, data }),
          target: fx,
        });
        return ev;
      });
    }
    return this._update as EventCallable<any>;
  }

  get delete(): EventCallable<void> {
    if (!this._delete) {
      this._delete = withRegion(this.context.region, () => {
        const ev = createEvent<void>();
        const ctx = this.context;
        const fx = createEffect((ids: ModelInstanceId[]) => {
          for (const id of ids) ctx.handleDelete(id);
        });
        sample({
          clock: ev,
          source: this.$ids,
          fn: (ids: ModelInstanceId[]) => [...ids],
          target: fx,
        });
        return ev;
      });
    }
    return this._delete;
  }
}
