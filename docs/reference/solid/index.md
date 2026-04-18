# `@kbml-tentacles/solid`

SolidJS adapter for Tentacles. Wires `ViewModelDefinition` and `Model` from `@kbml-tentacles/core` into Solid's reactive primitives. Props are supplied as getter functions (consistent with Solid's tracking model); component lifecycle maps onto `onMount`/`onCleanup`. Effector stores are bridged via `useUnit` from `effector-solid`, which returns an `Accessor<T>` — called like a function inside JSX.

— *Reference · Solid adapter · v0.x*

## Install

```bash
yarn add @kbml-tentacles/solid @kbml-tentacles/core effector effector-solid
```

## Peer dependencies

| Package | Range |
|---|---|
| `effector` | `^23.0.0` |
| `effector-solid` | `^0.22.0` |
| `@kbml-tentacles/core` | `workspace:*` |
| `solid-js` | `>=1.8.0` |

Solid 1.8+ is required for stable `createContext` typings and the `createEffect` scheduling guarantees used by the prop-sync watcher.

## Exports

| Symbol | Kind | Purpose |
|---|---|---|
| [`View`](/reference/solid/view) | component | **Primary way to mount a view-model.** Provides its shape via Solid context keyed by the definition. |
| [`Each`](/reference/solid/each) | component | Render a list of instances, wrapping Solid's `<For>` and `<Show>`. |
| [`useModel`](/reference/solid/use-model) | primitive | Read a view-model shape from `<View>`, an `<Each>` instance, or look up a model by id. |
| [`useView`](/reference/solid/use-view) | primitive | Single-component alternative to `<View>` for owners with no descendants. |
| `ScopeStackContext` | context | Solid context holding the scope stack. Advanced use. |

## Types

| Type | Description |
|---|---|
| `ViewProps<Shape>` | Props of `<View>`: `{ model, props?, children? }`. |
| `EachProps<Instance>` | Props of `<Each>`: `{ model, source?, id?, from?, fallback?, children? }`. |
| `ModelLike<Instance>` | Structural subset of `Model`: `{ name, instance(idOrKey) → Store<Instance \| null> }`. |

## Lifecycle contract

| Solid | Core |
|---|---|
| First render of `<View>` or `useView` body | `definition.create(rawProps?.())` |
| `createEffect(() => rawProps?.())` | `definition.applyProps(props)` |
| `onMount` | `lifecycle.mount()` |
| `onCleanup` | `lifecycle.destroy()` |

Both `<View>` and `useView` call `destroy` on cleanup. Solid's component lifecycle is single-run; there is no double-invoke cycle to worry about. Prefer `<View>` — it provides the shape to descendants via Solid context so children can pull it with `useModel`. Reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

## Getter-form props

`useView` and `<View>` accept `rawProps` as a **getter function**:

```ts
useView(myVM, () => ({ query: query(), onClear: handleClear }));
```

The getter body is tracked by `createEffect`; any accessor or signal read inside it drives re-application. Plain non-reactive objects are allowed but update only when the getter itself returns a new object reference.

## `Accessor<T>` bridge

Effector stores are consumed with `useUnit` from `effector-solid`, which returns an `Accessor<T>`:

```tsx
import { useUnit } from "effector-solid";

const vm = useView(counterVM);
const count = useUnit(vm.$count); // Accessor<number>

return <div>{count()}</div>; // called as a function in JSX
```

The adapter exposes units directly on the shape; bridging to signals is the caller's responsibility.

## Reading effector stores

The adapter does not re-export `useUnit`. Import it from `effector-solid`:

```tsx
import { useUnit } from "effector-solid";

const vm = useView(counterVM);
const count = useUnit(vm.$count);     // Accessor<number>
const increment = useUnit(vm.increment); // function
```

Accessors are called inside JSX (`{count()}`) or in any tracking scope. Multi-read: `const [a, b] = useUnit([vm.$a, vm.$b])` returns tuple of accessors.

## SSR

SolidJS SSR (`renderToString`, `renderToStream`) is supported. `definition.create` runs during the render pass; `onMount` does not fire server-side; `onCleanup` fires when the request scope is disposed. SIDs from core's `SidRegistry` allow hydration to re-use instances materialised on the server.

The adapter is safe to render under effector's `fork(scope)` + `serialize(scope)` boundaries.

## See also

- [Tutorials → Solid quick start](/tutorials/)
- [How-to → Solid patterns](/how-to/)
- [Explanation → adapter design](/explanation/)
