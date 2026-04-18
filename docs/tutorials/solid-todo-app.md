# A Solid todo app

In this tutorial you will wire a Tentacles model to SolidJS. The model layer is the same as in the React and Vue tutorials — only the UI wiring changes. You will see how Solid's accessor-based reactivity integrates with Tentacles.

## What you will learn

- How to mount a view model with `<View>` and read it in descendants with `useModel`
- How `<Each>` wraps Solid's `<For>` for per-instance context
- How `useModel(todoModel)` returns a plain value (not an accessor) inside `<Each>`
- How Solid's fine-grained reactivity interoperates with effector stores via `effector-solid`

## 1. Set up a Solid project

```sh
npm create vite@latest todo-app -- --template solid-ts
cd todo-app
npm install
npm install effector effector-solid @kbml-tentacles/core @kbml-tentacles/solid
```

`effector-solid` is the peer dep — `useUnit` there returns an `Accessor<T>`.

## 2. Define the data model

`src/todo.ts`:

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

## 3. Define the view model

`src/todo-view.ts`:

```ts
import {
  createPropsContract,
  createViewContract,
  createViewModel,
  eq,
} from "@kbml-tentacles/core"
import type { EventCallable, Store } from "effector"
import { todoModel } from "./todo"

const todoViewContract = createViewContract()
  .store("draftTitle", (s) => s<string>().default(""))

const todoViewProps = createPropsContract()
  .store("filter", (s) => s<"all" | "active" | "done">())
  .event("onClear", (e) => e<void>())

export const todoViewModel = createViewModel({
  contract: todoViewContract,
  props: todoViewProps,
  fn: ({ $draftTitle }, ctx) => {
    const $filter = ctx.props.$filter as Store<"all" | "active" | "done">
    const onClear = ctx.props.onClear as EventCallable<void>

    const activeQuery = todoModel.query().where("done", eq(false))
    const doneQuery = todoModel.query().where("done", eq(true))

    return {
      $filter,
      $draftTitle,
      $activeCount: activeQuery.$count,
      $doneCount: doneQuery.$count,
      onClear,
    }
  },
})
```

## 4. Build the input component

`src/NewTodo.tsx`:

```tsx
import { createSignal } from "solid-js"
import { todoModel } from "./todo"

export function NewTodo() {
  const [title, setTitle] = createSignal("")

  const handleAdd = () => {
    if (!title().trim()) return
    todoModel.create({ title: title() })
    setTitle("")
  }

  return (
    <div>
      <input
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder="What needs doing?"
      />
      <button onClick={handleAdd}>Add</button>
    </div>
  )
}
```

Nothing Tentacles-specific here — just a Solid signal + `todoModel.create()`.

## 5. Build the list component

`src/TodoList.tsx`:

```tsx
import { useUnit } from "effector-solid"
import { Each, useModel } from "@kbml-tentacles/solid"
import { todoModel } from "./todo"

function TodoItem() {
  const todo = useModel(todoModel)          // plain instance from context
  const title = useUnit(todo.$title)    // Accessor<string>
  const done  = useUnit(todo.$done)     // Accessor<boolean>

  return (
    <li style={{ "text-decoration": done() ? "line-through" : "none" }}>
      <input type="checkbox" checked={done()} onChange={() => todo.toggle()} />
      {title()}
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

A few Solid-specific things to notice:

- **`useUnit(todo.$title)` returns an `Accessor<string>`**, not a `Ref`. You call it like a function (`title()`) in JSX.
- **`useModel(todoModel)` returns the raw instance**, not an `Accessor<Instance>`. Why? Because `<Each>` only renders children while the instance exists (wrapped in `<Show>`), so inside the child the instance is guaranteed to exist. Subfields are still accessors — they update fine-grained.
- **`<Each>` wraps Solid's `<For>`** — list reconciliation uses Solid's keyed behavior.

## 6. Alternative: render function form

`<Each>` also accepts a render function if you prefer passing the instance as an argument:

```tsx
<Each model={todoModel} source={todoModel.$ids}>
  {(todo) => <TodoItem todo={todo} />}
