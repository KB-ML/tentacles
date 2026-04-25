import { combine, type Store, withRegion } from "effector";
import type { ModelInstanceId } from "../model/types";
import type { CollectionQuery } from "./collection-query";
import type { HavingClause } from "./query-descriptor";
import type { QueryRegistry } from "./query-registry";
import type { Operator, QueryableFieldNames, QueryContext } from "./types";
import type { QueryDataRecord } from "./types/query-types";

type InstanceWithId = { __id: ModelInstanceId };

export class GroupedQuery<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
  K = unknown,
  Instance extends InstanceWithId = InstanceWithId,
> {
  private _$groupIds?: Store<Map<K, ModelInstanceId[]>>;
  private _$groups?: Store<Map<K, QueryDataRecord<Contract, Generics, Ext>[]>>;
  private _$keys?: Store<K[]>;
  private _$count?: Store<number>;
  private readonly _groupQueries = new Map<
    unknown,
    CollectionQuery<Contract, Generics, Ext, Instance>
  >();

  constructor(
    private readonly descriptor: import("./query-descriptor").QueryDescriptor,
    private readonly parentIds: () => Store<ModelInstanceId[]>,
    private readonly context: QueryContext<Instance>,
    private readonly queryRegistry: QueryRegistry<Contract, Generics, Ext, Instance>,
  ) {}

  having(
    aggregate: "count",
    operator: Operator<number>,
  ): GroupedQuery<Contract, Generics, Ext, K, Instance>;
  having(
    aggregate: "sum" | "avg" | "min" | "max",
    operator: Operator<number>,
    field: QueryableFieldNames<Contract, Ext> & string,
  ): GroupedQuery<Contract, Generics, Ext, K, Instance>;
  having(
    aggregate: string,
    operator: Operator<number>,
    field?: string,
  ): GroupedQuery<Contract, Generics, Ext, K, Instance> {
    return this.queryRegistry.getOrCreateGrouped(
      this.descriptor.addHaving({
        aggregate: aggregate as HavingClause["aggregate"],
        operator: operator as Operator,
        field,
      }),
      this.parentIds,
    ) as GroupedQuery<Contract, Generics, Ext, K, Instance>;
  }

  /** Internal id-grouping used by sub-queries created via `group(key)`. */
  private get $groupIds(): Store<Map<K, ModelInstanceId[]>> {
    if (!this._$groupIds) {
      this._$groupIds = withRegion(this.context.region, () => {
        const groupField = this.descriptor.groupByField ?? "";
        const havingClauses = this.descriptor.havingClauses;
        const ctx = this.context;

        const reactiveStores: Store<unknown>[] = [];
        for (const h of havingClauses) {
          if (h.operator.$operand) reactiveStores.push(h.operator.$operand);
        }

        return combine([this.parentIds(), ctx.$dataMap, ...reactiveStores]).map((combined) => {
          const ids = combined[0] as ModelInstanceId[];
          const dataMap = combined[1] as Record<string, Record<string, unknown>>;

          const rvMap = new Map<Store<unknown>, unknown>();
          for (let i = 0; i < reactiveStores.length; i++) {
            rvMap.set(reactiveStores[i] as Store<unknown>, combined[i + 2]);
          }

          const groups = new Map<K, ModelInstanceId[]>();
          for (const id of ids) {
            const data = dataMap[String(id)];
            if (!data) continue;
            const key = data[groupField] as K;
            let group = groups.get(key);
            if (!group) {
              group = [];
              groups.set(key, group);
            }
            group.push(id);
          }

          for (const having of havingClauses) {
            for (const [key, group] of groups) {
              const aggValue = this.computeAggregate(having, group, dataMap);
              const operand = having.operator.$operand
                ? rvMap.get(having.operator.$operand)
                : having.operator.operand;
              if (!having.operator.predicate(aggValue, operand)) {
                groups.delete(key);
              }
            }
          }

          return groups;
        });
      });
    }
    return this._$groupIds;
  }

  /**
   * Groups as plain data rows (fields only — no stores, no events). For
   * reactive per-row access, create a sub-query with `group(key)` or call
   * `Model.instance(id)` with ids read from a row's PK fields.
   */
  get $groups(): Store<Map<K, QueryDataRecord<Contract, Generics, Ext>[]>> {
    if (!this._$groups) {
      this._$groups = withRegion(this.context.region, () => {
        type Row = QueryDataRecord<Contract, Generics, Ext>;
        return combine(this.$groupIds, this.context.$dataMap, (groupIds, dataMap) => {
          const out = new Map<K, Row[]>();
          for (const [key, ids] of groupIds) {
            const rows: Row[] = [];
            for (const id of ids) {
              const data = dataMap[String(id)] as Row | undefined;
              if (data) rows.push(data);
            }
            out.set(key, rows);
          }
          return out;
        });
      });
    }
    return this._$groups;
  }

  get $keys(): Store<K[]> {
    if (!this._$keys) {
      this._$keys = withRegion(this.context.region, () => this.$groupIds.map((g) => [...g.keys()]));
    }
    return this._$keys;
  }

  get $count(): Store<number> {
    if (!this._$count) {
      this._$count = withRegion(this.context.region, () => this.$groupIds.map((g) => g.size));
    }
    return this._$count;
  }

  group(key: K): CollectionQuery<Contract, Generics, Ext, Instance> {
    let existing = this._groupQueries.get(key);
    if (existing) return existing;

    existing = withRegion(this.context.region, () => {
      const $groupMemberIds = this.$groupIds.map((groups) => groups.get(key) ?? []);
      return this.queryRegistry.createFromStore($groupMemberIds);
    });
    this._groupQueries.set(key, existing);
    return existing;
  }

  private computeAggregate(
    having: HavingClause,
    group: ModelInstanceId[],
    dataMap: Record<string, Record<string, unknown>>,
  ): number {
    if (having.aggregate === "count") return group.length;

    const field = having.field ?? "";
    const values = group.map((id) => {
      const data = dataMap[String(id)];
      return (data?.[field] ?? 0) as number;
    });

    switch (having.aggregate) {
      case "sum":
        return values.reduce((a, b) => a + b, 0);
      case "avg":
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      case "min":
        return Math.min(...values);
      case "max":
        return Math.max(...values);
      default:
        return 0;
    }
  }
}
