# Build a view model

View models encapsulate ephemeral UI state and wire it to external props. Use them when component state is too involved for local hooks but does not need to be a persistent entity.

## When to use a view model

Reach for `createViewModel` when:

- State belongs to a single component (or component subtree) and disappears when unmounted.
- The component has inputs (ids, titles, callbacks) that should accept both raw values and reactive stores.
- You want lifecycle hooks (`mounted`, `unmounted`) on stores you can share across renderers.

Reach for `createModel` instead when:

- Data survives across pages or routes.
- You need a primary key, refs, inverses, or collection queries.
- Several components must observe or mutate the same records.

A view model has no `$dataMap`, no refs, and no primary key. It creates bare effector stores inside a per-instance region that is destroyed on unmount.

## Declare the internal state

Internal state lives on a `createViewContract()` chain. It supports `.store()`, `.event()` and `.derived()`, but not `.ref()` or `.pk()` — those belong to persistent models.

```ts
import { createViewContract } from "@kbml-tentacles/core"

export const searchContract = createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page", (s) => s<number>().default(1))
  .event("reset", (e) => e<void>())
  .event("submit", (e) => e<string>())
  .derived("upperQuery", (s) => s.$query.map((v) => v.toUpperCase()))
```

Notes:

- The store builder callback is **called** with the type argument: `s<string>()`. There is no `s.type<string>()` method.
- `.derived(name, fn)` runs `fn` with the already-built stores (prefixed with `$`) and returns a mapped store. The derived field shows up on the shape as `$upperQuery`.
- `.resetOn(event)` on a store wires a reset to any event declared elsewhere on the chain.

Attempting `.ref()` or `.pk()` on a view contract is a type error and will also throw at runtime if bypassed.

## Declare external props

Props describe inputs that come from outside the view model — usually from the host component. Use `createPropsContract()`. Only `.store()` and `.event()` are supported, and both accept `.optional()`.

```ts
import { createPropsContract } from "@kbml-tentacles/core"

export const searchProps = createPropsContract()
  .store("userId", (s) => s<number>())
  .store("placeholder", (s) => s<string>().optional())
  .event("onSubmit", (e) => e<string>())
  .event("onClose", (e) => e<void>().optional())
```

At runtime:

- Store props accept either a plain value or an `effector` `Store<T>`. Tentacles normalises both to a store.
- Event props accept either an `EventCallable<T>` or a plain function `(payload: T) => void`.
- Optional props default to `undefined` if the caller omits them.

## Compose the view model

`createViewModel` takes a config object. It throws `TentaclesError` if you pass a raw chain object that has not been built into a proper contract instance.

```ts
import { createViewModel } from "@kbml-tentacles/core"
import { sample } from "effector"

export const searchViewModel = createViewModel({
  contract: searchContract,
  props: searchProps,
  fn: ({ $query, $page, reset, submit }, ctx) => {
    // stores: $query, $page, $upperQuery (derived)
    // events: reset, submit
    // ctx.props.$userId       — store prop, always a Store<number>
    // ctx.props.$placeholder  — store prop, Store<string | undefined>
    // ctx.props.onSubmit      — event prop, EventCallable<string>
    // ctx.props.onClose       — event prop, EventCallable<void> | undefined
    // ctx.mounted, ctx.unmounted — effector Events
    // ctx.$mounted            — Store<boolean>

    $query.reset(reset)
    $page.reset(reset)

    sample({
      clock: submit,
      source: $query,
      target: ctx.props.onSubmit,
    })

    return { $query, $page, reset, submit }
  },
})
```

What the `fn` receives:

- First argument — the built stores and events keyed by the names declared on the contract. Stores carry the `$` prefix; events keep their raw name. Derived fields are prefixed too.
- Second argument — the `ctx` object:
  - `ctx.props` — normalised prop shape (`$` prefix for stores, raw name for events).
  - `ctx.mounted`, `ctx.unmounted` — effector `Event` units fired by the lifecycle.
  - `ctx.$mounted` — `Store<boolean>` reflecting current mount state.

The return value of `fn` becomes the view model's shape. It has no intrinsic constraints — return what the consumer needs.

## Choose what to return

A few common patterns:

