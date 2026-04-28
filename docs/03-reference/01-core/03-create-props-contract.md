---
description: "Reference for createPropsContract() and PropsContractChainImpl for typed view-model inputs."
---

# `createPropsContract()` and `PropsContractChainImpl`

Factory and class for declaring the external-input shape of a view model. `createPropsContract()` returns a fresh `PropsContractChainImpl`; the chain accumulates prop descriptors with `.store()` and `.event()` (each of which can be marked `.optional()`), and optionally `.merge()` with another props contract. The resulting chain is passed as `props` to `createViewModel` or a form view model.

> Props contracts do not descend from `BaseContractChain` — props are external inputs, not owned reactive state. They have no factory defaults, no SID root, and no `.derived()` method. They register with the contract strategy registry so that `pick`, `omit`, `partial`, `required`, and `merge` work on them.

## `createPropsContract()`

```ts
function createPropsContract(): PropsContractChainImpl
```

Returns a fresh `PropsContractChainImpl` with no declared props.

```ts
import { createPropsContract } from "@kbml-tentacles/core"

const modalProps = createPropsContract()
  .store("isOpen", (s) => s<boolean>())
  .store("title",  (s) => s<string>().optional())
  .event("onClose", (e) => e<void>())
```

No arguments. Every call returns an independent chain.

## `.store(name, builder)`

```ts
.store<K extends string, T, Opt extends boolean = false>(
  name: K,
  builder: (s: PropStoreFieldBuilder) => PropStoreTyped<T, Opt>,
): PropsContractChainImpl<Props & Record<K, PropStoreMeta<T, Opt>>>
```

Declares a store prop — a reactive value passed from the caller to the view model. Inside the view model's `fn`, the prop is exposed under `ctx.props.$<name>` as a `Store<T>`.

```ts
createPropsContract()
  .store("userId",   (s) => s<number>())
  .store("pageSize", (s) => s<number>().optional())
```

The callable `s<T>()` returns a prop typed result with a chainable `.optional()` method. `.optional()` widens the type of the corresponding `CreateInput` key from required to optional. When an optional prop is not provided, its backing store holds `undefined`.

**Throws** on duplicate prop name.

## `.event(name, builder)`

```ts
.event<K extends string, T, Opt extends boolean = false>(
  name: K,
  builder: (e: PropEventFieldBuilder) => PropEventTyped<T, Opt>,
): PropsContractChainImpl<Props & Record<K, PropEventMeta<T, Opt>>>
```

Declares an event prop — a callback the view model invokes. Inside the view model's `fn`, the prop is exposed under `ctx.props.<name>` (no `$` prefix) as an `EventCallable<T>`.

```ts
createPropsContract()
  .event("onSubmit", (e) => e<{ query: string }>())
  .event("onClose",  (e) => e<void>().optional())
```

Framework adapters wire event props through a stable ref so the latest callback is always the one that runs, even if the caller re-renders with a new function identity. Event props accept either an `EventCallable<T>` or a plain callback `(payload: T) => void` at `.create()` time; the adapter normalizes them into a stable event.

**Throws** on duplicate prop name.

## `.optional()`

Chainable method on both `s<T>()` and `e<T>()` results. Marks the prop as optional in the generated `CreateInput` type.

```ts
createPropsContract()
  .store("title", (s) => s<string>().optional())
  .event("onCancel", (e) => e<void>().optional())
```

Calling `.optional()` without arguments makes the prop optional. Calling it twice is idempotent. There is no `.required()` counterpart — absence of `.optional()` already means required.

## `.merge(other)`

```ts
.merge<Other extends PropsContractChainImpl<any>>(
  other: Other,
): PropsContractChainImpl<Props & InferPropsFromChain<Other>>
```

Copies every prop descriptor from `other` into this chain. Returns the widened chain.

```ts
const auth = createPropsContract()
  .store("userId", (s) => s<number>())

const page = createPropsContract()
  .store("page", (s) => s<number>())
  .merge(auth)
```

**Throws** if any prop name in `other` already exists on this chain. The error message names the colliding prop.

