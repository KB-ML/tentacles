# Query a collection

`Model.query()` returns a `CollectionQuery` — a chainable, fully reactive query over the model's instances. Every clause you add (`where`, `when`, `orderBy`, `limit`, `offset`, `distinct`, `groupBy`) yields a new query (memoized by descriptor) with a matching reactive output.

| Output | Type | Notes |
|---|---|---|
| `$ids` | `Store<ModelInstanceId[]>` | Paginated ids in display order — the authoritative stream |
| `$list` | `Store<Row[]>` | Paginated **plain data rows** — field snapshots, no stores / events |
| `$first` | `Store<Row \| null>` | First row of `$list`, or null |
| `$count` | `Store<number>` | Length of `$ids` (after pagination) |
| `$totalCount` | `Store<number>` | Filtered count before pagination |
| `$groups` | `Store<Map<K, Row[]>>` | From `.groupBy(field)` — plain rows per bucket |
| `$values` | `Store<T[]>` | From `.field(name)` |

`$list` emits **plain rows** (field snapshots only). For reactive per-row access — stores, events, refs — use `$ids` to drive rendering and call `Model.get(id)` per row. PK fields are included in each row, so you can call `Model.get({ pk: row.pk })` directly.

All operators accept `T | Store<T>`. Pass a literal for static queries or a `Store` to make the clause reactive to external state changes.

## Basic where

`.where(field, operator)` narrows the result set. Import operators from `@kbml-tentacles/core`:

```ts
import { eq, gte } from "@kbml-tentacles/core"

const adults = userModel.query()
  .where("age", gte(18))
  .where("role", eq("member"))

adults.$list      // Store<Row[]>  — plain rows
adults.$ids       // Store<ModelInstanceId[]>
adults.$count     // Store<number>
```

Each `.where(...)` call returns a new query. Chain as many as you need — the result is an AND of all clauses. The underlying descriptor is memoized, so calling `.where("age", gte(18))` twice with the same operator reuses the same `CollectionQuery` instance.

## The 15 operators

Every operator is a function that takes a value (or a reactive store of that value) and returns an `Operator<T>`. Pass the result as the second argument to `.where`.

```ts
import {
  eq, neq,
  gt, gte, lt, lte,
  oneOf,
  contains, includes,
  startsWith, endsWith, matches,
} from "@kbml-tentacles/core"
```

### Equality

```ts
userModel.query().where("role",  eq("admin"))
userModel.query().where("banned", neq(true))
```

- `eq(value)` — strict `===`
- `neq(value)` — strict `!==`

### Numeric comparison

```ts
userModel.query().where("age", gt(17))
userModel.query().where("age", gte(18))
userModel.query().where("age", lt(65))
userModel.query().where("age", lte(64))
```

All four are number-only.

### Collection membership

```ts
userModel.query().where("role", oneOf(["admin", "moderator"]))
postModel.query().where("tags", contains("typescript"))
```

- `oneOf(values)` — field value is in the given array
- `contains(value)` — **field is an array**, and it contains the given value

### String matching

```ts
userModel.query().where("email",  includes("@example.com"))
userModel.query().where("name",   startsWith("A"))
userModel.query().where("handle", endsWith(".dev"))
```

All three are case-insensitive.

### Custom predicate

```ts
postModel.query().where("body", matches((text) => text.split(" ").length > 100))
```

`matches(fn)` accepts a synchronous predicate and is the escape hatch when no built-in operator fits. The predicate runs for every candidate on every recomputation — prefer built-in operators (they take fast paths through indexes) when possible.

## Reactive operands

Every operator accepts a `Store<T>` in place of a literal. The query recomputes automatically when the store changes:

```ts
import { createEvent, createStore } from "effector"
import { eq, gte } from "@kbml-tentacles/core"

const setMinAge = createEvent<number>()
const setRole   = createEvent<"admin" | "member">()

const $minAge = createStore(18).on(setMinAge, (_, v) => v)
const $role   = createStore<"admin" | "member">("member").on(setRole, (_, v) => v)

const visible = userModel.query()
  .where("age",  gte($minAge))
  .where("role", eq($role))

setMinAge(21)        // query re-filters automatically
setRole("admin")
```

This is the primary integration point between queries and external UI state (search inputs, selection pickers, toggles). No watchers, no manual subscribers — the query's `$list` already reflects the new operand.

Reactive operands work with all 15 operators:

```ts
userModel.query().where("role", oneOf($selectedRoles))
postModel.query().where("title", includes($search))
postModel.query().where("tags", contains($selectedTag))
```

## Conditional branches

`.when($condition, fn)` runs `fn` only when `$condition` holds a truthy value. Use it to apply filters optionally without building conditional logic outside the query:

```ts
const $showOnlyAdmins = createStore(false)
const $tenantId      = createStore<string | null>(null)

const users = userModel.query()
  .where("active", eq(true))
  .when($showOnlyAdmins, (q) => q.where("role", eq("admin")))
  .when($tenantId, (q, tenantId) => q.where("tenantId", eq(tenantId)))
```

