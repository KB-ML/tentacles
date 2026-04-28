---
description: "Reference for ViewModelDefinition: methods, instance shape, lifecycle, and teardown semantics."
---

# ViewModelDefinition

`ViewModelDefinition` is the object returned from `createViewModel`. It is a reusable factory — one `ViewModelDefinition` can produce many independent `ViewModelInstance` objects, each with its own effector region and lifecycle. This page documents every method on the definition, the shape of a `ViewModelInstance`, and the lifecycle members — including the crucial `unmount()` vs `destroy()` distinction.

## `ViewModelDefinition` signature

```ts
class ViewModelDefinition<
  Shape    = Record<string, unknown>,
  Stores   extends Record<string, StoreMeta>      = ...,
  Events   extends Record<string, unknown>        = ...,
  Derived  extends Record<string, unknown>        = ...,
  Props    extends Record<string, AnyPropMeta>    = ...,
>
```

You never construct one by hand — it is always created through `createViewModel` or `ViewModelDefinition.extend`.

## `.instantiate`

```ts
instantiate(propUnits?: Record<string, unknown>): ViewModelInstance<Shape>
```

Low-level factory call. Creates a fresh effector region, runs contract unit creation inside it, then invokes `fn(stores, ctx)` (if any). Returns a `ViewModelInstance` — `{ shape, lifecycle, id }`.

```ts
const instance = searchVM.instantiate({ userId: 42, onSubmit })
instance.shape       // normalized via fn
instance.lifecycle   // ViewModelLifecycle
instance.id          // number, monotonically increasing
```

Prefer `.instantiate` when you also need access to the lifecycle (e.g. for framework adapters). For everyday use, `.create` is more ergonomic.

## `.create`

```ts
create(props?: CreateInput<Props>): Shape
```

Shortcut: calls `instantiate(props)` and returns `instance.shape`. Framework adapters use it internally; user code calls it directly when lifecycle is handled elsewhere.

```ts
const shape = searchVM.create({ userId: 42, onSubmit })
shape.$query          // Store<string>
```

### Props input

`CreateInput<Props>` accepts dual forms — a raw value or a matching effector unit:

| Prop kind | Accepts |
|---|---|
| `store` | `T` or `Store<T>` |
| `event` | `EventCallable<T>` or `(payload: T) => void` |

Tentacles normalises every shape into units through `.normalizeProps` before `fn` runs.

## `.normalizeProps`

```ts
normalizeProps(raw: Record<string, unknown> | undefined): Record<string, unknown>
```

Public for introspection and adapter use. Rules:

- **Store props**: if the value is a `Store<T>`, keep it; otherwise wrap in `createStore(value, { skipVoid: false })`. The key is exposed as `$<name>`.
- **Event props**: if the value is an event or effect, keep it; otherwise create a new event and `.watch(value)` to forward callback invocations. Key stays as raw name.

```ts
const normalized = searchVM.normalizeProps({
  userId: 42,              // wrapped in createStore(42)
  onSubmit: (v) => log(v), // wrapped in createEvent<string>().watch(fn)
})

normalized.$userId    // Store<number>
normalized.onSubmit   // EventCallable<string>
```

## `.extend`

```ts
extend<NewStores, NewEvents, NewDerived, NewProps, NewShape>(config: {
  name:     string
  contract?: ViewContractChain<NewStores, NewEvents, NewDerived>
  props?:    PropsContractChainImpl<NewProps>
  fn?:       (stores, ctx: { base: BaseShape }) => NewShape
}): ViewModelDefinition<NewShape, AllStores, AllEvents, AllDerived, AllProps>
```

Derive a new `ViewModelDefinition` from an existing one:

```ts
const baseVM = createViewModel({
  contract: searchContract,
  fn: ({ $query }) => ({ $query }),
})

const extendedVM = baseVM.extend({
  name: "extendedSearch",
  contract: extraContract, // adds more stores/events/derived
  fn: ({ $newField }, { base }) => ({
    ...base,
    $newField,
  }),
})
```

Rules:

