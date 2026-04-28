---
description: "Reference for createContract() and the ModelContractChain fluent contract builder."
---

# `createContract()` and `ModelContractChain`

Factory and class for declaring a model contract. `createContract()` returns a fresh `ModelContractChain`; the chain accumulates field descriptors as `.store()`, `.event()`, `.derived()`, `.ref()`, `.inverse()`, and `.merge()` are called, and finalizes when `.pk()` returns a `FinalizedContractImpl` ready to pass to `createModel({ contract })`.

> Every chain method returns `this` with a widened phantom type. Order of non-terminal methods does not affect the finalized contract, except that `.derived()` factories may reference only fields declared before them.

## `createContract()`

```ts
function createContract(): ModelContractChain
```

Returns an empty `ModelContractChain`. The constructor calls `detectSidRoot()` to capture the current SID prefix so that generated effector stores inside the eventual model have deterministic SIDs under SSR.

```ts
import { createContract } from "@kbml-tentacles/core"

const chain = createContract()
```

No arguments. Calling it twice produces independent chains.

## `.store(name, builder)`

```ts
.store<K extends string, T, HD extends boolean, U extends boolean, I extends boolean>(
  name: K,
  builder: (s: StoreFieldBuilder) => StoreResult<T, HD, U, I>,
): ModelContractChain<
  Stores & Record<K, StoreMeta<T, HD, U, I>>,
  Events,
  Derived,
  Refs
>
```

Declares a store field. `name` must be unique across all field categories (stores, events, derived, refs). The `builder` receives a callable `s` and returns a typed descriptor.

```ts
createContract()
  .store("id",    (s) => s<number>())
  .store("title", (s) => s<string>().default(""))
  .store("done",  (s) => s<boolean>().default(false))
  .pk("id")
```

See [Field builders](/reference/core/field-builders) for the full `s` API (`.default`, `.unique`, `.index`, `.autoincrement`, `.resetOn`).

**Throws** if `name` collides with an already-declared field.

## `.event(name, builder)`

```ts
.event<K extends string, T>(
  name: K,
  builder: (e: EventFieldBuilder) => EventResult<T>,
): ModelContractChain<
  Stores,
  Events & Record<K, EventMeta<T>>,
  Derived,
  Refs
>
```

Declares an event field. `builder` receives a callable `e`; invoke `e<T>()` to set the payload type. Use `e<void>()` for payload-less events.

```ts
createContract()
  .store("id",    (s) => s<number>())
  .event("rename", (e) => e<string>())
  .event("toggle", (e) => e<void>())
  .pk("id")
```

Events become `EventCallable<T>` on each instance. Wire reducers in the model's `fn` builder via `$store.on(event, ...)`.

**Throws** on duplicate field name.

## `.derived(name, factory)`

```ts
.derived<K extends string, T>(
  name: K,
  factory: (stores: DerivedParam<Stores, Derived, Refs>) => Store<T>,
): ModelContractChain<
  Stores,
  Events,
  Derived & Record<K, T>,
  Refs
>
```

Declares a computed store built from other fields of the same contract. The `stores` parameter passed to `factory` exposes:

- Each declared store under `$<name>` as `ModelStore<T>`.
- Each previously declared derived field under `$<name>` as `Store<T>`.
- Each `ref("x", "many")` as `RefManyApi`.
- Each `ref("x", "one")` as `RefOneApi`.
- Each `inverse(...)` as `Store<unknown[]>` under `$<name>`.

```ts
createContract()
  .store("firstName", (s) => s<string>())
  .store("lastName",  (s) => s<string>())
  .derived("full", (stores) =>
    combine(stores.$firstName, stores.$lastName, (a, b) => `${a} ${b}`),
  )
  .store("id", (s) => s<number>())
  .pk("id")
```

Derived fields are read-only on instances. You cannot call `.set()` or `.on()` on a derived field.

**Note**: a derived factory can only reference fields declared before it in the chain. Referring to a field declared later is a TypeScript error.

## `.ref(name, cardinality, options?)`

```ts
.ref<
  K extends string,
  C extends "one" | "many",
  FK extends (keyof Stores & string) | undefined = undefined,
>(
  name: K,
  cardinality: C,
  options?: {
    onDelete?: "cascade" | "nullify" | "restrict"
    fk?: FK
  },
): ModelContractChain<
  Stores,
  Events,
  Derived,
  Refs & Record<K, RefMeta<C, OnDeletePolicy, FK>>
>
```

Declares a relationship to another model. The target is resolved at model-construction time via `createModel({ contract, refs: { <refName>: () => TargetModel } })` — the target does not need to exist when the contract is declared.

