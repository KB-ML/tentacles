---
description: "Reference for CollectionQuery where-operators and reactive operand semantics."
---

# Operators

Query operators are the functions passed as the second argument to `CollectionQuery.where(field, operator)`. Every operator takes an operand (either a literal value or a `Store<T>` for reactive queries) and returns an `Operator<T>` — a lightweight descriptor that carries the predicate and the operand type. This page is a complete reference for all 15 operators plus the reactive-operand rule.

## The `Reactive<T>` type

Every operator parameter is typed as `Reactive<T>` — an alias for `T | Store<T>`:

```ts
type Reactive<T> = T | Store<T>
```

Passing a literal builds a static operator whose predicate always compares against the fixed value. Passing a `Store<T>` builds a **reactive** operator: the parent `CollectionQuery` recomputes `$filtered` whenever the store updates. Both forms use the same API — the library detects the distinction with `is.store(value)`.

```ts
userModel.query().where("role", eq("admin"))      // static
userModel.query().where("role", eq($roleFilter))  // reactive
```

## Operator list

| Operator | Signature | Returns | Comparison |
|---|---|---|---|
| `eq` | `eq<T>(value: Reactive<T>)` | `Operator<T>` | `v === r` |
| `neq` | `neq<T>(value: Reactive<T>)` | `Operator<T>` | `v !== r` |
| `gt` | `gt(value: Reactive<number>)` | `Operator<number>` | `v > r` |
| `gte` | `gte(value: Reactive<number>)` | `Operator<number>` | `v >= r` |
| `lt` | `lt(value: Reactive<number>)` | `Operator<number>` | `v < r` |
| `lte` | `lte(value: Reactive<number>)` | `Operator<number>` | `v <= r` |
| `oneOf` | `oneOf<T>(values: Reactive<T[]>)` | `Operator<T>` | `r.includes(v)` |
| `contains` | `contains<T>(value: Reactive<T>)` | `Operator<T[]>` | `v.includes(r)` |
| `includes` | `includes(substr: Reactive<string>)` | `Operator<string>` | case-insensitive `v.includes(r)` |
| `startsWith` | `startsWith(prefix: Reactive<string>)` | `Operator<string>` | case-insensitive `v.startsWith(r)` |
| `endsWith` | `endsWith(suffix: Reactive<string>)` | `Operator<string>` | case-insensitive `v.endsWith(r)` |
| `matches` | `matches<T>(fn: (v: T) => boolean)` | `Operator<T>` | `fn(v)` |

All 15 are exported from `@kbml-tentacles/core`.

## Equality

### `eq`

```ts
eq<T>(value: Reactive<T>): Operator<T>
```

Strict equality (`===`). Works on any scalar: strings, numbers, booleans, null, undefined.

```ts
userModel.query().where("role",   eq("admin"))
userModel.query().where("banned", eq(false))
userModel.query().where("id",     eq($selectedId))
```

### `neq`

```ts
neq<T>(value: Reactive<T>): Operator<T>
```

Strict inequality. Same payload coverage as `eq`.

```ts
userModel.query().where("role", neq("guest"))
```

## Numeric comparison

All four are `number`-only and use strict `<`, `<=`, `>`, `>=`.

### `gt`, `gte`, `lt`, `lte`

```ts
gt(value: Reactive<number>):  Operator<number>
gte(value: Reactive<number>): Operator<number>
lt(value: Reactive<number>):  Operator<number>
lte(value: Reactive<number>): Operator<number>
```

```ts
userModel.query().where("age", gt(17))       // adults
userModel.query().where("age", gte(18))      // adults (inclusive)
userModel.query().where("age", lt(65))       // working age
userModel.query().where("age", lte($maxAge)) // reactive upper bound
```

Applying any of these to a non-number field is a compile-time error — the operator type parameter locks to `number`.

## Collection membership

### `oneOf`

```ts
oneOf<T>(values: Reactive<T[]>): Operator<T>
```

Field value must appear in the supplied array. The array itself is the operand — pass the whole list (or a store of a list).

```ts
userModel.query().where("role", oneOf(["admin", "moderator"]))
userModel.query().where("id",   oneOf($selectedIds))
```

`oneOf` is one of two operators (alongside `eq`) that the query index plan can accelerate. If the field has `.index()` or `.unique()`, `oneOf` lookups short-circuit the filter scan to only the matching ids.

### `contains`

```ts
contains<T>(value: Reactive<T>): Operator<T[]>
```

**Field is an array**; the operand is a single value. The field must include the operand.

```ts
postModel.query().where("tags", contains("typescript"))
postModel.query().where("tags", contains($currentTag))
```

Do not confuse with `includes` (string substring).

## String matching

All three string operators are **case-insensitive** — both sides are lower-cased before comparison.

### `includes`

```ts
includes(substring: Reactive<string>): Operator<string>
```

Field (string) contains the given substring.

```ts
userModel.query().where("email", includes("@example.com"))
userModel.query().where("name",  includes($searchTerm))
```

### `startsWith`

```ts
startsWith(prefix: Reactive<string>): Operator<string>
```

Field begins with the given prefix.

```ts
userModel.query().where("name", startsWith("A"))
```

### `endsWith`

```ts
endsWith(suffix: Reactive<string>): Operator<string>
```

Field ends with the given suffix.

```ts
userModel.query().where("handle", endsWith(".dev"))
```

## Custom predicate

### `matches`

```ts
matches<T>(fn: (v: T) => boolean): Operator<T>
```

Escape hatch. Accepts a synchronous predicate and runs it against every candidate instance on every filter recomputation.

```ts
postModel.query().where("body", matches((text) => text.split(" ").length > 100))
```

`matches` cannot be accelerated by indexes — the predicate is opaque. Prefer a built-in operator when one fits, and reach for `matches` only when a computed check is unavoidable. If the logic is reusable, consider exposing it as a `.derived()` store and querying that field with `eq(true)`.

## Reactive operand rule

Any operator can take a store. The query recomputes when the store emits. Mix-and-match:

```ts
const $minAge = createStore(18)
const $roles  = createStore(["admin", "moderator"])

userModel.query()
  .where("age",  gte($minAge))   // reactive number
  .where("role", oneOf($roles))  // reactive array
  .where("name", includes("a"))  // static string
```

Internally every reactive operand is added to the query's `combine` dependency list. Subscribing to `$filtered` (or any downstream output) wires the store into effector's dependency graph; changing the store triggers a single filter recomputation.

If a reactive operand is updated to a value that leaves the filter result unchanged, the outputs emit only if their final value changed — effector's built-in dedup handles this.

## `Operator<T>` shape

Every operator returns an object of this shape:

```ts
interface Operator<T> {
  name:       string
  operand:    Reactive<unknown>
  predicate:  (value: T, resolved: unknown) => boolean
  isReactive: boolean
  $operand?:  Store<unknown>
}
```

You rarely need to inspect this directly — but the `name` field is helpful for debugging (`q.descriptor.whereClauses.forEach(c => console.log(c.operator.name))`) and the object is stable across calls, so structural equality works for memoisation.

## See also

- [`CollectionQuery`](./collection-query.md) — consumes operators via `.where`.
- [`QueryField`](./query-field.md) — bulk reads/writes for a filtered set.
- [`GroupedQuery`](./grouped-query.md) — group filtered results by a field.
