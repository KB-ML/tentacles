# `@kbml-tentacles/react`

React adapter for Tentacles. Wires `ViewModelDefinition` and `Model` from `@kbml-tentacles/core` into React's component lifecycle. The adapter is a thin layer: all reactivity lives in core, the adapter only mounts, syncs props, and reads instances out via context.

— *Reference · React adapter · v0.x*

## Install

```bash
yarn add @kbml-tentacles/react @kbml-tentacles/core effector effector-react
```

## Peer dependencies

| Package | Range |
|---|---|
| `effector` | `^23.0.0` |
| `effector-react` | `^23.0.0` |
| `@kbml-tentacles/core` | `workspace:*` |
| `react` | `>=18.0.0` |

React 18 is required because the adapter relies on `useSyncExternalStore` semantics inside `effector-react` and on the StrictMode double-invoke contract for `useEffect` cleanup.

## Exports

| Symbol | Kind | Purpose |
|---|---|---|
| [`View`](/reference/react/view) | component | **Primary way to mount a view-model.** Scopes its shape to the subtree through context. |
| [`Each`](/reference/react/each) | component | Render a list of model instances by `source`, `id`, `from`, or reactive id. |
| [`useModel`](/reference/react/use-model) | hook | Read a view-model shape from `<View>`, an `<Each>` instance, or look up a model by id. |
| [`useView`](/reference/react/use-view) | hook | Single-component alternative to `<View>` for owners with no descendants. |
| `ScopeStackContext` | context | Internal scope stack used by `<Each>`/`useModel`. Exposed for advanced lookups. |

## Types

| Type | Description |
|---|---|
| `ViewProps<Shape>` | Props of `<View>`: `{ model, props?, children? }`. |
| `EachProps<Instance>` | Props of `<Each>`: `{ model, source?, id?, from?, fallback?, children? }`. |
| `ModelLike<Instance>` | Structural subset of `Model`: `{ name, $ids, $idSet, has, get(id \| [parts], scope?), getRefMeta(field) }`. Accepted everywhere a model is required. |

## Lifecycle contract

The adapter calls into `lifecycle` exposed by core view-models. The mapping is:

| React | Core |
|---|---|
| First render of `<View>` or `useView` | `definition.create(props)` (memoised on `[definition]`) |
| Mount (`useEffect`) | `lifecycle.mount()` |
| Unmount cleanup of `<View>` | `lifecycle.unmount()` (StrictMode-safe; region survives) |
| Unmount cleanup of `useView` | `lifecycle.destroy()` |

`<View>` and `useView` differ only in cleanup. Prefer `<View>` — it survives StrictMode's simulated unmount and makes the shape available to descendants. Reach for `useView` only when a component owns the instance and has no descendants that need `useModel`.

## Prop normalisation

The adapter forwards `rawProps` to `definition.applyProps(props)` after normalising every entry:

| Prop kind | Plain value | Reactive value |
|---|---|---|
| Store prop | wrapped in a writable store synced on every render | passed through if value is `Store<T>` |
| Event prop | wrapped in an effector event whose handler calls the latest callback (via `useRef`) | passed through if value is `EventCallable<T>` |

Callbacks are tracked with `useRef`, so re-rendering with a new function does not rebind the underlying event — the latest closure is always invoked.

## Reading effector stores

The adapter does not re-export `useUnit`. Import it directly from `effector-react`:

```tsx
import { useUnit } from "effector-react";
import { useModel } from "@kbml-tentacles/react";

const vm = useModel(counterViewModel);       // reads nearest <View>
const [count, increment] = useUnit([vm.$count, vm.increment]);
```

Store values update via `useSyncExternalStore` under the hood; effector-react handles scope detection automatically when the tree is inside a `<Provider value={scope}>` (SSR / fork isolation).

## SSR

`<View>` and `<Each>` are safe to render under `<Provider>`. SIDs are generated via core's `SidRegistry`; the hydration phase re-uses the same instances because view-model `create` is keyed by `[definition]` and scope lookups hit cached shapes.

The lifecycle contract is unchanged on the server: `definition.create` runs during render; `lifecycle.mount` does not fire (there is no `useEffect` on the server); `lifecycle.destroy` runs when the request scope is disposed.

## See also

- [Tutorials → React quick start](/tutorials/)
- [How-to → React patterns](/how-to/)
- [Explanation → adapter design](/explanation/)
