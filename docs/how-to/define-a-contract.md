# Define a contract

A contract is a schema declared through a chained builder. Start with `createContract()`, add fields one method call at a time, and finalize with `.pk(...)` to get a `FinalizedContractImpl` that can be passed to `createModel`.

| Step | Method | Purpose |
|---|---|---|
| 1 | `.store(name, s => s<T>())` | Declare a data field with payload type `T` |
| 2 | `.event(name, e => e<T>())` | Declare an event with payload type `T` |
| 3 | `.derived(name, stores => ...)` | Declare a computed store from existing fields |
| 4 | `.ref(name, cardinality, opts?)` | Declare a relationship to another model |
| 5 | `.inverse(name, refField)` | Declare a reactive reverse lookup |
| 6 | `.pk(...fields)` | Finalize the contract and pick a primary key |

Every method returns `this` (with a new phantom type) so you can chain freely. After `.pk()` the chain is closed — the resulting `FinalizedContractImpl` is immutable and cannot be extended.

## Declare store fields

The first argument to `.store()` is a field name; the second is a builder function that receives a callable `s` and returns a typed descriptor. Invoke `s<T>()` with the payload type to declare the field.

```ts
import { createContract } from "@kbml-tentacles/core"

const userContract = createContract()
  .store("id",    (s) => s<number>())
  .store("name",  (s) => s<string>())
  .store("email", (s) => s<string>())
  .store("age",   (s) => s<number>())
  .pk("id")
```

The callable form — `s<T>()` — is intentional. It lets the chain infer the element type while still returning a fluent object with `.default()`, `.unique()`, `.index()`, and so on. Do not write `s.type<T>()` — that method does not exist.

Chain a default value to make the field optional at create time:

```ts
createContract()
  .store("id",     (s) => s<number>())
  .store("status", (s) => s<"draft" | "published">().default("draft"))
  .pk("id")
```

Store fields may hold any value — scalars, unions, arrays, records, tagged types — because the type parameter is yours to choose. The library does not inspect payload shapes.

```ts
createContract()
  .store("id",       (s) => s<string>())
  .store("tags",     (s) => s<string[]>().default(() => []))
  .store("metadata", (s) => s<{ source: string; version: number }>())
  .pk("id")
```

## Declare events

Events represent actions you want to dispatch against instances. They are declared with `.event(name, e => e<T>())` where `T` is the payload type. Use `void` for events that carry no payload.

```ts
createContract()
  .store("id",    (s) => s<number>())
  .store("title", (s) => s<string>())
  .store("done",  (s) => s<boolean>().default(false))
  .event("rename", (e) => e<string>())
  .event("toggle", (e) => e<void>())
  .pk("id")
```

At runtime each declared event becomes an `EventCallable<T>` on every instance. Call the event with a payload to trigger the reducer you wire up in the model's `fn` builder:

```ts
const todoModel = createModel({
  contract: todoContract,
  fn: ({ $title, $done, rename, toggle }) => {
    $title.on(rename, (_prev, next) => next)
    $done.on(toggle, (prev) => !prev)
    return {}
  },
})
```

Events are independent from stores — a contract can declare events without any stores, or vice versa. Reducers are wired inside `fn`; declaring an event does not create any reactive link by itself.

## Derive computed stores

`.derived(name, factory)` declares a computed store built from other fields of the same contract. The factory receives a `stores` record where each declared store appears with a `$` prefix and refs appear as their runtime API.

```ts
createContract()
  .store("id",        (s) => s<number>())
  .store("firstName", (s) => s<string>())
  .store("lastName",  (s) => s<string>())
  .derived("fullName", (stores) =>
    stores.$firstName.map((first) => `${first}`).map((first) =>
      `${first}`,
    ),
  )
  .derived("upper", (stores) => stores.$firstName.map((n) => n.toUpperCase()))
  .pk("id")
```

Combine multiple stores with effector's `combine`:

```ts
import { combine } from "effector"
import { createContract } from "@kbml-tentacles/core"

const personContract = createContract()
  .store("id",        (s) => s<number>())
  .store("firstName", (s) => s<string>())
  .store("lastName",  (s) => s<string>())
  .derived("fullName", (stores) =>
    combine(stores.$firstName, stores.$lastName, (first, last) => `${first} ${last}`),
  )
  .pk("id")
```

Derived fields appear on instances with a `$` prefix exactly like stores. They are read-only: you cannot `.set()` or `.on()` a derived field — its value follows its sources.

`.derived` has access to:

- All previously declared stores as `$<name>`
- All previously declared derived fields as `$<name>`
- Refs as their runtime API (`ref<"many">` → `{ $ids, $resolved, add, remove }`, `ref<"one">` → `{ $id, $resolved, set, clear }`)

Order matters for derived chains — a derived field can only reference fields declared before it.

## Add a primary key

`.pk(...fields)` closes the chain and returns a `FinalizedContractImpl`. Pass a single store field name for a simple primary key:

```ts
const userContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .pk("id")
```

Pass two or more field names to declare a compound primary key:

```ts
const membershipContract = createContract()
  .store("userId",   (s) => s<number>())
  .store("tenantId", (s) => s<string>())
  .store("role",     (s) => s<"admin" | "member">())
  .pk("userId", "tenantId")
```

