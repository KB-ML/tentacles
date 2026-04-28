---
description: "Reference for @kbml-tentacles/forms-vue: bind Tentacles form fields to Vue 3 inputs."
---

# `@kbml-tentacles/forms-vue`

Vue 3 adapter for `@kbml-tentacles/forms`. A single composable — `useField` — projects a `Field<T>` into Vue refs (`Ref<T>`, `Ref<string | null>`, …) plus a `model` pair for `v-model` bindings and a `register()` shorthand for plain `<input>` elements. All store subscriptions for every passed field are collapsed into one `useUnit` call from `effector-vue/composition`.

— *Reference · forms-vue adapter · v0.x*

## Install

```bash
yarn add @kbml-tentacles/forms-vue @kbml-tentacles/forms @kbml-tentacles/vue @kbml-tentacles/core effector effector-vue
```

```bash
npm install @kbml-tentacles/forms-vue @kbml-tentacles/forms @kbml-tentacles/vue @kbml-tentacles/core effector effector-vue
```

## Peer dependencies

| Package | Range |
|---|---|
| `@kbml-tentacles/forms` | `workspace:*` |
| `effector` | `^23.0.0` |
| `effector-vue` | `^23.0.0` |
| `vue` | `>=3.3.0` |

The composable imports `useUnit` from `effector-vue/composition`. Vue 3.3+ is required for the composition-API typings used by the surrounding form view-model adapter.

Forms are view-models. Mount them with [`<View>`](/reference/vue/view) from `@kbml-tentacles/vue` (primary pattern) — or [`useView`](/reference/vue/use-view) when a single component owns the form. `useField` reads individual fields out of the resulting shape.

## Exports

| Symbol | Kind | Purpose |
|---|---|---|
| [`useField`](/reference/forms-vue/use-field) | composable | Bind one or many `Field<T>` units to a Vue input or component. |
| `UseFieldResult<T>` | type | Shape returned per field — refs + events + `model` pair + `register()`. |

## Quick example

```vue
<!-- LoginScreen.vue -->
<script setup lang="ts">
import { View } from "@kbml-tentacles/vue";
import { loginFormViewModel } from "./login-form";
import LoginFormBody from "./LoginFormBody.vue";
</script>

<template>
  <View :model="loginFormViewModel">
    <LoginFormBody />
  </View>
</template>
```

```vue
<!-- LoginFormBody.vue -->
<script setup lang="ts">
import { useModel } from "@kbml-tentacles/vue";
import { useField } from "@kbml-tentacles/forms-vue";
import { loginFormViewModel } from "./login-form";

const form = useModel(loginFormViewModel);
const [email, password] = useField([form.email, form.password]);
</script>

<template>
  <form @submit.prevent="form.submit()">
    <input placeholder="email" v-bind="email.register()" />
    <p v-if="email.error.value">{{ email.error.value }}</p>
    <input type="password" placeholder="password" v-bind="password.register()" />
    <button type="submit">Sign in</button>
  </form>
</template>
```

The form itself is created by `createFormViewModel({...})` from `@kbml-tentacles/forms`; `<View>` materialises it into a `FormShape` and provides it via `provide`/`inject`. Descendants call `useModel(loginFormViewModel)` to pull the shape and `useField` projects one `Field<T>` into `{ value, error, changed, model, register, ... }`.

## `model` vs `register`

The adapter exposes two output styles per field:

- `model` — the v-model pair `{ modelValue, "onUpdate:modelValue" }`. Spread it onto any custom component that follows Vue's two-way binding convention: `<MyInput v-bind="email.model" />`. Works without value coercion — booleans, numbers, and objects flow through as-is.
- `register()` — the input pair `{ value, onInput, onBlur }`. Designed for plain `<input>` and `<textarea>`. Coerces to string for text-like inputs.

Use `model` when binding to component primitives that accept any `T`; use `register()` for raw HTML form controls.

## Array overload

`useField([form.email, form.password])` returns an ordered array of results in the same order as the input fields, with each entry's `T` preserved through mapped types. Every subscription for every field flows through one `useUnit({...})` call.

## See also

- [`useField` · full reference](/reference/forms-vue/use-field)
- [`@kbml-tentacles/forms`](/reference/forms/) — the contract layer this adapter reads against.
- [`Field` reference](/reference/forms/field) — the unit returned by `form.<path>`.
- [`<View>` · Vue](/reference/vue/view) — primary mount for a form view-model.
- [`useView` · Vue](/reference/vue/use-view) — single-component alternative to `<View>`.
- [`@kbml-tentacles/forms-react`](/reference/forms-react/) — the same API for React.
- [`@kbml-tentacles/forms-solid`](/reference/forms-solid/) — the same API for Solid.
- [Tutorial · Your first form](/tutorials/your-first-form)
