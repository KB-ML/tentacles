# Integrate with Solid

Wire a Tentacles model or view model into a SolidJS app with `@kbml-tentacles/solid`. The adapter leans on `effector-solid` — every reactive read returns an `Accessor<T>`, which is a function you call to get the current value.

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

`@kbml-tentacles/solid` declares three peer dependencies:

```sh
npm install effector effector-solid @kbml-tentacles/core @kbml-tentacles/solid
```

| Package | Role |
|---|---|
| `effector` | Reactive core |
| `effector-solid` | Provides `useUnit` returning `Accessor<T>` |
| `@kbml-tentacles/core` | Contract and model builders |
| `@kbml-tentacles/solid` | `useView`, `<View>`, `<Each>`, `useModel` |

Solid 1.3 or newer is supported.

## 2. Using `<View>` (primary pattern)

`<View>` is the main way to mount a view model. It stores the shape in a Solid context keyed by the definition, so every descendant can read it back with `useModel`.

```tsx
import { View, useModel } from "@kbml-tentacles/solid"
import { useUnit } from "effector-solid"
import { todoViewModel } from "./todo-view"

export function TodoPage() {
  return (
    <View model={todoViewModel} props={() => ({ filter: "all" })}>
      <TodoHeader />
      <TodoList />
      <TodoFooter />
    </View>
  )
}

function TodoHeader() {
  const vm = useModel(todoViewModel)        // raw shape (context form)
  const count = useUnit(vm.$count)
  const active = useUnit(vm.$activeCount)

  return <h1>Todos ({active()}/{count()})</h1>
}
```

Note `active()` and `count()` — the parentheses. Solid's `useUnit` does not return a value; it returns a **function** (`Accessor<T>`) that, when called, produces the current value. We cover this in section 3.

`<View>` fires `lifecycle.mount()` in `onMount` and `lifecycle.destroy()` in `onCleanup`. Solid's component lifecycle is straightforward — no Strict-Mode-style double mount to worry about.

## 3. Using `useView(def, () => props)` (single-component form)

When exactly one component needs the view model, `useView` is a shorter alternative. It creates the instance, syncs props through a `createEffect`, and fires mount/cleanup lifecycle hooks.

```tsx
import { useUnit } from "effector-solid"
import { useView } from "@kbml-tentacles/solid"
import { todoViewModel } from "./todo-view"

export function TodoHeader() {
  const vm = useView(todoViewModel)
  const count = useUnit(vm.$count)
  const active = useUnit(vm.$activeCount)

  return <header><h1>Todos ({active()}/{count()})</h1></header>
}
```

### The accessor form

Like Vue, `useView`'s second argument is a **getter function**:

```tsx
export function TodoShell(props: { filter: "all" | "active" | "done" }) {
  const vm = useView(todoViewModel, () => ({
    filter: props.filter,
  }))
  // ...
}
```

Solid's reactivity is call-site based — passing a plain object snapshots values once. By passing a getter, the adapter can subscribe to the expression through `createEffect`:

```ts
solidEffect(() => {
  const current = getProps()
  // push each field into its unit
})
```

When any tracked source referenced inside `getProps()` changes, the effect re-runs and the units are updated.

Store props accept `T | Store<T>`. Event props accept `(payload) => void` or `EventCallable<T>`.

## 4. Accessors vs values

This trips up everyone new to Solid + effector. `effector-solid`'s `useUnit` returns an `Accessor<T>` — which is `() => T`, not `T`.

In JSX:

```tsx
const title = useUnit(todo.$title)
// title          — the function itself, renders as "[object Function]"
// title()        — the current string

return <span>{title()}</span>
```

Inside reactive contexts Solid will unwrap a zero-argument function for you in some places (e.g. JSX children), but the rule is: **always call the accessor**. It is explicit, consistent, and documents your intent.

Destructuring a whole shape works — but each property is still an accessor:

```tsx
const vm = useModel(todoViewModel)
const { $count, $activeCount } = vm
const count = useUnit($count)     // Accessor<number>

<p>{count()}</p>                   // value
```

`useModel` follows the same convention when it returns an accessor (see section 7).

## 5. `<Each>` modes

`<Each>` renders a collection of model instances. It has four modes, same as the React and Vue adapters, and internally wraps Solid's `<For>` and `<Show>`:

### `source={Store<ID[]>}`

Iterate a reactive ID list.

```tsx
import { Each } from "@kbml-tentacles/solid"
import { todoModel } from "./todo"

<Each model={todoModel} source={todoModel.$ids} fallback={<p>No todos yet</p>}>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

`<For>` handles keyed reconciliation — only added or removed IDs trigger row mount/cleanup.

### `id={ID}` (static)

Scope a single instance by a literal ID value.

```tsx
<Each model={todoModel} id={42}>
  {(todo) => <TodoEditor todo={todo} />}