- `contract` and `props` must be pre-built values (same validation as `createViewModel`).
- Field and prop **names must not collide** with the base. A collision throws `TentaclesError` synchronously.
- The extending `fn` receives only the new fields; `ctx.base` holds the shape produced by the base `fn`.

## `.getContract`

```ts
getContract(): Record<string, Record<string, unknown>>
```

Returns the raw contract field descriptors. Introspective — used by framework adapters to discover store/event keys without a live instance.

## `.getPropDescriptors`

```ts
getPropDescriptors(): Record<string, PropDescriptor>
```

Returns the prop descriptor map. Each descriptor is `{ kind: "store" | "event", optional: boolean }`. Used by adapters to decide how to normalise incoming props.

## `ViewModelInstance<Shape>`

```ts
interface ViewModelInstance<Shape> {
  readonly shape:     Shape
  readonly lifecycle: ViewModelLifecycle
  readonly id:        number
}
```

- `shape` — whatever `fn` returned, or the raw unit map when no `fn` was supplied.
- `lifecycle` — the `ViewModelLifecycle` bound to this instance's effector region.
- `id` — a monotonically increasing integer unique to each `ViewModelDefinition.instantiate()` call. Used in SID paths.

## `ViewModelLifecycle`

Attached to every instance. Wires into the effector region that holds the instance's units.

```ts
class ViewModelLifecycle {
  mounted:    EventCallable<void>  // lazy — created on first read
  unmounted:  EventCallable<void>  // lazy
  $mounted:   Store<boolean>        // lazy

  mount(scope?: Scope):   void | Promise<void>
  unmount(scope?: Scope): void | Promise<void>
  destroy(scope?: Scope): void | Promise<void>
}
```

### `.mounted`, `.unmounted`, `.$mounted`

These are the same units exposed through `ctx.mounted`, `ctx.unmounted`, and `ctx.$mounted` inside `fn`. Reading them from the lifecycle is useful when wiring outside the VM (e.g. in an adapter).

All three are lazy: a VM that never reads them pays zero effector cost.

### `.mount`

```ts
mount(scope?: Scope): void | Promise<void>
```

Fires `mounted`. With a scope, runs through `allSettled` and returns a promise. If `mounted` was never read (no subscribers), `mount` is a no-op.

### `.unmount` — StrictMode-safe

```ts
unmount(scope?: Scope): void | Promise<void>
```

Fires `unmounted` **without** clearing the effector region. This is the default for framework adapters because React Strict Mode mounts → unmounts → mounts again in development: a permanent teardown on the first cleanup would destroy stores the remounted component needs.

The region stays alive, subscriptions stay wired, and the next `mount()` reuses them.

### `.destroy` — permanent teardown

```ts
destroy(scope?: Scope): void | Promise<void>
```

Fires `unmounted` **and** calls `clearNode(region, { deep: true })`. Every store, event, sample, and watcher in the region is torn down permanently. Use this when you know the instance will never be mounted again — e.g. a dedicated cleanup hook outside the render cycle, or an imperative `destroy()` in long-lived integrations.

### Choosing between `unmount` and `destroy`

| Case | Call |
|---|---|
| React Strict Mode / normal component unmount | `unmount()` |
| Route change in a framework with VM caching | `unmount()` |
| Explicit "this VM is done forever" | `destroy()` |
| Test teardown | `destroy()` to avoid leaks |
| Imperative `vm = createViewModel(...).create(); later vm.lifecycle.destroy()` | `destroy()` |

If you call `destroy` on a VM that is still mounted in the UI, every bound store produces stale values and subscriptions stop updating. Only destroy when no component observes the VM any more.

## Example: imperative lifecycle

```ts
const instance = searchVM.instantiate({ userId: 42, onSubmit })
instance.lifecycle.mount()

// ... later
instance.lifecycle.unmount()  // StrictMode-safe

// End of program:
instance.lifecycle.destroy()  // permanent
```

## See also

- [`createViewModel`](./create-view-model.md) — the factory function.
- [`createViewContract`](./create-view-contract.md) — the `contract` input.
- [`createPropsContract`](./create-props-contract.md) — the `props` input.
