# `createViewContract()` and `ViewContractChain`

Factory and class for declaring a view-model contract — the schema for ephemeral per-component state. `createViewContract()` returns a fresh `ViewContractChain`; the chain accumulates field descriptors with `.store()`, `.event()`, `.derived()`, and `.merge()`. View contracts are terminal: pass the chain directly to `createViewModel({ contract })`. There is no `.pk()`, `.ref()`, or `.inverse()` — view models have no persistent identity and no relationships.

> View contracts share the contract-layer runtime with model contracts. The only difference is the public surface: no refs, no PK, no compound identity. Everything else — factory defaults, `resetOn`, derived chains, SID detection, SSR safety — works identically.

## `createViewContract()`

```ts
function createViewContract(): ViewContractChain
```

Returns a fresh `ViewContractChain`. The constructor calls `detectSidRoot()` so that stores inside the materialised view model receive deterministic SIDs.

```ts
import { createViewContract } from "@kbml-tentacles/core"

const searchForm = createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page",  (s) => s<number>().default(1))
  .event("submit", (e) => e<void>())
```

The returned value is ready to pass to `createViewModel({ contract: searchForm })`. No finalization step is required.

## `.store(name, builder)`

```ts
.store<K extends string, T, HD extends boolean, U extends boolean, I extends boolean>(
  name: K,
  builder: (s: StoreFieldBuilder) => StoreResult<T, HD, U, I>,
): ViewContractChain<
  Stores & Record<K, StoreMeta<T, HD, U, I>>,
  Events,
  Derived
>
```

Declares a store field. Same semantics as `ModelContractChain.store`. See [Field builders](/reference/core/field-builders) for the full `s` surface.

```ts
createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page",  (s) => s<number>().default(1).resetOn("query"))
```

`.unique()`, `.index()`, and `.autoincrement()` are accepted at the type level for surface uniformity but have no observable effect in view models — view models do not maintain registries, indexes, or PKs. In practice, use only `.default()` and `.resetOn()` here.

**Throws** on duplicate field name.

## `.event(name, builder)`

```ts
.event<K extends string, T>(
  name: K,
  builder: (e: EventFieldBuilder) => EventResult<T>,
): ViewContractChain<
  Stores,
  Events & Record<K, EventMeta<T>>,
  Derived
>
```

Declares an event field. Invoke `e<T>()` with the payload type.

```ts
createViewContract()
  .store("query",  (s) => s<string>().default(""))
  .event("submit", (e) => e<void>())
  .event("select", (e) => e<number>())
```

Events become `EventCallable<T>` inside the materialised view model. Reducers are wired inside the `fn` passed to `createViewModel`.

**Throws** on duplicate field name.

## `.derived(name, factory)`

```ts
.derived<K extends string, T>(
  name: K,
  factory: (stores: DerivedParam<Stores, Derived, {}>) => Store<T>,
): ViewContractChain<
  Stores,
  Events,
  Derived & Record<K, T>
>
```

Declares a computed store built from previously declared stores and previously declared derived fields. Because view contracts have no refs, the `Refs` slot of `DerivedParam` is empty — only `$<store>` and `$<derived>` entries are present.

```ts
createViewContract()
  .store("firstName", (s) => s<string>().default(""))
  .store("lastName",  (s) => s<string>().default(""))
  .derived("full", (stores) =>
    combine(stores.$firstName, stores.$lastName, (a, b) => `${a} ${b}`.trim()),
  )
```

Derived fields are read-only on the shape. A derived factory can only reference fields declared before it.

**Note**: derived stores are created at view-model instantiation time and live inside the view model's effector region. They are disposed together with the rest of the view when the lifecycle unmounts.

## `.merge(source)`

```ts
.merge<
  MS extends Record<string, StoreMeta>,
  ME extends Record<string, unknown>,
  MD extends Record<string, unknown>,
>(
  source: ViewContractChain<MS, ME, MD>,
): ViewContractChain<
  Stores & MS,
  Events & ME,
  Derived & MD
>
```

Copies every field from `source` into this chain. Returns the same chain widened with the merged types.

```ts
const pagination = createViewContract()
  .store("page",     (s) => s<number>().default(1))
  .store("pageSize", (s) => s<number>().default(20))

const listView = createViewContract()
  .store("query", (s) => s<string>().default(""))
  .merge(pagination)
  .event("submit", (e) => e<void>())
```

**Throws** if any field name in `source` already exists.

## No `.ref()`, `.inverse()`, or `.pk()`

View contracts deliberately omit these methods:

| Missing method | Why |
|---|---|
| `.ref()` | View models are ephemeral per-component state, not persistent entities. Relationships between ephemeral states have no well-defined semantics. |
| `.inverse()` | Inverses require a target model with a ref; view models cannot be targeted. |
| `.pk()` | View models do not have identity — each `createViewModel().create()` call returns a fresh instance. |

If you need persistent identity or relationships, use `createContract()` instead.

## Using a view contract

Pass the chain directly to `createViewModel`. No finalization step is needed.

```ts
import { createViewContract, createViewModel } from "@kbml-tentacles/core"
import { sample } from "effector"

const searchContract = createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page",  (s) => s<number>().default(1).resetOn("query"))
  .event("submit", (e) => e<void>())

const searchView = createViewModel({
  contract: searchContract,
  fn: ({ $query, $page, submit }, { mounted }) => {
    sample({ clock: mounted, target: submit })
    return { $query, $page, submit }
  },
})

const { $query, $page, submit } = searchView.create()
```

## Notes

- A view chain and a model chain are distinct types at compile time. `pick(viewContract, ...)` returns a view chain; it cannot be merged with a model chain.
- View contracts are not callable by framework adapters directly — always wrap them in `createViewModel` first.
- The runtime shape of the stored descriptors is identical to model contracts, which is why utilities like `pick`, `omit`, `partial`, and `required` work across both chain types.

## Related

- [createContract](/reference/core/create-contract) — model contracts with refs and PKs.
- [createPropsContract](/reference/core/create-props-contract) — declaring external prop inputs.
- [Field builders](/reference/core/field-builders) — the `s` and `e` API.
- [createViewModel](/reference/core/create-view-model) — materialise a view contract into a runtime definition.
- [Contract utilities](/reference/core/contract-utilities) — `pick`, `omit`, `partial`, `required`, `merge` on view chains.