With a compound PK, each instance is uniquely identified by the tuple `[userId, tenantId]`. Use `Model.getByKeySync(userId, tenantId)` and `Model.byPartialKey(userId)` to look up instances.

`.pk()` returns a `FinalizedContractImpl<Stores, Events, Derived, Refs, PkFields>`. This object has no chain methods — it is a frozen schema ready for `createModel`. The finalized contract also captures:

- The field descriptors accumulated during the chain
- A PK resolver function (single scalar or tuple)
- The detected SID root for SSR-safe store naming
- Factory default handlers, if any

After finalizing you cannot add more fields. If you need to extend a contract, use `.merge()` before calling `.pk()`, or reuse the contract via `pick`/`omit` (see below).

## Add relationships

Use `.ref()` for outgoing relationships and `.inverse()` for reverse lookups. Both require the primary key to be assigned last.

```ts
const userContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .ref("posts",  "many", { fk: "postIds", onDelete: "cascade" })
  .ref("avatar", "one",  { onDelete: "nullify" })
  .inverse("follower", "follows")
  .pk("id")
```

- The cardinality argument (`"many"` or `"one"`) comes before the options bag.
- `onDelete` accepts `"cascade"`, `"nullify"`, or `"restrict"`. The default is `"nullify"`.
- `fk` lets you alias the ref under a specific foreign-key field name (handy for API-style inputs).
- `.inverse(name, refField)` takes the local name first and the remote ref field name second.

Relationships are resolved lazily — the referenced model does not have to exist when the contract is declared. Bind the target model on the generated `Model` using `.bind({ posts: () => PostModel })`. See [Relate models with refs](/how-to/relate-models-with-refs) for the full mechanics.

## Reuse via `.merge` or `pick` / `omit`

`.merge(source)` copies every field from another contract chain into the current one. Fields collide loudly — a duplicate name throws at schema build time.

```ts
import { createContract } from "@kbml-tentacles/core"

const auditFields = createContract()
  .store("createdAt", (s) => s<number>().default(() => Date.now()))
  .store("updatedAt", (s) => s<number>().default(() => Date.now()))

const postContract = createContract()
  .store("id",    (s) => s<string>())
  .store("title", (s) => s<string>())
  .merge(auditFields)
  .pk("id")
```

You can merge any same-kind chain: `ModelContractChain` with `ModelContractChain`, `ViewContractChain` with `ViewContractChain`, `PropsContractChainImpl` with `PropsContractChainImpl`.

To work on an already-finalized contract (or reuse a subset of one), use the standalone helpers `pick`, `omit`, `partial`, `required`, and `merge` exported from `@kbml-tentacles/core`. See [Compose contracts](/how-to/compose-contracts) for the complete toolkit.

## View and props contracts — a subset

The contract surface comes in three flavours. All three share the same `.store` / `.event` grammar. They differ in which methods are available on top:

| Factory | Chain class | Available fields |
|---|---|---|
| `createContract()` | `ModelContractChain` | `store`, `event`, `derived`, `ref`, `inverse`, `pk` |
| `createViewContract()` | `ViewContractChain` | `store`, `event`, `derived` |
| `createPropsContract()` | `PropsContractChainImpl` | `store`, `event` (each can be marked `.optional()`) |

View contracts skip `.ref` / `.inverse` / `.pk` because view models are ephemeral per-component state containers — they have no persistent identity and no relationships. Props contracts skip `.derived` as well — they only describe external inputs.

```ts
import { createViewContract, createPropsContract } from "@kbml-tentacles/core"

const searchFormContract = createViewContract()
  .store("query",  (s) => s<string>().default(""))
  .store("page",   (s) => s<number>().default(1))
  .event("submit", (e) => e<void>())

const searchProps = createPropsContract()
  .store("userId", (s) => s<number>())
  .store("count",  (s) => s<number>().optional())
  .event("onClose", (e) => e<void>())
```

`createViewContract()` returns immediately — no `.pk()` needed. Pass it straight to `createViewModel({ contract, props })`.

## Putting it together

A complete model contract declares stores, events, derived fields, and relationships before finalizing with `.pk()`:

```ts
import { createContract } from "@kbml-tentacles/core"

export const postContract = createContract()
  .store("id",       (s) => s<string>())
  .store("title",    (s) => s<string>())
  .store("body",     (s) => s<string>().default(""))
  .store("authorId", (s) => s<number>())
  .store("likes",    (s) => s<number>().default(0))
  .event("publish", (e) => e<void>())
  .event("like",    (e) => e<void>())
  .derived("preview", (stores) =>
    stores.$body.map((b) => b.slice(0, 120)),
  )
  .ref("author",   "one",  { fk: "authorId", onDelete: "restrict" })
  .ref("comments", "many", { onDelete: "cascade" })
  .pk("id")
```

The resulting `postContract` is a `FinalizedContractImpl` ready for `createModel({ contract: postContract })`. Its type carries:

- The set of store field names and their value types
- The event names and payload types
- The derived field names and value types
- The ref names, cardinalities, and onDelete policies
- The primary key field (or tuple)

Everything is checked at compile time through phantom generics — there is no runtime reflection, no string matching in user code.
