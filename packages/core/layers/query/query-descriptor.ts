import { is, type Store } from "effector";
import type { Operator, Reactive } from "./types";

export interface WhereClause {
  readonly field: string;
  readonly operator: Operator;
}

export interface WhenClause {
  readonly $condition: Store<unknown>;
  readonly conditionId: string;
  readonly applyFn: (query: unknown, value: unknown) => unknown;
}

export interface OrderByClause {
  readonly field: Reactive<string>;
  readonly direction: Reactive<"asc" | "desc">;
  readonly fieldId?: string;
  readonly directionId?: string;
}

export interface HavingClause {
  readonly aggregate: "count" | "sum" | "avg" | "min" | "max";
  readonly operator: Operator<number>;
  readonly field?: string;
}

export class QueryDescriptor {
  private static _nextId = 0;
  private _cachedKey?: string;

  constructor(
    readonly whereClauses: readonly WhereClause[] = [],
    readonly whenClauses: readonly WhenClause[] = [],
    readonly orderByClauses: readonly OrderByClause[] = [],
    readonly limitValue?: Reactive<number>,
    readonly offsetValue?: Reactive<number>,
    readonly distinctField?: string,
    readonly groupByField?: string,
    readonly havingClauses: readonly HavingClause[] = [],
  ) {}

  static empty(): QueryDescriptor {
    return new QueryDescriptor();
  }

  static storeId(store: Store<unknown>): string {
    const s = store as Store<unknown> & { __queryId?: string };
    if (!s.__queryId) {
      s.__queryId = `$${QueryDescriptor._nextId++}`;
    }
    return s.__queryId;
  }

  static reactiveKey(value: Reactive<unknown>): string {
    return is.store(value) ? QueryDescriptor.storeId(value as Store<unknown>) : String(value);
  }

  addWhere(clause: WhereClause): QueryDescriptor {
    return new QueryDescriptor(
      [...this.whereClauses, clause],
      this.whenClauses,
      this.orderByClauses,
      this.limitValue,
      this.offsetValue,
      this.distinctField,
      this.groupByField,
      this.havingClauses,
    );
  }

  addWhen(clause: WhenClause): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      [...this.whenClauses, clause],
      this.orderByClauses,
      this.limitValue,
      this.offsetValue,
      this.distinctField,
      this.groupByField,
      this.havingClauses,
    );
  }

  addOrderBy(clause: OrderByClause): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      this.whenClauses,
      [...this.orderByClauses, clause],
      this.limitValue,
      this.offsetValue,
      this.distinctField,
      this.groupByField,
      this.havingClauses,
    );
  }

  withLimit(n: Reactive<number>): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      this.whenClauses,
      this.orderByClauses,
      n,
      this.offsetValue,
      this.distinctField,
      this.groupByField,
      this.havingClauses,
    );
  }

  withOffset(n: Reactive<number>): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      this.whenClauses,
      this.orderByClauses,
      this.limitValue,
      n,
      this.distinctField,
      this.groupByField,
      this.havingClauses,
    );
  }

  withDistinct(field: string): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      this.whenClauses,
      this.orderByClauses,
      this.limitValue,
      this.offsetValue,
      field,
      this.groupByField,
      this.havingClauses,
    );
  }

  withGroupBy(field: string): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      this.whenClauses,
      this.orderByClauses,
      this.limitValue,
      this.offsetValue,
      this.distinctField,
      field,
      this.havingClauses,
    );
  }

  addHaving(clause: HavingClause): QueryDescriptor {
    return new QueryDescriptor(
      this.whereClauses,
      this.whenClauses,
      this.orderByClauses,
      this.limitValue,
      this.offsetValue,
      this.distinctField,
      this.groupByField,
      [...this.havingClauses, clause],
    );
  }

  toKey(): string {
    if (this._cachedKey !== undefined) return this._cachedKey;
    const parts: string[] = [];

    if (this.whereClauses.length > 0) {
      const w = [...this.whereClauses]
        .map(
          (c) => `${c.field}:${c.operator.name}:${QueryDescriptor.reactiveKey(c.operator.operand)}`,
        )
        .sort()
        .join(",");
      parts.push(`W[${w}]`);
    }
    if (this.whenClauses.length > 0) {
      const wh = this.whenClauses.map((c) => c.conditionId).join(",");
      parts.push(`WH[${wh}]`);
    }
    if (this.distinctField) parts.push(`D[${this.distinctField}]`);
    if (this.groupByField) parts.push(`G[${this.groupByField}]`);
    if (this.havingClauses.length > 0) {
      const h = this.havingClauses
        .map(
          (c) =>
            `${c.aggregate}${c.field ? `:${c.field}` : ""}:${c.operator.name}:${QueryDescriptor.reactiveKey(c.operator.operand)}`,
        )
        .join(",");
      parts.push(`H[${h}]`);
    }
    if (this.orderByClauses.length > 0) {
      const o = this.orderByClauses
        .map(
          (c) =>
            `${QueryDescriptor.reactiveKey(c.field)}:${QueryDescriptor.reactiveKey(c.direction)}`,
        )
        .join(",");
      parts.push(`O[${o}]`);
    }
    if (this.offsetValue !== undefined)
      parts.push(`S[${QueryDescriptor.reactiveKey(this.offsetValue)}]`);
    if (this.limitValue !== undefined)
      parts.push(`L[${QueryDescriptor.reactiveKey(this.limitValue)}]`);

    this._cachedKey = parts.join("|") || "ALL";
    return this._cachedKey;
  }
}
