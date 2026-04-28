---
description: "Reference for CollectionQuery: chain methods, reactive outputs, and update behavior."
---

# CollectionQuery

`CollectionQuery` is the chainable, reactive query object returned by `Model.query()`. Each chain method (`.where`, `.orderBy`, `.limit`, ...) returns a new `CollectionQuery` memoised by descriptor — structurally identical chains share the same effector nodes. The outputs (`$list`, `$count`, `$ids`, etc.) are live effector stores that update incrementally when instance fields change and fully recompute when the set of ids changes. This page enumerates every chain method, every reactive output, and the internal update strategy.

## Shape

```ts
class CollectionQuery<Contract, Generics, Ext> {
  // chain
  where<K>(field: K, operator: Operator<T>): this
  when<T>($condition: Store<T | null>, fn: (q, v) => q): this
  orderBy<K>(field: K | Store<K>, direction?: "asc" | "desc" | Store<"asc" | "desc">): this
  limit(n: number | Store<number>):  this
  offset(n: number | Store<number>): this
  distinct<K>(field: K): this
  groupBy<K>(field: K): GroupedQuery<..., K>
  field<K>(name: K): QueryField<T>

  // outputs — `Row` is a plain record `{ field: value }` (no stores, no events, no `__id`)
  readonly $list:       Store<Row[]>
  readonly $first:      Store<Row | null>
  readonly $ids:        Store<ModelInstanceId[]>
  readonly $count:      Store<number>
  readonly $totalCount: Store<number>

  // write terminals
  readonly update:      EventCallable<UpdateData>
  readonly delete:      EventCallable<void>
  readonly updated:     Event<{ id; field; value }>
}
```

`$list` / `$first` emit **plain data rows** — field snapshots with no reactive accessors. For reactive per-row access (stores, events, refs), read an id from `$ids` / `$list` (rows have their PK fields) and call `Model.get(id)`.

## Chain methods

### `.where`

```ts
where<K>(field: K, operator: Operator<T>): CollectionQuery
```

Add an AND clause. Every operator is a function from `@kbml-tentacles/core` (see [Operators](./operators.md)).

```ts
const adults = userModel.query()
  .where("age",  gte(18))
  .where("role", eq("member"))
```

`where` clauses are AND-joined. Repeating the same clause on an already-memoised query is cheap — `QueryRegistry` returns the cached instance.

### `.when`

```ts
when<T>(
  $condition: Store<T | null>,
  fn: (q: CollectionQuery, value: T) => CollectionQuery,
): CollectionQuery
```

Conditional clause. The inner callback runs whenever `$condition` is truthy, producing additional predicates that apply on top of the parent query. The condition can be any `Store`.

```ts
userModel.query().when($searchTerm, (q, term) =>
  q.where("name", includes(term))
)
```

When `$condition` is `null`, the inner clauses are dropped and the base query applies.

### `.orderBy`

```ts
orderBy<K>(
  field:      K | Store<K>,
  direction?: "asc" | "desc" | Store<"asc" | "desc">,
): CollectionQuery
```

Add a sort key. Default direction is `"asc"`. Both arguments accept reactive stores — the sort key and direction can change at runtime without rebuilding the query.

```ts
userModel.query()
  .orderBy("createdAt", "desc")
  .orderBy($sortField, $sortDirection)
```

Multiple `.orderBy` calls stack — the first added clause is the primary sort, the second is the tiebreaker.

### `.limit` / `.offset`

```ts
limit(n: number | Store<number>):  CollectionQuery
offset(n: number | Store<number>): CollectionQuery
```

Apply pagination. Accepts reactive stores — change pages without rebuilding the query. `limit` / `offset` apply on top of the sort stage; outputs after pagination are `$ids`, `$list`, `$first`, `$count`. For the unpaginated match count, use `$totalCount`.

```ts
const page = userModel.query()
  .where("active", eq(true))
  .orderBy("name", "asc")
  .limit($pageSize)
  .offset($offset)
```

### `.distinct`

```ts
distinct<K>(field: K): CollectionQuery
```

Keep only the first instance per unique value of `field`. Applied within the filter stage.

### `.groupBy`

```ts
groupBy<K>(field: K): GroupedQuery
```

Transition to a `GroupedQuery`. Subsequent chaining happens on the grouped object; see [`GroupedQuery`](./grouped-query.md).

```ts
const byRole = userModel.query().groupBy("role")
byRole.$groups // Store<Map<role, Row[]>>  — plain rows, not Instance[]
```

### `.field`

```ts
field<K>(name: K): QueryField<T>
```

Return a `QueryField` — a small reactive object for reading or bulk-updating a single field across the query's result set. See [`QueryField`](./query-field.md).

```ts
const $titles = userModel.query().field("name").$values
```

## Reactive outputs

