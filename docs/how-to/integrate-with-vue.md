# Integrate with Vue

Wire a Tentacles model or view model into a Vue 3 app with `@kbml-tentacles/vue`. The adapter plugs into the composition API and uses `effector-vue` to turn stores into `Ref`s.

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

`@kbml-tentacles/vue` declares three peer dependencies:

```sh
npm install effector effector-vue @kbml-tentacles/core @kbml-tentacles/vue
```

| Package | Role |
|---|---|
| `effector` | Reactive core |
| `effector-vue` | Provides `useUnit` from `effector-vue/composition` |
| `@kbml-tentacles/core` | Contract and model builders |
| `@kbml-tentacles/vue` | `useView`, `View`, `Each`, `useModel`, `ScopeStackKey` |

Vue 3 is required.

## 2. Using `<View>` (primary pattern)

`<View>` is the main way to mount a view model. It provides the shape to every descendant via Vue's `provide`/`inject`, plays well with single-file components, and cleans up in `onUnmounted`.

```vue
<!-- TodoPage.vue -->
<script setup lang="ts">
import { View } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"
import TodoHeader from "./TodoHeader.vue"
import TodoList from "./TodoList.vue"
</script>

<template>
  <View :model="todoViewModel" :props="{ filter: 'all' }">
    <TodoHeader />
    <TodoList />
  </View>
</template>
```

Inside descendants, pull the shape with `useModel`:

```vue
<!-- TodoHeader.vue -->
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import { useModel } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"

const vm = useModel(todoViewModel)           // reads <View> context
const count = useUnit(vm.$count)
const active = useUnit(vm.$activeCount)
</script>

<template>
  <header><h1>Todos ({{ active }}/{{ count }})</h1></header>
</template>
```

`:props` can be a plain object or a function — the component normalizes both into a getter before wiring a `watch`. `<View>` fires `lifecycle.mount()` in `onMounted` and `lifecycle.destroy()` in `onUnmounted`. Vue does not simulate unmount like React Strict Mode, so a single destroy is correct.

## 3. Using `useView(def, () => props, emit?)` (single-component form)

When exactly one component needs the view model, `useView` is a shorter alternative — it creates the instance, wires props reactively through a `watch`, and fires mount/destroy lifecycle hooks.

```vue
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import { useView } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"

const vm = useView(todoViewModel)
const count = useUnit(vm.$count)
const active = useUnit(vm.$activeCount)
</script>
```

### The accessor form

Unlike the React adapter, `useView`'s second argument is a **getter function**, not a plain object. Vue needs a function so it can subscribe to props reactively:

```ts
const props = defineProps<{ filter: "all" | "active" | "done" }>()

const vm = useView(todoViewModel, () => ({
  filter: props.filter,
}))
```

Internally the adapter does:

```ts
watch(getProps, (current) => {
  // push each field into its unit
}, { deep: true })
```

The `deep: true` option matters — nested object props change without a new outer reference, and we still want to re-sync.

Store props accept `T | Store<T>`. Event props accept `(payload) => void` or `EventCallable<T>`.

### The `emit` argument

`useView` takes an optional third argument — the component's `emit` function. When provided, every event prop's payload is routed through Vue's emit mechanism with a kebab-cased name:

```vue
<script setup lang="ts">
import { useView } from "@kbml-tentacles/vue"
import { todoViewModel } from "./todo-view"

const emit = defineEmits<{
  clear: []
  "save-item": [id: number]
  rename: [title: string]
}>()

const vm = useView(todoViewModel, () => ({ filter: "all" }), emit)
</script>
```

### Name mapping

The adapter strips a leading `on` (lowercasing the next letter) and dasherizes the rest:

| Prop name | Emitted event name |
|---|---|
| `onClear` | `clear` |
| `onSaveItem` | `save-item` |
| `onRename` | `rename` |
| `onFooBarBaz` | `foo-bar-baz` |

Naming your props `on<PascalCase>` is therefore recommended — it matches the common convention in React-flavored props and produces Vue-idiomatic emit names automatically.

When you pass `emit`, the adapter re-wires event props: they no longer call whatever callback you put in the props bag. They fire emit instead. If you need both — a local callback **and** a parent emit — add another `.watch` on the event in your view-model `fn`.

## 5. `<Each>` with scoped slot

`<Each>` renders a collection of model instances and injects each one into a scoped slot. The instance is the slot's default prop:

```vue
<template>
  <Each :model="todoModel" :source="todoModel.$ids">
    <template #default="todo">
      <TodoRow :todo="todo" />
    </template>

    <template #fallback>
      <p>No todos yet.</p>
    </template>
  </Each>
</template>
```

The four modes mirror the React adapter:

