---
description: "Reference for Vue <View>: mount a view model and provide its shape via provide/inject."
---

# `<View>`

**Primary way to mount a view-model.** Instantiates a `ViewModelDefinition` inside a Vue component and provides its shape to every descendant via `provide`/`inject`. Accepts `:model` (the definition) and `:props` (preferably a getter) and optionally yields the shape to a default scoped slot. Descendants read the shape with `useModel(definition)`. Prefer `<View>` over [`useView`](./use-view); reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

— *Reference · Vue adapter · View*

## Signature

```ts
const View: DefineComponent<{
  model: ViewModelDefinition<Shape>;
  props?: Record<string, unknown>;
}>;
```

## Props

| Name | Type | Required | Description |
|---|---|---|---|
| `model` | `ViewModelDefinition<Shape>` | yes | The definition to instantiate. Stable identity expected across renders. |
| `props` | `Record<string, unknown>` | no | Raw prop snapshot. Reactive sources bound via Vue's template reactivity are tracked automatically. |

`:props` is re-applied whenever the passed object changes by reference; because Vue binds reactive object expressions in template position, this is equivalent to the getter form used by [`useView`](./use-view).

## Slots

| Slot | Argument | Description |
|---|---|---|
| `default` | `Shape` | The materialised view-model shape. |

```vue
<View :model="loginViewModel" :props="{ placeholder: props.placeholder }">
  <template #default="form">
    <input :value="form.$query" />
  </template>
</View>
```

## Lifecycle

| Vue hook | Behaviour |
|---|---|
| `setup()` | `definition.create(props)` |
| `watch(() => props, …, { deep: true })` | re-apply props |
| `onMounted` | `lifecycle.mount()` |
| `onUnmounted` | `lifecycle.destroy()` |

`<View>` in Vue calls `destroy` on cleanup (unlike React's `<View>`, which calls `unmount`). Vue does not simulate unmount-remount in development, so the distinction is unnecessary.

## Context

`<View>` provides the shape through a `provide`/`inject` pair keyed by the `ViewModelDefinition` identity. Descendants that call `useModel(definition)` read the nearest matching provider.

```vue
<View :model="loginViewModel">
  <!-- inside Submit.vue -->
  <!-- const form = useModel(loginViewModel) — resolves to this View's shape -->
  <Submit />
</View>
```

Nesting two `<View>`s with different definitions creates independent provisions; `useModel(vm)` reads the innermost match by definition identity.

## markRaw caveat

`<View>` returns effector units via the scoped slot. Internally, the shape is marked with `markRaw` so Vue's reactivity system does not attempt to proxy effector internals. Do not wrap the slot argument in `reactive()` — doing so would trigger `target is readonly` errors when effector mutates internal fields. Read values with `useUnit` from `effector-vue/composition` instead:

```vue
<template>
  <View :model="counterViewModel">
    <template #default="vm">
      <span>{{ useUnit(vm.$count) }}</span>
    </template>
  </View>
</template>
```

## Example — composed form

```vue
<script setup lang="ts">
import { View } from "@kbml-tentacles/vue";
import { loginViewModel } from "./login-vm";
import EmailField from "./EmailField.vue";
import PasswordField from "./PasswordField.vue";
import SubmitButton from "./SubmitButton.vue";
</script>

<template>
  <View :model="loginViewModel" :props="{ onSuccess: navigate }">
    <EmailField />
    <PasswordField />
    <SubmitButton />
  </View>
</template>
```

`EmailField` and siblings call `useModel(loginViewModel)` internally — no prop drilling.

## Edge cases

- Swapping the `:model` prop destroys the previous instance and creates a new one. Do not recreate `ViewModelDefinition` inline.
- Two `<View>`s with the same definition create two independent instances.
- Without a default slot, the component renders nothing but still mounts the view-model — useful for lifecycle-only effects.
- Events that fire during setup (before `onMounted`) are processed but will not surface through `lifecycle.mount` until the component is attached to the DOM.
- The shape argument is always the same object reference; do not use it as a `watch` key.

## See also

- [`useView`](./use-view) — composable equivalent, without context provision.
- [`useModel`](./use-model) — overload 1 reads `<View>`'s context.
- [`<Each>`](./each) — iteration counterpart for models.