All outputs are lazy — the underlying effector store is created on first read. Repeated reads return the same store.

The internal pipeline works on `ModelInstanceId[]` (id pipeline). `$ids` is the authoritative post-pagination stream; `$list` and `$first` project plain data rows from it.

### `.$ids`

```ts
$ids: Store<ModelInstanceId[]>
```

Paginated ids in display order (post-filter, post-sort, post-`offset`/`limit`). This is the authoritative stream — use it to drive per-row reactive access via `Model.get(id)`.

### `.$list`

```ts
$list: Store<Row[]>
```

Paginated rows as **plain data** — each row is a `{ field: value }` snapshot of that instance's queryable fields (state + computed + extension stores). No `$`-prefixed stores, no events, no `__id`. Perfect for rendering; use `Model.get(id)` when you need reactive access to a single row.

Rows include primary-key fields, so you can call `Model.get({ pk: row.pk })` directly.

### `.$first`

```ts
$first: Store<Row | null>
```

`$list[0] ?? null` — plain row or `null` when the query is empty. Handy for "does this query match anything?" checks without subscribing to the full list.

### `.$count`

```ts
$count: Store<number>
```

Length of `$ids` — post-pagination count. `Math.min(limit, $totalCount - offset)`.

### `.$totalCount`

```ts
$totalCount: Store<number>
```

Pre-pagination count (length of the filtered set, ignoring `offset` / `limit`). Use for paginator UI that needs the total match count.

### `.updated`

```ts
updated: Event<{ id: string; field: string; value: unknown }>
```

Fires when a field on any instance currently in the **filtered** result set is mutated. Payload mirrors the internal field-updated signal. Lazy — nothing is wired until first access.

### `.update` / `.delete`

```ts
update: EventCallable<UpdateData>
delete: EventCallable<void>
```

Write terminals — apply a partial update or delete every instance currently in `$ids` (post-pagination).

## Incremental vs full-scan updates

The internal pipeline is `filter → sort → paginate`, all expressed as id arrays. `$list` / `$first` project plain rows from `$ids + $dataMap` at the end; only the paginated slice is materialised.

The filter stage has two update paths:

| Trigger | Path | Cost |
|---|---|---|
| Model `$ids` add/remove | Full scan via `combine([$ids, $dataMap, ...operands]).map(filter)` | O(N) |
| Reactive operand change (`Store` operand on `.where`) | Full scan | O(N) |
| Individual field mutation (`$fieldUpdated` event) | Incremental check of the one changed instance | O(1) |

The incremental path only adds/removes the changed instance to/from the filtered set based on whether it still matches. This turns typical per-field edits (a user toggling a checkbox in a 10 000-row table) from O(N) scans into O(1) updates.

The sort stage skips re-sort when the changed field is not part of `orderBy` and the filtered set is structurally unchanged — the cached sorted array is reused.

`$list` dedups by reference equality: if the paginated id list and all row references are unchanged, the previous list array is returned — so mutations to instances outside the current page don't trigger renders.

```ts
const q = userModel.query().orderBy("name", "asc")

userModel.update("u1", { nickname: "Al" })
// sort stage does NOT re-sort — nickname is not a sort field
```

## Descriptor memoisation

Each builder call returns a new `CollectionQuery`, but the new object wraps an immutable `QueryDescriptor` that is compared structurally. When two chains produce the same descriptor, the `QueryRegistry` returns the same `CollectionQuery` instance — so repeated rebuilds cost no extra effector nodes.

```ts
const q1 = userModel.query().where("role", eq("admin"))
const q2 = userModel.query().where("role", eq("admin"))
// q1 === q2 — shared
```

## Index plan

If a `where` clause matches a contract `index` or `unique` field (with operator `eq` or `oneOf`), the query uses the index's `$version` store to short-circuit the scan: only ids matching the indexed value are considered. Index plans are computed once per query instance and cached.

## Example

```ts
import { gte, eq, includes } from "@kbml-tentacles/core"

const $search = createStore("")
const $page   = createStore(0)
const pageSize = 20

const results = userModel.query()
  .where("active", eq(true))
  .when($search, (q, term) => q.where("name", includes(term)))
  .orderBy("createdAt", "desc")
  .limit(pageSize)
  .offset($page.map((p) => p * pageSize))

results.$list        // Store<Row[]>             — plain snapshots for rendering
results.$ids         // Store<ModelInstanceId[]> — per-row reactive access via Model.get(id)
results.$count       // Store<number>            — page count
results.$totalCount  // Store<number>            — total match count
results.$first       // Store<Row | null>        — plain row or null
```

## See also

- [`GroupedQuery`](./grouped-query.md) — output of `.groupBy`.
- [`QueryField`](./query-field.md) — output of `.field`.
- [Operators](./operators.md) — every valid `where` operator.
