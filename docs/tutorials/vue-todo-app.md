# A Vue todo app

In this tutorial you will wire a Tentacles model to a Vue 3 SFC. You will build the same small todo list from the React tutorial — but with composition API, scoped slots, and Vue-native `emit` wiring. Assumes you have done [Your first model](/tutorials/your-first-model).

## What you will learn

- How to mount a view model with `<View>` and read it in descendants with `useModel`
- How to use `<Each>` with scoped slots
- How `useModel` works in the composition API
- How Vue refs and effector stores interoperate via `effector-vue/composition`

## 1. Set up a Vue project

```sh
npm create vue@latest todo-app
# pick: TypeScript=Yes, JSX=No, Router=No, Pinia=No, Vitest=No, e2e=No
cd todo-app
npm install
npm install effector effector-vue @kbml-tentacles/core @kbml-tentacles/vue
```

`effector-vue` is the peer dependency used by `@kbml-tentacles/vue` — specifically its `composition` subpath provides `useUnit`.

## 2. Define the data model

Create `src/todo.ts` — identical to the React version since the model layer is framework-agnostic:

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

Create `src/todo-view.ts`:

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

Just like in the core tutorial, nothing about this is Vue-specific — view models are framework-agnostic. The Vue adapter handles prop wiring on your behalf.

## 4. Build the input component

Create `src/NewTodo.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue"
import { todoModel } from "./todo"

const title = ref("")

function handleAdd() {
  if (!title.value.trim()) return
  todoModel.create({ title: title.value })
  title.value = ""
}
</script>

<template>
  <div>
    <input v-model="title" placeholder="What needs doing?" />
    <button @click="handleAdd">Add</button>
  </div>
</template>
```

## 5. Build the list component

Create `src/TodoList.vue`:

```vue
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import { Each } from "@kbml-tentacles/vue"
import { todoModel } from "./todo"
import TodoItem from "./TodoItem.vue"
</script>

<template>
  <ul>
    <Each :model="todoModel" :source="todoModel.$ids">
      <template #default="todo">
        <TodoItem :todo="todo" />
      </template>

      <template #fallback>
        <p>No todos.</p>
      </template>
    </Each>
  </ul>
</template>
```

And `src/TodoItem.vue`:

```vue
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import type { todoModel } from "./todo"

type TodoInstance = ReturnType<typeof todoModel.create>

const props = defineProps<{ todo: TodoInstance }>()

const title = useUnit(props.todo.$title)
const done  = useUnit(props.todo.$done)
</script>

<template>
  <li :style="{ textDecoration: done ? 'line-through' : 'none' }">
    <input type="checkbox" :checked="done" @change="props.todo.toggle()" />
    {{ title }}
  </li>
</template>
```

Things worth calling out:

- **Scoped slot**: `<Each>` exposes the current instance as the **default slot argument** (`#default="todo"`). You pass it down as a prop — `useModel(todoModel)` also works inside, but passing through a typed prop is clearer.
- **`useUnit(todo.$title)`** returns a Vue `Ref<string>` — unwrapped in the template automatically.
- **`@change="props.todo.toggle()"`** — events are plain function calls. Tentacles instance events are `EventCallable`, safe to invoke directly.

## 6. Mount the view model with `<View>` in `App.vue`

`<View>` is the primary way to mount a view model in Vue. It provides the shape through `provide`/`inject`, so every descendant can pull it with `useModel`. `src/App.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue"
import { View } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"
import NewTodo from "./NewTodo.vue"
import TodoList from "./TodoList.vue"
import TodoStats from "./TodoStats.vue"

const filter = ref<"all" | "active" | "done">("all")

const emit = defineEmits<{
  (e: "clear"): void
}>()
</script>

<template>
  <View
    :model="todoViewModel"
    :props="() => ({ filter, onClear: () => emit('clear') })"
  >
    <h1>Todos</h1>
    <NewTodo />

    <label>
      Filter:
      <select v-model="filter">
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="done">Done</option>
      </select>
    </label>

    <TodoStats />
    <TodoList />
  </View>
</template>
```

`:props` is passed as a **getter function** so the adapter can watch reactive sources (the `filter` ref) and re-apply on change.

