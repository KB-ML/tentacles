# @kbml-tentacles/forms-vue

Vue 3 bindings for [@kbml-tentacles/forms](../forms). Provides `useField` — a single composable that subscribes to a `Field<T>` and returns refs ready to bind to inputs (including a `v-model`-shaped helper).

```sh
npm install effector effector-vue vue @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-vue
```

## Quick start

```vue
<!-- LoginForm.vue -->
<script setup lang="ts">
import { useModel } from "@kbml-tentacles/vue";
import { useField } from "@kbml-tentacles/forms-vue";
import { loginForm } from "./login-form";

const form = useModel(loginForm);
const email = useField(form.email);
const password = useField(form.password);
</script>

<template>
  <form @submit.prevent="form.submit()">
    <input type="email" v-bind="email.model" />
    <span v-if="email.error.value">{{ email.error.value }}</span>

    <input type="password" v-bind="password.model" />
    <span v-if="password.error.value">{{ password.error.value }}</span>

    <button type="submit">Sign in</button>
  </form>
</template>
```

## API

- **`useField(field)`** — returns `{ value, error, warning, dirty, touched, validating, disabled, changed, blurred, model, register }` where the reactive slots are Vue `Ref`s.
- **`useField([f1, f2, ...])`** — batch subscription, returns a tuple.
- **`field.model`** — `{ modelValue, "onUpdate:modelValue" }` shape ready for `v-bind` on a `v-model`-supporting input or component.
- **`field.register()`** — low-level binding for native `<input>` (`{ value, onInput, onBlur }`).

For form-level state (`$values`, `$isValid`, `submit`, etc.) use the underlying view-model with `useModel(form)` from `@kbml-tentacles/vue` and `useUnit` from `effector-vue/composition`.

## Documentation

- Tutorial: [your first form](../../docs/tutorials/your-first-form.md)
- Reference: [`docs/reference/forms-vue`](../../docs/reference/forms-vue)

## Peer dependencies

- `effector ^23.0.0`
- `effector-vue ^23.0.0`
- `vue ^3.0.0`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
