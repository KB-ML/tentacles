# @kbml-tentacles/vue

Vue 3 adapter for [@kbml-tentacles/core](../core). Mount view-models with `<View>`, render rows with `<Each>`, and pull the current model out of context with `useModel`.

```sh
npm install effector effector-vue @kbml-tentacles/core @kbml-tentacles/vue
```

## Quick start

```vue
<!-- TodoItem.vue -->
<script setup lang="ts">
import { useModel } from "@kbml-tentacles/vue";
import { useUnit } from "effector-vue/composition";
import { todoModel } from "./todo";

const todo = useModel(todoModel);
const title = useUnit(todo.$title);
const done = useUnit(todo.$done);
</script>

<template>
  <li :style="{ textDecoration: done ? 'line-through' : 'none' }">
    <input type="checkbox" :checked="done" @change="todo.toggle()" />
    {{ title }}
  </li>
</template>
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { Each, View } from "@kbml-tentacles/vue";
import { todoModel } from "./todo";
import { todoViewModel } from "./todo-view";
import TodoItem from "./TodoItem.vue";
</script>

<template>
  <View :model="todoViewModel">
    <ul>
      <Each :model="todoModel" :source="todoModel.$ids">
        <TodoItem />
      </Each>
    </ul>
  </View>
</template>
```

## API

- **`<View :model="vm" :props="...">`** — provides a view-model instance to descendants. Event props can also be wired to Vue `emit` automatically.
- **`<Each :model="m" :source="$ids">`** / **`:id="singleId"`** / **`from="refField"`** — render once per id without rebuilding subtrees.
- **`useModel(modelOrViewModel)`** — pull the current `<View>` / `<Each>` instance from context.
- **`useView(definition, () => props, emit?)`** — composable for view-models when you don't have a `<View>` boundary.

## Documentation

- Tutorial: [Vue todo app](../../docs/tutorials/vue-todo-app.md)
- How-to: [integrate with Vue](../../docs/how-to/integrate-with-vue.md)
- Reference: [`docs/reference/vue`](../../docs/reference/vue)

## Peer dependencies

- `effector ^23.0.0`
- `effector-vue ^23.0.0`
- `vue ^3.0.0`
- `@kbml-tentacles/core ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
