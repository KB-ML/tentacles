---
description: "Reference for createViewModel(): build a ViewModelDefinition from a contract and optional props."
---

# createViewModel

`createViewModel` builds a `ViewModelDefinition` from a pre-built view or model contract plus optional props. View models are ephemeral — their units live inside a per-instance effector region that is torn down on unmount. Use them for component-local state that needs a reactive store shape without the persistence, refs, and primary keys of a `Model`. This page documents the factory function, its config, and the `stores` / `ctx` objects passed to `fn`.

## Signature

```ts
function createViewModel<
  CC extends BaseContractChain,
  Props extends Record<string, AnyPropMeta> = {},
  R = ViewModelStores<...>,
>(config: {
  contract: CC
  name?: string
  props?: PropsContractChainImpl<Props>
  fn?: (
    stores: ViewModelStores<Stores, Events, Derived>,
    ctx:    ViewModelContext<ExtractVMProps<Props>>,
  ) => R
}): ViewModelDefinition<R, Stores, Events, Derived, Props>
```

Returns a `ViewModelDefinition` — a factory object whose `.create` / `.instantiate` calls produce live view model instances.

## Config

| Key | Type | Default | Purpose |
|---|---|---|---|
| `contract` | `ViewContractChain` or `ModelContractChain` | — | Required. Pre-built chain value. |
| `name` | `string` | `"unnamed"` | SID prefix + debug label. |
| `props` | `PropsContractChainImpl` | `undefined` | External prop inputs. |
| `fn` | `(stores, ctx) => Shape` | `undefined` | Runs per `.create()` / `.instantiate()`. |

Both `contract` and `props` must be pre-built values, not inline callbacks. `createViewModel` enforces this with a runtime check:

```ts
if (!(contract instanceof BaseContractChain)) {
  throw new TentaclesError(
    "createViewModel: `contract` must be a pre-built ViewContractChain or ModelContractChain value"
  )
}
if (props !== undefined && !(props instanceof PropsContractChainImpl)) {
  throw new TentaclesError(
    "createViewModel: `props` must be a pre-built PropsContractChain value"
  )
}
```

Declaring the chain separately makes it reusable, composable via `merge`/`pick`/`omit`, and unit-testable on its own.

## Minimal example

```ts
import { createViewContract, createViewModel } from "@kbml-tentacles/core"

const searchContract = createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page",  (s) => s<number>().default(1))
  .event("reset", (e) => e<void>())

const searchViewModel = createViewModel({
  contract: searchContract,
})
```

With no `fn`, the shape returned from `.create()` is simply the stores object — `{ $query, $page, reset }`.

## The `stores` argument

`fn` receives all contract fields pre-built:

| Contract kind | Key | Type |
|---|---|---|
| `.store("q", ...)` | `$q` | `StoreWritable<T>` |
| `.event("reset", ...)` | `reset` | `EventCallable<T>` |
| `.derived("upper", ...)` | `$upper` | `Store<U>` |

Unlike a model, view-model stores are **real** `StoreWritable<T>` — not proxies. View models are ephemeral (per-instance), so there is no `$dataMap` and no materialisation cost to save.

```ts
createViewModel({
  contract: searchContract,
  fn: ({ $query, $page, reset }) => {
    $page.on(reset, () => 1)
    return { $query, $page, reset }
  },
})
```

## The `ctx` argument

The second argument carries lifecycle events and normalised props.

```ts
interface ViewModelContext<Props> {
  mounted:    EventCallable<void>
  unmounted:  EventCallable<void>
  $mounted:   Store<boolean>
  props:      Props
}
```

### Lifecycle

- `ctx.mounted` — fires when `instance.lifecycle.mount()` is called. Use for wiring load effects, subscriptions, etc.
- `ctx.unmounted` — fires on `lifecycle.unmount()` and `lifecycle.destroy()`.
- `ctx.$mounted` — derived `Store<boolean>`; `true` between a mount and the next unmount.

```ts
createViewModel({
  contract: searchContract,
  fn: ({ $query }, { mounted, unmounted }) => {
    sample({ clock: mounted, target: loadFx })
    sample({ clock: unmounted, target: abortFx })
    return { $query }
  },
})
```

### Props

`ctx.props` holds the **normalised** prop units, one key per declared prop:

- Store props are exposed under a `$`-prefixed key: `ctx.props.$userId: Store<number>`.
- Event props keep their raw name: `ctx.props.onClose: EventCallable<void>`.

```ts
const searchProps = createPropsContract()
  .store("userId",     (s) => s<number>())
  .store("placeholder",(s) => s<string>().optional())
  .event("onSubmit",   (e) => e<string>())

createViewModel({
  contract: searchContract,
  props:    searchProps,
  fn: ({ $query }, { props, mounted }) => {
    sample({ clock: mounted, source: props.$userId, target: loadFx })
    sample({ clock: $query.updates, target: props.onSubmit })
    return { $query, $userId: props.$userId }
  },
})
```

`normalizeProps` handles the raw-value-vs-store and callback-vs-event distinction — see [`ViewModelDefinition.normalizeProps`](./view-model-definition.md#normalize-props) for the full rules.

## Return value of `fn`

Whatever `fn` returns is what `.create()` hands back. Skipping `fn` returns the unit map directly.

```ts
// Without fn — shape is { $query, $page, reset }
createViewModel({ contract: searchContract })

// With fn — shape is exactly what you return
createViewModel({
  contract: searchContract,
  fn: ({ $query, $page }) => ({ $query, $page }),
})

// Extend with locals
createViewModel({
  contract: searchContract,
  fn: ({ $query }) => {
    const $isEmpty = $query.map((v) => v.length === 0)
    return { $query, $isEmpty }
  },
})
```

## Name and SIDs

The `name` field is folded into per-instance SIDs:

```
tentacles:vm:<parentPath>:<name>:<id>:<field>
```

Parent path comes from the active region when `.instantiate()` is called. Nesting a child VM inside a parent's `fn` produces a `parent:child` chain automatically. Without a name, VMs share the `"unnamed"` slot — fine for local dev, but distinct names are needed for stable SSR hydration.

## Contracts allowed

| Chain type | Accepted | Reason |
|---|---|---|
| `createViewContract()` | Yes | Designed for view models. |
| `createContract()` (finalized with `.pk`) | Yes | Only stores/events/derived are read — PK/refs/inverses ignored. |
| `createContract()` (un-finalized) | Yes (builder exposes same surface) | Stores/events/derived accessible. |
| `createPropsContract()` | No — pass as `props` | PropsContractChainImpl. |

View models do not create `$dataMap`, refs, or any Model-level state. Passing a finalized model contract is legal and occasionally useful (to share a schema between persistent and ephemeral views), but the persistent features are dropped.

## What it does NOT do

- It does not create units. `fn` is only defined here — units are created when `.instantiate()` or `.create()` runs.
- It does not attach a lifecycle. The returned `ViewModelDefinition` is a reusable factory; lifecycle belongs to each instance.
- It does not auto-mount. Framework adapters — `<View>` (primary) and `useView` (single-component alternative) — call `mount()` in their effect hook.

## See also

- [`ViewModelDefinition`](./view-model-definition.md) — the returned object.
- [`createViewContract`](./create-view-contract.md) — building `contract`.
- [`createPropsContract`](./create-props-contract.md) — building `props`.