`src/TodoStats.vue` reads the mounted view model through context:

```vue
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import { useModel } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"

const vm = useModel(todoViewModel)   // reads nearest <View>
const activeCount = useUnit(vm.$activeCount)
const doneCount = useUnit(vm.$doneCount)
</script>

<template>
  <p>Active: {{ activeCount }} · Done: {{ doneCount }}</p>
</template>
```

### Alternative: `useView` for single-component owners

If one component owns the view model and nothing below it reads from context, `useView` is a shorter form. It takes the definition, a getter returning props, and an optional `emit`:

```vue
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import { useView } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"

const emit = defineEmits<{ (e: "clear"): void }>()
const vm = useView(
  todoViewModel,
  () => ({ filter: "all", onClear: () => emit("clear") }),
  emit,
)
const activeCount = useUnit(vm.$activeCount)
</script>
```

When `emit` is supplied, the adapter re-routes every event prop through it using a Vue-kebab-cased name:

| Event prop in contract | Emit name |
|---|---|
| `onClear` | `clear` |
| `onSaveItem` | `save-item` |
| `onRename` | `rename` |

Prefer `<View>` — it survives StrictMode-style double-mounts on adapters that need it and, more importantly, makes the shape visible to descendants via `useModel`. Reach for `useView` only when a component owns the instance and has no descendants that need to read it.

## 7. `useModel` in nested composables

Sometimes `<Each>` and props are not enough — you want an instance inside a child composable. Example: a `useTodoStats()` composable that reads the todo from context:

```ts
// src/composables/useTodoStats.ts
import { useUnit } from "effector-vue/composition"
import { useModel } from "@kbml-tentacles/vue"
import { todoModel } from "../todo"

export function useTodoStats() {
  const todo = useModel(todoModel)  // reads from nearest <Each>
  const title = useUnit(todo.$title)
  const done  = useUnit(todo.$done)
  return { title, done }
}
```

Use it inside any component nested under `<Each :model="todoModel">`. If no `<Each>` ancestor exists, `useModel(todoModel)` throws — that's intentional, so you catch missing context at dev time.

## 8. Lifecycle

`<View>` and `useView` both wire Vue's `onMounted` and `onUnmounted` to the view model's `mount()` and `destroy()`:

- **`mount()`** fires the `mounted` event inside the view model — useful for triggering initial loads with `sample({ clock: mounted, target: loadFx })`.
- **`destroy()`** clears the effector region the view model created, including all stores the view model allocated. This is different from React's `<View>`, which calls `unmount()` (Strict-Mode-safe). In Vue there is no double-mount problem, so cleanup is eager.

If you need mount without teardown (nesting inside another view model), don't use `<View>` or `useView` — instantiate manually via `todoViewModel.instantiate(propUnits)` inside another VM's `fn`.

## 9. What you have built

```
todo-app/
└── src/
    ├── todo.ts            Model (shared with any framework)
    ├── todo-view.ts       View model (UI state + aggregates + event out)
    ├── NewTodo.vue        Local input with ref
    ├── TodoList.vue       <Each> with scoped slots
    ├── TodoItem.vue       Per-item view
    ├── TodoStats.vue      Reads view model via useModel
    └── App.vue            <View> + emit wiring
```

Key Vue-specific patterns:

- **`<View>` as the primary mount** — wrap the subtree with `<View :model="…" :props="() => …">`; descendants pull the shape with `useModel`.
- **Getter function for props** — `() => ({ …current })` instead of passing the object directly.
- **`emit` re-wiring** — event props surface as Vue events via `toEmitName` ("onFoo" → "foo", "onSaveItem" → "save-item").
- **Scoped slot in `<Each>`** — default slot receives the instance; `#fallback` slot renders when list is empty.

## Where to go next

| If you want to… | Read |
|---|---|
| Do the same with React or Solid | [React tutorial](/tutorials/react-todo-app), [Solid tutorial](/tutorials/solid-todo-app) |
| Type the view model definition properly | [Reference: createViewModel](/reference/core/create-view-model) |
| Reactively resolve a ref (todo → category) | [How-to: Relate models with refs](/how-to/relate-models-with-refs) |
| See all `<Each>` modes | [Reference: Each (Vue)](/reference/vue/each) |
