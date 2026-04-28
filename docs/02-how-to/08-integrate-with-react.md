---
description: "Integrate Tentacles with React using the adapter hooks and provider components."
---

# Integrate with React

Wire a Tentacles model or view model into a React app with `@kbml-tentacles/react`. The adapter is a thin layer: it turns raw React values into effector units, handles lifecycle, and makes instances available through context.

This guide assumes you already have a model — something like:

```ts
import { createContract, createModel } from "@kbml-tentacles/core"

const todoContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("title", (s) => s<string>())
  .store("done", (s) => s<boolean>().default(false))
  .event("toggle", (e) => e<void>())
  .pk("id")

export const todoModel = createModel({
  contract: todoContract,
  fn: ({ $done, toggle }) => {
    $done.on(toggle, (d) => !d)
    return {}
  },
})
```

## 1. Install

`@kbml-tentacles/react` declares three peer dependencies:

```sh
npm install effector effector-react @kbml-tentacles/core @kbml-tentacles/react
```

| Package | Role |
|---|---|
| `effector` | Reactive core — stores, events, scopes |
| `effector-react` | Provides the `useUnit` hook used internally |
| `@kbml-tentacles/core` | Contract and model builders |
| `@kbml-tentacles/react` | `useView`, `<View>`, `<Each>`, `useModel` |

React 16.8 or newer is supported.

## 2. Using `<View>` (primary pattern)

`<View model={def} props={...}>` is the main way to mount a view model. It creates one instance per mount, provides its `Shape` to every descendant through React context, and survives Strict Mode's simulated double-unmount cleanly.

```tsx
import { View, useModel } from "@kbml-tentacles/react"
import { todoViewModel } from "./todo-view"

export function TodoPage() {
  return (
    <View model={todoViewModel} props={{ filter: "all" }}>
      <TodoHeader />
      <TodoList />
      <TodoFooter />
    </View>
  )
}

function TodoHeader() {
  const vm = useModel(todoViewModel)  // pulled from <View> context
  const [count, active] = useUnit([vm.$count, vm.$activeCount])

  return (
    <header>
      <h1>Todos ({active}/{count})</h1>
    </header>
  )
}
```

The instance is provided through a React context keyed by the definition object, so different view models can be nested freely without collision. Children call `useModel(todoViewModel)` to pull the shape — the same hook works at any depth.

You can nest `<View>`s to compose multiple view models in one subtree (e.g. a list VM plus a modal VM sharing the same page).

## 3. Using `useView(def)` (single-component form)

When exactly one component needs the view model and nothing below it does, `useView(definition, rawProps?)` is a shorter alternative. It creates the instance, syncs props on every render, and fires the mount/destroy lifecycle around the effect boundary.

```tsx
import { useUnit } from "effector-react"
import { useView } from "@kbml-tentacles/react"
import { todoViewModel } from "./todo-view"

export function TodoHeader() {
  const vm = useView(todoViewModel)
  const [count, active] = useUnit([vm.$count, vm.$activeCount])

  return <header><h1>Todos ({active}/{count})</h1></header>
}
```

`rawProps` is a plain object, not a getter:

```tsx
useView(todoViewModel, {
  filter: currentFilter,      // store prop — can be T or Store<T>
  onClear: () => clearAll(),  // event prop — raw callback or EventCallable
})
```

### Lifecycle and StrictMode

`<View>` and `useView` differ only in cleanup semantics:

| Form | Fires on unmount |
|---|---|
| `<View>` | `lifecycle.unmount()` — the effector region is **kept alive** |
| `useView` | `lifecycle.destroy()` — region cleared, effects stopped |

`<View>` chooses `unmount()` so that React Strict Mode's intentional double mount/unmount in development does not tear down and rebuild the instance's region. `mount()` is idempotent, so the second mount just re-fires the mount event. If you truly want to free the region, unmount the component tree.

`useView` uses `destroy()` because there is no subtree to keep warm — there is nothing downstream that could be affected by a simulated unmount. Prefer `<View>` unless you specifically want destroy-on-unmount semantics.

## 4. Passing props

Both `useView` and `<View>` accept a props bag matching the view model's props contract. Each declared prop is one of two kinds, and the adapter normalizes both forms:

### Store props

A store prop can be passed as a raw value or as a `Store<T>`:

```tsx
<View model={todoViewModel} props={{ filter: "all" }} />
```