| Prop | Behaviour |
|---|---|
| `:source="Store<ID[]>"` | Iterate a reactive ID list |
| `:id="ID"` | Scope one instance by literal ID |
| `:id="Store<ID \| null>"` | Scope one instance by a reactive ID |
| `:from="refName"` | Resolve a ref from the surrounding `<Each>` stack |

Ref resolution (`from`) walks the `ScopeStackKey` provide-stack to find a parent `<Each>` whose model declares that ref. Cardinality is inferred from the ref descriptor.

For compound nesting:

```vue
<template>
  <Each :model="userModel" :source="userModel.$ids">
    <template #default="user">
      <h2>{{ user.$name.getState() }}</h2>
      <Each :model="postModel" from="posts">
        <template #default="post">
          <article>{{ post.$title.getState() }}</article>
        </template>
      </Each>
    </template>
  </Each>
</template>
```

## 6. `useModel(Model)` inside `<Each>`

Inside an `<Each>` subtree, components can grab the current instance without passing it through props:

```vue
<script setup lang="ts">
import { useUnit } from "effector-vue/composition"
import { useModel } from "@kbml-tentacles/vue"
import { todoModel } from "../todo"

const todo = useModel(todoModel)            // raw instance (parent gates existence)
const title = useUnit(todo.$title)
const done = useUnit(todo.$done)
</script>

<template>
  <li>
    <input type="checkbox" :checked="done" @change="todo.toggle()" />
    {{ title }}
  </li>
</template>
```

`useModel(todoModel)` returns the raw instance, not a `Ref`. `<Each>` does not render its slot when the instance is missing, so the child never observes `null`. The throw case — "no `<Each>` ancestor found" — happens only when you call this overload **outside** any `<Each>` for that model.

### With an ID

Outside `<Each>` (or when you want to override context), pass an ID:

```ts
const todo = useModel(todoModel, 42)            // Ref<Instance | null>
const membership = useModel(Membership, userId, tenantId)  // compound key
const current = useModel(todoModel, $selectedId)  // Store<ID | null>
```

All three ID-bearing forms return a **`Ref`** — call `.value` or unwrap with `{{ todo.value?.$title.getState() }}`. This differs from `useModel(todoModel)` (the context form) which returns a raw object.

## 7. Why `markRaw` matters

Effector units (stores, events, effects) are plain objects whose internals must not be proxied. Vue's reactivity layer wraps objects with `Proxy` and will trigger warnings like:

```
[Vue warn] Set operation on key "current" failed: target is readonly
```

…the moment effector tries to mutate its own graphite nodes through what Vue now considers a readonly target.

The adapter handles this for you in `<Each>`, `<View>`, and `useModel` — every instance crossing the adapter boundary is wrapped in `markRaw` and every unit object is individually marked raw. You do not need to think about it.

You **do** need to think about it if you hold an instance (or a store) in a local Vue `ref` or `reactive`:

```ts
import { markRaw, ref } from "vue"

// Wrong — Vue wraps the instance in a reactive proxy
const selected = ref<TodoInstance | null>(null)

// Right — markRaw preserves effector's internals
const selected = ref<TodoInstance | null>(markRaw(todoModel.get(id)))
```

The rule: anything returned from `Model.get(id)`, `definition.instantiate()`, or exposed as a `Shape` should be passed through `markRaw` before being stored in Vue reactive state.

## 8. Troubleshooting

### `[Vue warn] Set operation on key X failed: target is readonly`

Root cause: an effector unit (store, event, effect) was captured by Vue's reactive proxy, and effector tried to mutate it internally.

- If the unit came out of `useModel`, `<Each>`, or a view-model `Shape`, the adapter already applied `markRaw`. The warning should not appear — if it does, file a bug.
- If you stashed an instance, shape, or store into your own `ref`/`reactive`, wrap it with `markRaw(...)` first.

### `useModel(todoModel): no <Each> ancestor found`

The zero-argument model overload only works inside `<Each :model="todoModel">`. Either move the call inside an `<Each>`, or pass an ID: `useModel(todoModel, id)`.

### `useModel(todoViewModel): no <View> ancestor found`

The definition overload of `useModel` reads from `<View>` context. Wrap the parent with `<View :model="todoViewModel">` — the primary pattern — or, if this is a single-component owner, use `useView(todoViewModel)` directly.

### SSR

`@kbml-tentacles/vue` itself does not ship a provider. It reads stores via `effector-vue/composition`'s `useUnit`, which honours whatever scope is supplied by `effector-vue`'s fork integration. For SSR, set up the scope with effector and let the view model's `$dataMap` serialize/deserialize along with it.

### The `props` on `<View>` changed but the view model did not see it

`<View>` wraps the prop bag in a `watch(getProps, …, { deep: true })`. If you are passing the same object reference every render and only mutating nested fields, that deep flag catches it. If you are passing a completely new top-level object, the watcher still fires. If neither works, verify the prop name matches the view model's props contract — unknown keys are silently ignored.