```ts
// 1. Expose the whole contract surface.
return { $query, $page, reset, submit }

// 2. Expose a narrowed surface with helpers.
return {
  $query,
  $page,
  goToNextPage: () => $page.update((p) => p + 1),
  reset,
}

// 3. Expose only the stores the view needs; use the field's built-in setter event.
//    `$query.set` is an EventCallable<string> — callable and usable as a sample target.
return {
  $query,
  setQuery: $query.set,
}
```

The shape type is inferred automatically, so consumers get typed stores and callbacks without manual annotations.

## Use the lifecycle

Every view model has a lifecycle built from effector units. Use it from inside `fn`:

```ts
import { createEffect, sample } from "effector"

const loadFx = createEffect(async (userId: number) => {
  const res = await fetch(`/api/users/${userId}/saved-searches`)
  return (await res.json()) as string[]
})

export const searchViewModel = createViewModel({
  contract: searchContract,
  props: searchProps,
  fn: ({ $query }, ctx) => {
    sample({
      clock: ctx.mounted,
      source: ctx.props.$userId,
      target: loadFx,
    })

    sample({
      clock: loadFx.doneData,
      fn: (list) => list[0] ?? "",
      target: $query,
    })

    return { $query }
  },
})
```

Outside `fn`, the lifecycle is available on the instance:

```ts
const instance = searchViewModel.instantiate({ userId: 42, onSubmit: (q) => console.log(q) })

instance.lifecycle.mount()          // fires `mounted`, sets `$mounted` to true
instance.lifecycle.unmount()        // fires `unmounted`, sets `$mounted` to false (StrictMode-safe)
instance.lifecycle.destroy()        // clears the effector region
```

`mount` and `unmount` do not clear nodes — they only toggle lifecycle signals, so StrictMode double-invocations are safe. `destroy` tears down the region and all units inside it.

## Instantiate

There are two ways to materialise a view model:

```ts
// Returns { shape, lifecycle, id } — useful when the host owns lifecycle.
const instance = searchViewModel.instantiate({
  userId: 42,
  onSubmit: (q) => console.log(q),
})
instance.shape.$query
instance.lifecycle.mount()

// Returns the shape directly — useful for short-lived usage.
const shape = searchViewModel.create({
  userId: 42,
  onSubmit: (q) => console.log(q),
})
shape.$query
```

`create` skips exposing the lifecycle explicitly; the region is still created. Frameworks that provide `useView` (React, Vue, Solid) wrap `instantiate` so that `mount`/`unmount` line up with the host component.

## Extend an existing view model

`VM.extend` derives a child view model. Pass new contract or prop fragments, an optional `name`, and optionally a new `fn`. The child's `fn` receives the parent's result via `ctx.base`.

```ts
import { createPropsContract, createViewContract } from "@kbml-tentacles/core"

const pagedContract = createViewContract()
  .store("pageSize", (s) => s<number>().default(20))

const pagedProps = createPropsContract()
  .store("total", (s) => s<number>())

export const PagedSearchVM = searchViewModel.extend({
  name: "PagedSearchVM",
  contract: pagedContract,
  props: pagedProps,
  fn: ({ $pageSize }, ctx) => ({
    ...ctx.base,     // parent shape: $query, $page, reset, submit
    $pageSize,
    total: ctx.props.$total,
  }),
})
```

Rules:

- If `extend` receives a contract or props fragment whose field names collide with the parent's, it throws `TentaclesError` at definition time.
- If you omit the `fn`, the child inherits the parent's `fn` as-is.
- The child can be `extend`-ed further, forming a chain of view models.

## Nest view models

A view model can create another view model inside its `fn`. The nested instance's region becomes a child of the parent's region, so destroying the parent cascades to the child.

```ts
export const filtersViewModel = createViewModel({
  contract: createViewContract()
    .store("category", (s) => s<string>().default("all")),
})

export const listViewModel = createViewModel({
  contract: createViewContract()
    .store("items", (s) => s<string[]>().default([])),
  fn: ({ $items }, ctx) => {
    const filters = filtersViewModel.instantiate()

    sample({
      clock: ctx.unmounted,
      target: filters.lifecycle.destroy,
    })

    return { $items, filters: filters.shape }
  },
})
```

Two guidelines when nesting:

1. Wire `ctx.unmounted` → `child.lifecycle.destroy` if you want deterministic tear-down. Otherwise the child keeps its region alive until the parent region is cleared.
2. Forward only the child's `shape` to the consumer — keep lifecycle control inside the parent.

Nested view models share the fork/scope of the outer call site, so SSR continues to work without extra plumbing.