or (driven by a parent view model's store):

```tsx
const { $filter } = useModel(AppView)

<View model={todoViewModel} props={{ filter: $filter }} />
```

Internally the adapter always materializes a `StoreWritable<T>` for the prop. When you pass a raw value, it fires a setter every render (through `useLayoutEffect`, so synchronously before paint). When you pass a store, it still fires the setter — the adapter treats the store as a read source, not a binding.

### Event props

Event props accept a plain callback or an `EventCallable<T>`:

```tsx
<View
  model={todoViewModel}
  props={{
    onClear: () => console.log("cleared"),
  }}
/>
```

Under the hood the adapter creates an `EventCallable<T>` and attaches a `.watch` that dispatches to whichever callback is currently stored in a stable ref. That means:

- You can pass an inline arrow every render — no remount, no broken reference.
- The latest callback always wins. There is no stale-closure trap.
- Passing an `EventCallable<T>` directly is fine — it runs through the same dispatch.

### Re-sync semantics

Props sync through `useLayoutEffect`, which runs synchronously after every render and before paint. That means prop changes are visible to effector the same frame React schedules a new render, so your view model's subscribers see updated values without an extra tick.

## 5. Rendering lists with `<Each>`

`<Each>` renders a collection of model instances. It has four modes, dispatched by which prop you pass:

### `source={Store<ID[]>}`

Iterate a reactive ID list.

```tsx
import { Each } from "@kbml-tentacles/react"
import { todoModel } from "./todo"

<Each model={todoModel} source={todoModel.$ids} fallback={<p>No todos yet</p>}>
  {(todo) => <TodoRow key={todo.$id.getState()} todo={todo} />}
</Each>
```

Each rendered item is wrapped in a memo boundary (`EachItem` internally), keyed by stringified ID. Sibling updates do not re-render untouched rows.

### `id={ID}` (static)

Scope a single instance into children context, by a literal ID value.

```tsx
<Each model={todoModel} id={42}>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

Under the hood this subscribes to `todoModel.$idSet` for membership and calls `todoModel.get(42)` for the stable proxy.

### `id={Store<ID | null>}` (reactive)

Same as static ID, but the ID itself is a store — useful when the "currently selected" ID lives in a store or view model.

```tsx
<Each model={todoModel} id={vm.$selectedId}>
  {(todo) => <TodoEditor todo={todo} />}
</Each>
```

When the store value becomes `null`, the subtree renders nothing.

### `from="refName"` (ref resolution)

Resolve a ref from the nearest `<Each>` ancestor.

```tsx
<Each model={userModel} source={userModel.$ids}>
  <section>
    <h2>Posts:</h2>
    <Each model={postModel} from="posts">
      {(post) => <PostRow post={post} />}
    </Each>
  </section>
</Each>
```

`from="posts"` walks the scope stack of surrounding `<Each>` entries, finds one whose model declares a ref named `posts` pointing at `postModel`, and uses that ref's `$ids` (for `many`) or `$id` (for `one`) as the iteration source. Cardinality is inferred from the ref descriptor — no prop needed.

## 6. Fallback slot and `from` mode

`fallback` renders when the resolved collection is empty. It works for `source` and `from` (many cardinality):

```tsx
<Each
  model={todoModel}
  source={todoModel.query().where("done", eq(true)).$ids}
  fallback={<p>Nothing done yet.</p>}
>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

For `id` and single-cardinality `from`, there is no fallback — the children subtree simply does not render when the ID resolves to `null`.

## 7. `useModel(model)` inside `<Each>`

Inside an `<Each>` subtree you can grab the current instance without threading it through props:

```tsx
import { useModel } from "@kbml-tentacles/react"
import { todoModel } from "./todo"

function TodoRow() {
  const todo = useModel(todoModel)  // reads <Each> context

  return (
    <li>
      <input
        type="checkbox"
        checked={todo.$done.getState()}
        onChange={() => todo.toggle()}
      />
      {todo.$title.getState()}
    </li>
  )
}
```

This overload **throws** if there is no matching `<Each>` ancestor — it is meant for components that can only exist inside one. For optional reads, use the ID overload described below.

To read store values reactively, pair with `useUnit`:

```tsx
const todo = useModel(todoModel)
const [title, done] = useUnit([todo.$title, todo.$done])
```

## 8. `useModel(model, id)` outside context

Three argument shapes let you look up instances without `<Each>`:

### Static ID

```tsx
const todo = useModel(todoModel, 42)
if (!todo) return <p>Not found</p>
```

Returns `Instance | null`. Subscribes to `todoModel.$idSet` for membership and returns `todoModel.get(42)` for the proxy.

### Compound key

Pass multiple key parts for models with compound PKs:

```tsx
const membership = useModel(Membership, userId, tenantId)
```

### Reactive ID

Pass a `Store<ID | null>` to follow a moving target:

```tsx
const $currentId = createStore<number | null>(null)
const todo = useModel(todoModel, $currentId)
```

When the store value is `null`, `todo` is `null`. When it becomes a valid ID, `todo` resolves to the instance (or stays `null` if the ID is unknown).

## 9. Troubleshooting

### `useModel(todoModel): no <Each> ancestor found`

The zero-argument model overload (`useModel(todoModel)`) only works inside `<Each model={todoModel}>`. If you need an instance outside such a subtree, pass the ID explicitly (`useModel(todoModel, id)`).

### `useModel(ViewModelDefinition): no <View> ancestor found`

The definition overload of `useModel` reads from `<View>` context. Wrap the subtree in `<View model={todoViewModel}>` — the primary pattern — or, if this is a single-component owner with no descendants, fall back to `useView(todoViewModel)`.

### Items re-render on sibling updates

`EachItem` is wrapped in `React.memo`. If all rows re-render when one todo changes, check that you are reading store values with `useUnit` inside the row — not with `.getState()` at the parent level. `.getState()` snapshots are not reactive, so the parent would have to re-render the whole list to observe changes.

### SSR: state not hydrating

`@kbml-tentacles/react` does not scope anything itself — it reads stores and events through `useUnit`, which respects the effector scope supplied by `effector-react`'s `Provider`. Wrap your tree with effector-react's `<Provider value={scope}>` for SSR and hydration to work. The adapter does not need its own provider.

### React Strict Mode destroys the view model twice

It does not — `<View>` uses `lifecycle.unmount()`, not `destroy()`, specifically to survive Strict Mode's simulated unmount. Your `mount()` callback will run twice in development, but the instance's region is preserved. Idempotent mount handlers are recommended regardless.