</Each>
```

### `id={Store<ID | null>}` (reactive)

Scope by a reactive ID store.

```tsx
<Each model={todoModel} id={vm.$selectedId}>
  {(todo) => <TodoEditor todo={todo} />}
</Each>
```

When the store value becomes `null`, the subtree renders nothing.

### `from="refName"` (ref resolution)

Resolve a ref from a surrounding `<Each>` scope.

```tsx
<Each model={userModel} source={userModel.$ids}>
  {(user) => (
    <>
      <h2>{useUnit(user.$name)()}</h2>
      <Each model={postModel} from="posts">
        {(post) => <PostRow post={post} />}
      </Each>
    </>
  )}
</Each>
```

### Render-function vs static children

Both shapes are accepted:

```tsx
// Render function — receives the instance
<Each model={todoModel} source={todoModel.$ids}>
  {(todo) => <TodoRow todo={todo} />}
</Each>

// Static children — read context via useModel
<Each model={todoModel} source={todoModel.$ids}>
  <TodoRow />  {/* uses useModel(todoModel) internally */}
</Each>
```

Pick render-function when you want to receive the instance explicitly; pick static children when children live in their own files and read context.

## 6. `useModel(Model)` inside `<Each>`

Inside an `<Each>` subtree, components can grab the current instance without passing it through props:

```tsx
import { useUnit } from "effector-solid"
import { useModel } from "@kbml-tentacles/solid"
import { todoModel } from "../todo"

export function TodoRow() {
  const todo = useModel(todoModel)          // raw instance
  const title = useUnit(todo.$title)
  const done = useUnit(todo.$done)

  return (
    <li>
      <input
        type="checkbox"
        checked={done()}
        onChange={() => todo.toggle()}
      />
      {title()}
    </li>
  )
}
```

`useModel(todoModel)` returns the raw instance, not an accessor. `<Each>` gates its subtree on the instance existing (`<Show when={instance()}>`), so the child never observes `null`.

The call throws if there is no surrounding `<Each model={todoModel}>`. That is intentional — this overload is for components that can only exist inside such a subtree.

## 7. `useModel(Model, id)` outside `<Each>`

Three argument shapes let you look up instances without `<Each>`:

### Static ID — returns an accessor

```tsx
const todo = useModel(todoModel, 42)      // Accessor<Instance | null>

<Show when={todo()}>
  {(todo) => <TodoRow todo={todo()} />}
</Show>
```

**You must call the accessor.** Writing `{todo}` places the function itself into the DOM, which either throws or renders `"function () {…}"`.

### Compound key — returns an accessor

```tsx
const membership = useModel(Membership, userId, tenantId)  // Accessor<Instance | null>
```

### Reactive ID — returns an accessor

```tsx
const current = useModel(todoModel, $selectedId)   // Accessor<Instance | null>
```

All three behave the same way: the accessor returns the current instance, or `null` if the ID resolves to nothing. Wrap uses in `<Show when={current()}>` to gate rendering and narrow the type.

## 8. Troubleshooting

### `{title}` renders `"function () {…}"` or looks stale

You passed an accessor without calling it. In Solid + effector, anything that came out of `useUnit` or `useModel(model, id?)` is a function. Call it:

```tsx
<span>{title()}</span>
```

The rule is: **every accessor needs parentheses at the read site**.

### `useModel(todoModel): no <Each> ancestor found`

The zero-argument model overload only works inside `<Each model={todoModel}>`. Either move the call inside an `<Each>`, or pass an ID: `useModel(todoModel, id)` — which returns an accessor you must call.

### `useModel(todoViewModel): no <View> ancestor found`

The definition overload of `useModel` reads from `<View>` context. Wrap the parent with `<View model={todoViewModel}>` — the primary pattern — or, if this is a single-component owner, use `useView(todoViewModel)` directly.

### Props do not update the view model

Props are wired in a Solid `createEffect(() => { ... getProps() ... })`. The effect tracks whatever is accessed inside the getter. If you wrote:

```tsx
const filter = props.filter
useView(todoViewModel, () => ({ filter }))     // captured once
```

…then `filter` is captured at component creation and never re-read. Instead:

```tsx
useView(todoViewModel, () => ({ filter: props.filter }))     // tracked
```

The read of `props.filter` must happen **inside** the getter so the effect subscribes to it.

### SSR

`@kbml-tentacles/solid` does not ship its own provider. It reads stores via `effector-solid`'s `useUnit`, which respects whatever scope is wired up through `effector-solid`. For SSR, set up the scope with effector and let the view model's `$dataMap` serialize/deserialize alongside it.
