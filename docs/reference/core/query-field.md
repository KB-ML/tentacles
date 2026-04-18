# QueryField

`QueryField<T>` is the object returned from `CollectionQuery.field(name)`. It scopes reads and writes of a single field to the ids currently in the query's result set — useful for bulk updates ("check every visible todo"), reactive lists of values, and per-field change notifications. This page documents the three members exposed on the object.

## Shape

```ts
class QueryField<T> {
  readonly $values: Store<T[]>
  readonly update:  EventCallable<T>
  readonly updated: Event<{ id: ModelInstanceId; value: T }>
}
```

All three are lazy — created on first access and cached thereafter.

## Creation

```ts
import { eq } from "@kbml-tentacles/core"

const visibleTodos = todoModel.query().where("visible", eq(true))
const $titles      = visibleTodos.field("title")
```

The `field` argument must name a store or derived field on the contract. Referencing a ref field or an undeclared name is a compile-time error.

## `.$values`

```ts
$values: Store<T[]>
```

Current values of the field across every instance in the query's paginated result set, in the same order as `$ids`. Derived directly from `$ids + $dataMap`.

```ts
$titles.$values
// Store<string[]> — titles of every visible todo
```

Subscribing to `$values` is cheaper than subscribing to `$list` when you only need one field: you skip the per-row object allocation on every update.

Changes propagate on:

- ids joining / leaving the query (`$ids` changes)
- the watched field mutating on any instance in the set

Mutations to **other** fields on the same instances do not fire `$values` updates.

## `.update`

```ts
update: EventCallable<T>
```

Bulk update. Calling `update(value)` sets the field to `value` on **every** instance currently in the query's paginated result set (`$ids`). Implemented as a sampled effect that, at call time, reads the current id snapshot and issues one `Model.update` per instance.

```ts
const activeTodos = todoModel.query().where("done", eq(false))
activeTodos.field("done").update(true)
// every active todo is now marked done
```

Important notes:

- The id set is captured **at call time**. Ids added to the query after the call are not updated.
- Updates are batched — they all run through `_dataMapFieldUpdated`, which triggers the incremental query path. Other queries recompute incrementally, not by full scan.
- If the field is read-only (e.g. a `.derived(...)`), calling `update` throws `TentaclesError` synchronously: `Field "X" is read-only`.
- Calling `update` on an empty result set is a no-op.

### Typed signature

`update` is an `EventCallable<T>`, so it works both imperatively and as a `sample` target:

```ts
// Imperative
activeTodos.field("done").update(true)

// Declarative
sample({
  clock: markAllDone,
  fn:    () => true,
  target: activeTodos.field("done").update,
})
```

## `.updated`

```ts
updated: Event<{ id: ModelInstanceId; value: T }>
```

Fires every time the watched field changes on **any** instance currently in the query's set. The payload carries the instance id and the new value.

```ts
$titles.updated.watch(({ id, value }) => {
  console.log(`todoModel ${id} renamed to ${value}`)
})
```

Internally wired through `Model.updated` and filtered on the query's `$idSet` (O(1) `has` check). Instances outside the current set do not emit.

The event fires only when the specific field changes. Updating other fields on the same instances does not fire `updated`.

## Use cases

### 1. List of field values

```ts
const $titles = todoModel.query().field("title").$values
// Render <ul><li v-for="t in titles">{{ t }}</li></ul>
```

Rebuilds only when a title changes, not when unrelated fields mutate.

### 2. Bulk toggle

```ts
const incomplete = todoModel.query().where("done", eq(false))
// Wire a "mark all done" button to the bulk update
sample({
  clock:  markAllDone,
  fn:     () => true,
  target: incomplete.field("done").update,
})
```

### 3. Change feed for a filter

```ts
// Emit a toast whenever a visible todo's priority changes
const $visible = todoModel.query().where("visible", eq(true))
$visible.field("priority").updated.watch(({ id, value }) => {
  toast(`todoModel ${id} moved to priority ${value}`)
})
```

### 4. Distinct values across the query

```ts
const uniqueRoles = userModel.query().field("role").$values.map(
  (roles) => [...new Set(roles)],
)
```

Prefer `.distinct("role")` on the underlying query if you only need one representative per role.

## Field-type coverage

`QueryField` supports any contract store or derived field — values of any declared type. A few noteworthy behaviours:

| Field type | `$values` | `update` | `updated` |
|---|---|---|---|
| `.store("title", (s) => s<string>())` | `Store<string[]>` | works | fires |
| `.store("tags",  (s) => s<string[]>())` | `Store<string[][]>` | works | fires |
| `.derived("upper", ...)` | `Store<string[]>` | **throws** on call | fires |
| `.ref("author", "one")` | unsupported — use `field("authorId")` via FK | — | — |
| `.inverse("posts", ...)` | unsupported | — | — |

For ref columns, query the FK scalar directly — Tentacles stores the foreign key under the contract field name, so `todoModel.query().field("assignee")` works when `assignee` is a ref with single cardinality. Follow-through to the linked model happens downstream through `Model.instance(id)`.

## Memoisation

Each `QueryField` is cached per `(CollectionQuery, fieldName)` pair. Calling `.field("title")` twice on the same query returns the same `QueryField`:

```ts
const q = todoModel.query().where("done", eq(false))
q.field("title") === q.field("title") // true
```

Two distinct `CollectionQuery` objects produce distinct `QueryField` objects, even if their descriptors match — because the query instance is the memoisation root. In practice you rarely hit this: `QueryRegistry` already memoises queries by descriptor, so repeated `todoModel.query().where(...).field("title")` returns the same `QueryField` tree.

## Interaction with scope

`update` dispatches per-instance `Model.update` calls internally. In scope-driven code paths (SSR, tests with `fork`), wrap the trigger with `allSettled`:

```ts
await allSettled(markAllDone, { scope })
// The field update chain now runs inside `scope`; assertions on
// scope.getState($someList) see the mutated state.
```

`updated` is just a reactive event — it fires inside any scope that emits through the underlying `Model.updated` event.

## See also

- [`CollectionQuery`](./collection-query.md) — the parent chain.
- [`Model.update`](./model.md#update) — the underlying single-id update.
- [Operators](./operators.md) — narrowing the set before bulk writes.
