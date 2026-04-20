# GroupedQuery

`GroupedQuery` is the object returned by `CollectionQuery.groupBy(field)`. It partitions the parent's filtered set by the group-by field and exposes each bucket as either plain rows (`$groups`), reactive sub-queries (`group(key)`), a list of keys (`$keys`), or a count (`$count`). It also supports SQL-style aggregate filters via `.having(...)`. All outputs inherit every `where`, `when`, and `distinct` clause the parent applied.

## Shape

```ts
class GroupedQuery<Contract, Generics, Ext, K> {
  having(aggregate: "count", operator: Operator<number>): GroupedQuery
  having(aggregate: "sum" | "avg" | "min" | "max", operator: Operator<number>, field: string): GroupedQuery

  readonly $groups: Store<Map<K, Row[]>>        // plain row data per bucket
  readonly $keys:   Store<K[]>                  // bucket keys
  readonly $count:  Store<number>               // number of buckets

  group(key: K): CollectionQuery                // reactive sub-query for one bucket
}
```

All stores are lazy — the underlying `combine` is created on first access.

## Creation

`GroupedQuery` is produced by `CollectionQuery.groupBy(field)`:

```ts
const byRole = userModel.query().groupBy("role")
byRole.$groups // Store<Map<string, Row[]>>
```

The `field` argument must name a store or derived field on the contract. Non-existent fields are a compile-time error. Grouping by a ref field is not supported — group on the ref's `$id` or a derived field instead.

## Outputs

### `.$groups`

```ts
$groups: Store<Map<K, Row[]>>
```

The authoritative grouping as **plain data rows**. Each key is a distinct value of the group-by field within the filtered set. Each value is an array of plain records (fields only — no `$`-prefixed stores, no events). Bucket order matches the parent's sort order.

```ts
byRole.$groups.getState()
// Map { "admin" => [{ id: "u1", role: "admin", ... }, ...], "member" => [...] }
```

Updating an instance's group-by field moves it between buckets; mutations on non-group-by fields re-emit the affected bucket with a fresh snapshot.

For reactive per-row access inside a bucket, either iterate row PKs and call `Model.get(pk)`, or create a sub-query with `group(key)` (below).

### `.$keys`

```ts
$keys: Store<K[]>
```

Just the list of bucket keys. Use when you only need to render section headers or drive a key list for sub-queries.

```ts
byRole.$keys.getState()
// ["admin", "member"]
```

### `.$count`

```ts
$count: Store<number>
```

Number of distinct buckets. Equivalent to `$keys.map(k => k.length)`, but derived directly.

```ts
byRole.$count.getState()
// 2
```

### `group(key)`

```ts
group(key: K): CollectionQuery<Contract, Generics, Ext>
```

Return a **reactive sub-query** whose filtered/id pipeline is restricted to the rows in one bucket. Supports the full CollectionQuery API — `$list`, `$ids`, `$count`, `.update`, `.delete`, `.field(name)`, etc. Cached per key, so repeat calls return the same query.

Use this when you need per-bucket reactive rendering (e.g. a `<Section>` per role, each with a virtualised list).

```ts
const admins = byRole.group("admin")
admins.$ids      // Store<ModelInstanceId[]>  — only admin ids
admins.$list     // Store<Row[]>              — only admin rows
admins.$count    // Store<number>             — admin count
```

### `.having`

```ts
having("count", op: Operator<number>)
having("sum" | "avg" | "min" | "max", op: Operator<number>, field: string)
```

Filter buckets by an aggregate of their members. Returns a new `GroupedQuery` with the extra constraint. Chain multiple `having` calls to AND them.

```ts
// Only roles with more than 2 members
byRole.having("count", gt(2))

// Only categories where total value exceeds 1000
products.groupBy("category").having("sum", gt(1000), "price")
```

## Example

```ts
import { eq } from "@kbml-tentacles/core"

// Group active users by role
const active = userModel.query().where("active", eq(true))
const byRole = active.groupBy("role")

byRole.$groups.watch((groups) => {
  for (const [role, rows] of groups) {
    console.log(`${role}: ${rows.length}`)
  }
})

// Reactive admin sub-query — gets its own $list, $count, etc.
const admins = byRole.group("admin")
admins.$count.watch((n) => console.log(`${n} admins`))
```

## Group key type inference

The `K` generic is inferred from the group-by field's payload type. For a contract declared with `.store("role", s => s<"admin" | "member">())`:

```ts
const byRole = userModel.query().groupBy("role")
// Store<Map<"admin" | "member", Row[]>>
```

This makes `.get(key)` lookups type-safe: non-matching literals are rejected at compile time.

## Chaining on grouped queries

`GroupedQuery` is a **terminal** node in the chain — you cannot call `.where`, `.orderBy`, or `.limit` on it (use `.having` for aggregate filters, or filter the parent). Filter and sort the parent `CollectionQuery` before calling `.groupBy`:

```ts
// Sort first, then group
userModel.query()
  .where("active", eq(true))
  .orderBy("createdAt", "desc")
  .groupBy("role")
```

Each bucket is ordered by the parent's filter/sort output. If the parent has no `orderBy`, the bucket order matches the original `Model.$ids` insertion order.

## Reactivity

All outputs listen to the parent's filtered-id store plus (where relevant) `$dataMap`:

- **Add/remove an instance** — any bucket membership change recomputes on the next read.
- **Change the group-by field** — the instance moves between buckets.
- **Change any other field** — `$groups` re-projects only the bucket whose row snapshot changed; `$keys` and `$count` skip update.

## Empty result sets

If the parent query filters down to zero instances, every output emits an empty value:

```ts
byRole.$groups.getState()  // Map {}
byRole.$keys.getState()    // []
byRole.$count.getState()   // 0
```

Missing keys simply do not appear in the map — there is no sentinel "empty bucket" for known values. To render a fixed list of keys (e.g. every role even when empty), build the layout from an external key list and look each key up through `groups.get(key) ?? []`.

## Nullable group values

If the group-by field can be `null` or `undefined`, those values become real map keys. Two records with `role: null` land in the same `null`-keyed bucket. If this is undesirable — e.g. you want to filter out unassigned records before grouping — add a `.where(field, neq(null))` clause to the parent query.

```ts
userModel.query()
  .where("role", neq(null))
  .groupBy("role")
```

## Reactive vs snapshot access

Two complementary access patterns:

| Need | Use |
|---|---|
| Render bucket as plain data (common) | `$groups` — Map of row arrays |
| Render one bucket reactively (e.g. virtualised) | `group(key)` — sub-query with `$list`, `$ids`, `.field`, etc. |
| Per-row reactive access (stores, events) | `Model.get(row.pk)` from `$groups` rows |

Because `$groups` emits plain objects, `groups.get(role)![0].title` reads a snapshot — no risk of stale store captures across renders.

## Working with `Map` in templates

Most template engines iterate a `Map` directly:

```tsx
// React
const groups = useUnit(byRole.$groups)
return (
  <>
    {[...groups].map(([role, rows]) => (
      <section key={role}>
        <h2>{role}</h2>
        <ul>{rows.map((row) => <li key={row.id}>{row.name}</li>)}</ul>
      </section>
    ))}
  </>
)
```

For stable ordering across re-renders, sort the entries before rendering — `Map` preserves insertion order of the keys, which matches the parent query's filtered order, not alphabetical or numeric order.

## See also

- [`CollectionQuery`](./collection-query.md) — the source chain.
- [`QueryField`](./query-field.md) — bulk access to a single field across a query.
- [Operators](./operators.md) — filter predicates upstream of grouping.