## How props surface inside a view model

The props contract is consumed by `createViewModel({ contract, props })`. At instantiation time, `createViewModel(...).create(input)` accepts a shape derived from the props contract:

| Prop kind | `CreateInput` accepts | Inside `fn` context |
|---|---|---|
| `.store("x", ...)` | `T \| Store<T>` | `ctx.props.$x: Store<T>` |
| `.store("x", ...).optional()` | `T \| Store<T> \| undefined` (key is optional) | `ctx.props.$x: Store<T \| undefined>` |
| `.event("on", ...)` | `EventCallable<T> \| ((p: T) => void)` | `ctx.props.on: EventCallable<T>` |
| `.event("on", ...).optional()` | `EventCallable<T> \| ((p: T) => void) \| undefined` | `ctx.props.on: EventCallable<T>` (no-op when missing) |

Raw store values are auto-wrapped into an effector store (created with `{ skipVoid: false }` so that `undefined` values are preserved). Raw callbacks are auto-wrapped into an event whose watcher invokes the current callback.

```ts
const modal = createViewModel({
  contract: createViewContract().store("open", (s) => s<boolean>().default(false)),
  props: createPropsContract()
    .store("title", (s) => s<string>())
    .event("onClose", (e) => e<void>()),
  fn: ({ $open }, { props }) => {
    sample({ clock: props.onClose, fn: () => false, target: $open })
    return { $open, $title: props.$title, onClose: props.onClose }
  },
})

modal.create({ title: "Hello", onClose: () => console.log("closed") })
```

## Raw callbacks vs. `EventCallable`

Event props accept two forms at `.create()` time:

1. **An `EventCallable<T>`** — used directly. The VM invokes it, payloads flow through effector's graph.
2. **A plain callback `(payload: T) => void`** — auto-wrapped into an internal event; the callback is registered as a watcher. Each subsequent `.create()` with a new callback creates a fresh internal event. Framework adapters typically re-create the VM only when the props contract-relevant identity changes; the callback's identity alone does not trigger re-creation — adapters use a ref so the latest callback is always the one running.

```ts
// Both of these are accepted:
modal.create({ title: "Hi", onClose: myEvent })
modal.create({ title: "Hi", onClose: (_) => console.log("closed") })
```

When an optional event prop is not provided, the internal event is still created; watchers just do nothing.

## Composition

Props contracts can be composed with `.merge(other)` (on the chain) or `merge(a, b)` (standalone), `pick`, `omit`, `partial`, and `required` from `@kbml-tentacles/core`:

```ts
import { createPropsContract, omit, partial } from "@kbml-tentacles/core"

const full = createPropsContract()
  .store("title",    (s) => s<string>())
  .store("subtitle", (s) => s<string>())
  .event("onClose",  (e) => e<void>())

const withoutSubtitle = omit(full, "subtitle")
const allOptional    = partial(full)
```

See [Contract utilities](/reference/core/contract-utilities) for the full behaviour — props chains register with the same strategy registry as model and view chains, so every utility works uniformly.

## Notes

- Props contracts cannot declare `.derived()`. Derived values belong in the *view* contract, where they can be assembled from both stored state and props.
- Props contracts cannot be passed to `createContract`/`createViewContract` — they are a separate chain type.
- `pick(propsChain, "x", "y")` and `omit(propsChain, "x")` return a new props chain containing only the selected prop descriptors.
- `partial(propsChain)` flips every prop's `isOptional` flag to `true`. `required(propsChain)` flips it to `false`.
- Each `createPropsContract()` call returns a fresh chain; calling twice produces independent instances that share no state.

## Related

- [createViewContract](/reference/core/create-view-contract) — the companion contract for stored state.
- [createViewModel](/reference/core/create-view-model) — the consumer of a props contract.
- [Contract utilities](/reference/core/contract-utilities) — `pick`, `omit`, `partial`, `required`, `merge` on prop chains.
- [Field builders](/reference/core/field-builders) — `.optional()` on prop builders.