</Each>
```

The instance here is a plain object (not an accessor), and `useModel(todoModel)` still works inside. Use whichever style reads better for you.

## 7. Mount the view model with `<View>` in `App.tsx`

`<View>` is the primary way to mount a view model in Solid. It provides the shape through a Solid context keyed by the definition; descendants pull it back with `useModel`.

```tsx
import { createSignal } from "solid-js"
import { useUnit } from "effector-solid"
import { View, useModel } from "@kbml-tentacles/solid"
import { NewTodo } from "./NewTodo"
import { TodoList } from "./TodoList"
import { todoViewModel } from "./todo-view"

function Counts() {
  const vm = useModel(todoViewModel)            // reads nearest <View>
  const active = useUnit(vm.$activeCount)
  const done   = useUnit(vm.$doneCount)
  return <p>Active: {active()} · Done: {done()}</p>
}

export default function App() {
  const [filter, setFilter] = createSignal<"all" | "active" | "done">("all")

  return (
    <View
      model={todoViewModel}
      props={() => ({
        filter: filter(),
        onClear: () => console.log("cleared"),
      })}
    >
      <h1>Todos</h1>
      <NewTodo />

      <label>
        Filter:
        <select
          value={filter()}
          onChange={(e) =>
            setFilter(e.currentTarget.value as "all" | "active" | "done")
          }
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="done">Done</option>
        </select>
      </label>

      <Counts />
      <TodoList />
    </View>
  )
}
```

Solid-specific wiring notes:

- **`props` is a getter function** — `() => ({ filter: filter(), … })` lets the adapter track the `filter` signal inside a `createEffect` and re-apply when it changes. Passing a plain object snapshots values once.
- **Inline callbacks are safe** — event props wire the latest callback through a ref, so inline arrows do not need memoisation.

### Alternative: `useView` for single-component owners

If one component owns the view model and nothing below it reads from context, `useView` is a shorter form:

```tsx
import { useView } from "@kbml-tentacles/solid"

const vm = useView(todoViewModel, () => ({
  filter: filter(),
  onClear: () => console.log("cleared"),
}))
```

Prefer `<View>` — descendants can pull the shape with `useModel` without prop-drilling. Reach for `useView` only when a single component owns the instance and has no descendants that need to read it.

## 8. Composing view models in another VM's `fn`

A less common but useful pattern: a parent VM instantiates a child VM inside its own `fn`. The child's region is nested under the parent, so destroying the parent automatically destroys the child.

```ts
// ChildView is a ViewModelDefinition
const parentView = createViewModel({
  contract: parentContract,
  fn: ({ $something }) => {
    const child = ChildView.create()  // uses ambient region
    return { $something, child }
  },
})
```

No framework adapter needed — `.create()` detects the active region and nests automatically.

## 9. What you have built

```
todo-app/
└── src/
    ├── todo.ts          Model
    ├── todo-view.ts     View model
    ├── NewTodo.tsx      Local input with signal
    ├── TodoList.tsx     <Each> with child component
    └── App.tsx          <View> + filter signal
```

Solid-specific takeaways:

- **Accessors everywhere** — `useUnit` returns `Accessor<T>`, not a plain value; call like a function in JSX.
- **`useModel(todoModel)` returns a raw instance** inside `<Each>` — the parent gates rendering on existence, so you never get a null instance in a child component.
- **`<Each>` reconciles via `<For>`** — standard Solid keyed list diffing.

## Where to go next

| If you want to… | Read |
|---|---|
| Compare with other frameworks | [React tutorial](/tutorials/react-todo-app), [Vue tutorial](/tutorials/vue-todo-app) |
| Drive a filter reactively via store | [How-to: Query a collection](/how-to/query-a-collection) |
| See the full adapter surface | [Reference: useView (Solid)](/reference/solid/use-view), [useModel](/reference/solid/use-model) |
| Resolve nested refs into child `<Each>` | [How-to: Relate models with refs](/how-to/relate-models-with-refs) |