| Argument | Meaning |
|---|---|
| `name` | Field name on the instance (`$-`prefixed when used as an inverse; see below). |
| `cardinality` | `"one"` for a single-target ref (exposes `RefOneApi`); `"many"` for a multi-target ref (exposes `RefManyApi`). |
| `options.onDelete` | Cascade/restrict/nullify policy. **Direction depends on cardinality**: `"one"` refs fire on **target** deletion (SQL semantics — the policy guards the FK holder); `"many"` refs fire on **owner** deletion (no SQL analog — the policy guards the id list). Default is `"nullify"`. See [Deletion policies](../ref-api#deletion-policies). |
| `options.fk` | Optional foreign-key alias (`"one"` only in idiomatic usage). When set, `Model.create({})` and `update()` accept `<fk>: id` as a shortcut for connecting the ref, and the FK column is kept in sync with the ref field (including nulled automatically on `nullify` / target delete). The FK name must be a store field already declared in this contract. |

```ts
const postContract = createContract()
  .store("id",       (s) => s<string>())
  .store("authorId", (s) => s<number>())
  // "one" + restrict: deleting an author is blocked while any post references them.
  .ref("author",   "one",  { fk: "authorId", onDelete: "restrict" })
  // "many" + cascade: deleting this post cascade-deletes every comment in the array.
  .ref("comments", "many", { onDelete: "cascade" })
  .pk("id")
```

The default `onDelete` is `"nullify"`. Omitting `options` is equivalent to `{ onDelete: "nullify" }`.

**Throws** on duplicate field name. Invalid `fk` names (referring to a missing store) surface at model-creation time, not contract-build time.

## `.inverse(name, refField)`

```ts
.inverse<K extends string>(
  name: K,
  refField: string,
): ModelContractChain<
  Stores,
  Events,
  Derived,
  Refs & Record<K, InverseMeta>
>
```

Declares a reverse lookup — a reactive list of instances whose ref (named `refField`, on a model wired via `createModel`'s `refs` option) points to this instance. Inverses are read-only projections over the inverse index.

```ts
const userContract = createContract()
  .store("id", (s) => s<number>())
  .inverse("posts", "author") // posts.author === userId
  .pk("id")
```

On instances, an inverse appears under `$<name>` as `Store<unknown[]>`. The source model is supplied through the `refs` option on `createModel` — tentacles resolves the inverse by consulting that model's ref metadata.

**Throws** on duplicate field name.

## `.merge(source)`

```ts
.merge<
  MS extends Record<string, StoreMeta>,
  ME extends Record<string, unknown>,
  MD extends Record<string, unknown>,
  MR extends Record<string, AnyRefOrInverse>,
>(
  source: ModelContractChain<MS, ME, MD, MR>,
): ModelContractChain<
  Stores & MS,
  Events & ME,
  Derived & MD,
  Refs & MR
>
```

Copies every field descriptor and factory-default handler from `source` into this chain, then returns this chain widened with the merged types.

```ts
const audit = createContract()
  .store("createdAt", (s) => s<number>().default(() => Date.now()))
  .store("updatedAt", (s) => s<number>().default(() => Date.now()))

const post = createContract()
  .store("id",    (s) => s<string>())
  .store("title", (s) => s<string>())
  .merge(audit)
  .pk("id")
```

**Throws** if a field name in `source` already exists in this chain.

## `.pk(...fields)`

```ts
.pk<F extends (keyof Stores | keyof Refs) & string>(
  ...fields: [F, ...F[]]
): FinalizedContractImpl<Stores, Events, Derived, Refs, F>
```

Closes the chain and returns a frozen `FinalizedContractImpl`. The argument list is variadic:

- **One field** — the PK is a scalar of that field's value type. Look up with `Model.get(id)`.
- **Two or more fields** — the PK is a compound key. Look up with `Model.get([a, b])`, passing the parts as an array in the order declared.

```ts
// Single PK
createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .pk("id")

// Compound PK
createContract()
  .store("userId",   (s) => s<number>())
  .store("tenantId", (s) => s<string>())
  .store("role",     (s) => s<"admin" | "member">())
  .pk("userId", "tenantId")
```

The finalized contract exposes (internal) readers:

| Method | Description |
|---|---|
| `.getContract()` | Return the collected field descriptors. |
| `.getPk()` | Return the PK resolver function. |
| `.getSidRoot()` | Return the SID prefix detected at `createContract` time. |
| `.getFactoryDefaults()` | Return the map of factory-default handlers, or `undefined`. |

Users rarely call these — pass the finalized contract directly to `createModel({ contract })`.

**Notes**

- Once `.pk()` is called, no further chain methods are available. The returned object has no `.store()` / `.event()` / etc.
- PK fields must be store fields or refs. PK inference from derived or event fields is a type error.
- Compound PKs are stored and compared as arrays. Equality uses shallow element comparison.

## Related

- [Field builders](/reference/core/field-builders) — the `s` and `e` builders used inside `.store()` / `.event()`.
- [createViewContract](/reference/core/create-view-contract) — a subset of the same grammar for ephemeral state.
- [Contract utilities](/reference/core/contract-utilities) — `pick`, `omit`, `partial`, `required`, `merge`.
- [createModel](/reference/core/create-model) — materialize the finalized contract.
