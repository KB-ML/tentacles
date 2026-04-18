# A React todo app

In this tutorial you will wire a Tentacles model to a React UI. You will build a small todo list that supports adding items, toggling completion, and filtering by status — everything reactive, everything SSR-safe. This tutorial assumes you have done [Your first model](/tutorials/your-first-model) or at least skimmed it.

## What you will learn

- How to define a **view model** for ephemeral UI state (search box, filter, page)
- How to mount it with `<View>` (primary) or `useView` (single-component alternative)
- How to render collection data with `<Each>`
- How to read instance fields with `useModel` inside `<Each>`
- How framework props become effector units under the hood

## 1. Set up a React project

Spin up a fresh Vite + React app:

```sh
npm create vite@latest todo-app -- --template react-ts
cd todo-app
npm install
npm install effector effector-react @kbml-tentacles/core @kbml-tentacles/react
```

`effector-react` is a peer dependency of `@kbml-tentacles/react` — the adapter uses its `useUnit` hook internally.

## 2. Define the data model

Create `src/todo.ts`:

```ts
import { createContract, createModel } from "@kbml-tentacles/core"

const todoContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("title", (s) => s<string>())
  .store("done", (s) => s<boolean>().default(false))
  .event("toggle", (e) => e<void>())
  .event("rename", (e) => e<string>())
  .pk("id")

export const todoModel = createModel({
  contract: todoContract,
  fn: ({ $done, toggle, $title, rename }) => {
    $done.on(toggle, (d) => !d)
    $title.on(rename, (_, next) => next)
    return {}
  },
})
```

A few things you have not seen before:

- **`.autoincrement()`** — the PK field fills itself. You do not need to pass `id` to `todoModel.create(...)`.
- **`e<void>()`** — event payload type. For a toggle, no payload is needed, so `void`.
- Two events are wired in one `fn` — each `.on()` is a shared model-level handler.

## 3. Define a view model for the UI state

A **view model** is the reactive shape a component cares about — search text, current filter, pagination. It is ephemeral: it disappears when the component unmounts.

Create `src/todo-view.ts`:

```ts
import {
  createModel,
  createPropsContract,
  createViewContract,
  createViewModel,
  eq,
} from "@kbml-tentacles/core"
import { sample } from "effector"
import { todoModel } from "./todo"

const todoViewContract = createViewContract()
  .store("filter", (s) => s<"all" | "active" | "done">().default("all"))
  .store("draftTitle", (s) => s<string>().default(""))

const todoViewProps = createPropsContract()

export const todoViewModel = createViewModel({
  contract: todoViewContract,
  props: todoViewProps,
  fn: ({ $filter, $draftTitle }) => {
    const activeQuery = todoModel.query().where("done", eq(false))
    const doneQuery = todoModel.query().where("done", eq(true))

    return {
      $filter,
      $draftTitle,
      $count: todoModel.$count,
      $activeCount: activeQuery.$count,
      $doneCount: doneQuery.$count,
    }
  },
})
```

Three things to notice:

- **`createViewContract()`** — returns a `ViewContractChain`. It supports `.store()`, `.event()`, and `.derived()` but **not** refs or `pk` (view models have no identity or persistence).
- **`fn` return value** — whatever you return from `fn` becomes the public `Shape` of the view model. Destructure stores you want to expose, add derived values, add callbacks.
- **No custom setter events needed** — every store field auto-exposes `.set` as an `EventCallable<T>`. Call `$draftTitle.set(value)` or use it as a `sample` target. No need to declare `.event("setDraft")` and wire a reducer.

## 4. Build the input component

Create `src/NewTodo.tsx`:

```tsx
import { useUnit } from "effector-react"
import { useModel } from "@kbml-tentacles/react"
import { todoModel } from "./todo"
import { todoViewModel } from "./todo-view"

export function NewTodo() {
  const vm = useModel(todoViewModel)
  const title = useUnit(vm.$draftTitle)

  const handleAdd = () => {
    if (!title.trim()) return
    todoModel.create({ title })
    vm.$draftTitle.set("")
  }

  return (
    <div>
      <input
        value={title}
        onChange={(e) => vm.$draftTitle.set(e.target.value)}
        placeholder="What needs doing?"
      />
      <button onClick={handleAdd}>Add</button>
    </div>
  )
}
```

The draft lives on the view model — no `useState`. Two things to note:

- **`vm.$draftTitle.set(value)`** — every view-model store field exposes `.set` as an `EventCallable<T>`. You can call it directly or use it as a `sample` target.
- **`useUnit(vm.$draftTitle)`** — reads the current value reactively, just like any effector store.

## 5. Build the list component

Create `src/TodoList.tsx`:

```tsx
import { useUnit } from "effector-react"
import { Each, useModel } from "@kbml-tentacles/react"
import { todoModel } from "./todo"

function TodoItem() {
  const todo = useModel(todoModel)              // pick up from <Each> context
  const title = useUnit(todo.$title)
  const done  = useUnit(todo.$done)

  return (
    <li style={{ textDecoration: done ? "line-through" : "none" }}>
      <input type="checkbox" checked={done} onChange={todo.toggle} />
      {title}
    </li>
  )
}

export function TodoList() {
  return (
    <ul>
      <Each model={todoModel} source={todoModel.$ids} fallback={<p>No todos.</p>}>
        <TodoItem />
      </Each>
    </ul>
  )
}
```