The second argument of the callback receives the current (non-null) value of the condition store, so you can parametrise the clause without another reactive read.

`.when` accepts any `Store<T | null>`. If the store holds `null`, the branch is skipped entirely (the query is identical to one built without it). When it transitions to a non-null value, the clause fires — and the query recomputes.

## Sorting

Apply `.orderBy(field, direction?)` to sort the filtered list. Direction defaults to `"asc"`:

```ts
userModel.query()
  .orderBy("createdAt", "desc")

postModel.query()
  .orderBy("pinned", "desc")
  .orderBy("title", "asc")
```

Chain multiple `.orderBy` calls for multi-key sorts. The first key is primary, subsequent keys break ties.

Both the field name and the direction accept a store for reactive sorting:

```ts
const $sortField = createStore<"name" | "age">("name")
const $sortDir   = createStore<"asc" | "desc">("asc")

userModel.query().orderBy($sortField, $sortDir)
```

The sort stage skips re-sorting when a field that is not part of the sort changes. Updating a non-sort field (`email`, say) does not trigger a full re-sort.

## Pagination

`.limit(n)` and `.offset(n)` slice the sorted list:

```ts
const $page    = createStore(1)
const $perPage = createStore(20)

const paged = userModel.query()
  .orderBy("createdAt", "desc")
  .limit($perPage)
  .offset($page.map((p) => (p - 1) * 20))

paged.$ids          // ids for this page
paged.$list         // plain rows for this page
paged.$count        // items on this page (<= perPage)
paged.$totalCount   // items before .limit / .offset
```

Use `$totalCount` to render page controls — it ignores `.limit` / `.offset` and reflects only what `.where` matched.

Both `.limit` and `.offset` accept reactive values. Update a `$page` store to flip pages without rebuilding the query.

## Distinct

`.distinct(field)` returns a query whose result list contains at most one instance per unique value of the given field. Useful when rendering deduplicated lists:

```ts
const uniqueRoles = userModel.query().distinct("role")

uniqueRoles.$list   // Store<Row[]> — one arbitrary row per distinct role
```

The instance chosen per bucket is order-dependent: whichever sorted-order instance holds the value first wins. Pair `.orderBy` with `.distinct` to make the choice deterministic.

## Grouping

`.groupBy(field)` returns a `GroupedQuery` instead of a `CollectionQuery`. The main output is `$groups` — a `Map` keyed by the group value:

```ts
const byRole = userModel.query().groupBy("role")

byRole.$groups      // Store<Map<string, Row[]>>  — plain rows per bucket
byRole.$keys        // Store<string[]>
byRole.$count       // Store<number>               — number of groups
```

Grab a single group's reactive sub-query with `.group(key)`:

```ts
const admins = byRole.group("admin")
admins.$ids     // Store<ModelInstanceId[]>  — admin ids (drive per-row reactive access)
admins.$list    // Store<Row[]>              — admin rows (plain data)
admins.$count   // Store<number>
```

Filter groups by aggregate with `.having`:

```ts
import { gt } from "@kbml-tentacles/core"

const busyRoles = userModel.query()
  .groupBy("role")
  .having("count", gt(5))                      // groups with more than 5 users
  .having("sum", gte(1000), "totalSpend")      // and combined spend >= 1000
```

`.having` accepts `"count"` (no field), `"sum" | "avg" | "min" | "max"` (with a field). Each call wraps the existing grouped query; combine as many as you need.

## Field access

`.field(name)` returns a `QueryField` — a thin wrapper with three things:

```ts
const ages = userModel.query().field("age")

ages.$values    // Store<number[]> — current age for every instance in the query
ages.update(30) // set `age` to 30 on every matched instance
ages.updated    // Event<{ id; value }> — fires per-instance when this field changes on a query member
```

`update(value)` is the fastest way to mutate a field across a filtered slice:

```ts
// Mark every user named "Nemo" as banned
userModel.query()
  .where("name", eq("Nemo"))
  .field("banned")
  .update(true)
```

`updated` only fires for instances that are currently in the query. Use it to react to bulk mutations in scope:

```ts
ages.updated.watch(({ id, value }) => {
  console.log(`user ${id} is now ${value}`)
})
```

Field access works with `.field<T>(name)` when you need to narrow the inferred type further.

## Incremental updates

A final note on performance. When an instance's field changes (e.g. `user.$role.set("admin")`), queries do not rescan the entire collection. Instead:

1. An internal `$fieldUpdated` event fires with `{ id, field, value }`.
2. The filter stage uses an incremental sample that checks only the changed instance — O(1) instead of O(N).
3. The sort stage skips re-sorting when the changed field is not a sort field.
4. `$list` dedups by reference equality — a field change on a row outside the current page returns the same row array, so rendering is skipped entirely.

Structural changes — adding or removing ids, operand store updates — still force a full re-scan of the filter stage, but that is inherent to the change, not a library cost.

For read-heavy UIs with many instances, this means mutating a single field is proportional to the work that actually matters — the changed row, not the whole table.