Walk through what happens:

1. **`<Each model={todoModel} source={todoModel.$ids}>`** renders one child per ID in the store. When `todoModel.$ids` updates, React re-renders only what changed — each item is wrapped in `memo`.
2. Inside `<Each>`, a **React context** is set per item. `useModel(todoModel)` reads that context and returns the current instance — no prop drilling, no manual lookup.
3. **`useUnit(todo.$title)`** — standard `effector-react` hook. Tentacles proxy fields are drop-in compatible wherever effector stores are expected, because they materialize into real stores the first time you subscribe.

## 6. Wire up the view model

Update `src/App.tsx`:

```tsx
import { useUnit } from "effector-react"
import { View, useModel } from "@kbml-tentacles/react"
import { NewTodo } from "./NewTodo"
import { TodoList } from "./TodoList"
import { todoViewModel } from "./todo-view"

function Counts() {
  const vm = useModel(todoViewModel)
  const active = useUnit(vm.$activeCount)
  const done   = useUnit(vm.$doneCount)
  return <p>Active: {active} · Done: {done}</p>
}

export default function App() {
  return (
    <View model={todoViewModel}>
      <h1>Todos</h1>
      <NewTodo />
      <Counts />
      <TodoList />
    </View>
  )
}
```

`<View model={todoViewModel}>` instantiates the view model once and provides its shape to descendants via context. `useModel(todoViewModel)` reads from that context.

`<View>` is the primary pattern — it lets multiple descendants (`Counts`, filter UI, etc.) pull the shape with `useModel`, and it is StrictMode-safe because it uses `lifecycle.unmount()` (which preserves the effector region) rather than `lifecycle.destroy()`. Reach for `useView(todoViewModel)` only when a single component owns the instance and has no descendants that need `useModel`.

## 7. Pass props to a view model

Let's make the filter switchable. Update the view contract to take a `filter` **as a prop** rather than internal state, so the parent controls it:

```ts
// src/todo-view.ts
const todoViewProps = createPropsContract()
  .store("filter", (s) => s<"all" | "active" | "done">())
  .event("onClear", (e) => e<void>())
```

Update the `fn` signature — store props arrive on `ctx.props` with a `$` prefix, event props keep their raw name:

```ts
export const todoViewModel = createViewModel({
  contract: todoViewContract,
  props: todoViewProps,
  fn: ({ $draftTitle }, ctx) => {
    const filter = ctx.props.$filter as Store<"all" | "active" | "done">
    const onClear = ctx.props.onClear as EventCallable<void>

    // rest of fn…
  },
})
```

Now in `App.tsx`, pass the prop:

```tsx
<View
  model={todoViewModel}
  props={{
    filter: "all",
    onClear: () => console.log("cleared"),
  }}
>
  …
</View>
```

**What happens to the raw values?** The React adapter wraps `filter: "all"` into a `StoreWritable<"all">` internally (you can pass a `Store<"all" | ...>` directly instead). It wraps the `onClear` callback into an `EventCallable<void>` — when the view model fires the event, your callback is called via a ref-synced watcher, so even if you pass a fresh function every render, the latest callback is invoked.

## 8. Clean up with lifecycle events

Let's log when the view mounts. The ctx object passed to `fn` has `mounted`, `unmounted`, and `$mounted`:

```ts
fn: ({ $filter }, { mounted }) => {
  mounted.watch(() => console.log("todoViewModel mounted"))
  return { $filter }
},
```

The `mounted` event fires once per `<View>` mount (after `useEffect` runs). The `unmounted` event fires on cleanup — use it for cancellation or effectful teardown.

Bonus: `$mounted` is a `Store<boolean>`, handy if you want a store-based gate (`sample({ clock: someEvent, filter: $mounted, target: loadFx })`).

## 9. What you have built

```
todo-app/
└── src/
    ├── todo.ts          Model + contract + events
    ├── todo-view.ts     View model (UI state + aggregates)
    ├── NewTodo.tsx      Input + create
    ├── TodoList.tsx     <Each> + useModel for per-item access
    └── App.tsx          <View> scaffold
```

You used:

- **`<View>`** — scopes a view model to a subtree, provides shape via context.
- **`useModel(todoViewModel)`** — reads view shape from nearest `<View>`.
- **`<Each>`** — renders a reactive list of model instances.
- **`useModel(todoModel)`** — inside `<Each>`, returns the current instance.
- **`useUnit`** — from `effector-react`, for raw store/event subscriptions.
- **`createViewContract` / `createPropsContract`** — declare internal UI state vs external props.

## Where to go next

| If you want to… | Read |
|---|---|
| Do the same in Vue or Solid | [Vue tutorial](/tutorials/vue-todo-app), [Solid tutorial](/tutorials/solid-todo-app) |
| Nest models with refs (todo ↔ category) | [How-to: Relate models with refs](/how-to/relate-models-with-refs) |
| Drive a filter reactively | [How-to: Query a collection](/how-to/query-a-collection) |
| Ship to production with SSR | [How-to: Enable SSR](/how-to/enable-ssr) |
| Understand `<Each>` and context | [Reference: Each](/reference/react/each) |
