---
description: "useField (Vue): Binds a Field to a Vue component. Returns refs for every reactive store on the field plus helpers for v-model and plain integration."
---

# useField (Vue)

Binds a `Field<T>` to a Vue component. Returns refs for every reactive store on the field plus helpers for `v-model` and plain `<input>` integration.

## Signatures

```ts
function useField<T>(field: Field<T>): UseFieldResult<T>

function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
): { [K in keyof F]: F[K] extends Field<infer T> ? UseFieldResult<T> : never }
```

## Parameters

| Arg | Type | Description |
|---|---|---|
| `field` or `fields` | `Field<T>` or `readonly Field<T>[]` | Single field or tuple for batched subscription |

## Return — `UseFieldResult<T>`

```ts
interface UseFieldResult<T> {
  value: Ref<T>
  error: Ref<string | null>
  warning: Ref<string | null>
  dirty: Ref<boolean>
  touched: Ref<boolean>
  validating: Ref<boolean>
  disabled: Ref<boolean>
  changed: (value: T) => void
  blurred: () => void
  model: {
    modelValue: Ref<T>
    "onUpdate:modelValue": (value: T) => void
  }
  register: () => {
    value: Ref<unknown>
    onInput: (e: Event) => void
    onBlur: () => void
  }
}
```

| Member | Description |
|---|---|
| `value` | `Ref<T>` — current field value, auto-unwrapped in templates |
| `error` | `Ref<string \| null>` — visible error |
| `warning` | `Ref<string \| null>` — non-blocking warning |
| `dirty`, `touched`, `validating`, `disabled` | `Ref<boolean>` refs |
| `changed(v)` | Imperative change — same target as a user edit |
| `blurred()` | Imperative blur — flips `$touched` |
| `model` | Pair you can spread onto a component expecting `v-model` |
| `register()` | Spread onto a plain `<input>` for value/input/blur wiring |

## Single field (template form)

Mount the form with `<View>` (the primary pattern) and read it from descendants with `useModel`:

```vue
<!-- SignupScreen.vue -->
<script setup lang="ts">
import { View } from "@kbml-tentacles/vue"
import { signupFormViewModel } from "./signup-form"
import SignupFormBody from "./SignupFormBody.vue"
</script>

<template>
  <View :model="signupFormViewModel">
    <SignupFormBody />
  </View>
</template>
```

```vue
<!-- SignupFormBody.vue -->
<script setup lang="ts">
import { useModel } from "@kbml-tentacles/vue"
import { useField } from "@kbml-tentacles/forms-vue"
import { signupFormViewModel } from "./signup-form"

const form = useModel(signupFormViewModel)
const email = useField(form.email)
</script>

<template>
  <label>
    Email
    <input v-bind="email.register()" />
    <span v-if="email.error">{{ email.error }}</span>
  </label>
</template>
```

`register()` spreads `value`, `onInput`, and `onBlur`. Vue unwraps the `value` ref automatically when rendered.

## `v-model` binding

Many UI kits (PrimeVue, Vuetify, Element Plus) accept `v-model` on custom components. The `model` property is the pre-built `modelValue` + `onUpdate:modelValue` pair:

```vue
<template>
  <MyInput v-bind="email.model" />
</template>
```

Or explicitly:

```vue
<template>
  <MyInput
    :modelValue="email.model.modelValue"
    @update:modelValue="email.model['onUpdate:modelValue']"
  />
</template>
```

Both bindings trigger `changed()` internally.

## Array form

Pass multiple fields in a single call to batch the `useUnit` subscription:

```vue
<script setup lang="ts">
const [email, password, confirmPassword] = useField([
  form.email,
  form.password,
  form.confirmPassword,
])
</script>

<template>
  <input v-bind="email.register()" />
  <input type="password" v-bind="password.register()" />
  <input type="password" v-bind="confirmPassword.register()" />
</template>
```

One `useUnit({ ... })` call for all fields — lower subscription overhead than calling `useField` per field.

## Transforms

When the contract declares `.transform({ parse, format })`, `register()` applies it:

```ts
// Contract
.field("age", (f) =>
  f<number>()
    .default(0)
    .transform({
      parse: (s: string) => Number(s),
      format: (n: number) => String(n),
    }),
)
```

```vue
<template>
  <!-- Input displays "25" (format applied); changed receives parsed number -->
  <input type="number" v-bind="age.register()" />
</template>
```

`model` does not apply the transform — it passes `T` directly. Use `register()` for DOM inputs, `model` for components that already handle the parsed type.

## Non-string inputs

`register()` is string-biased. For checkboxes, numbers, objects, bind manually:

```vue
<template>
  <!-- Checkbox -->
  <input
    type="checkbox"
    :checked="newsletter.value"
    @change="(e) => newsletter.changed((e.target as HTMLInputElement).checked)"
    @blur="newsletter.blurred"
  />

  <!-- Select with typed options -->
  <select :value="role.value" @change="(e) => role.changed((e.target as HTMLSelectElement).value as Role)">
    <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
  </select>
</template>
```

## Edge cases

- **Passing the same field twice** — allowed, returns two independent `UseFieldResult` objects. Reactive updates fire on both.
- **Field from an unmounted form** — stores are scope-bound; `useField` will still work but won't receive updates. Don't cache fields across mounts.
- **Disabled fields** — `disabled` ref reflects `field.$disabled`, but `register()` does not add a `disabled` DOM attribute automatically. Apply `:disabled="disabled"` on the input yourself.

## Comparison with React / Solid

- **React** returns plain values and hooks into `useUnit` once. No v-model concept — `register()` is the idiomatic binding.
- **Solid** returns `Accessor<T>` — call with `()` in JSX.
- **Vue** returns `Ref<T>` — template auto-unwrap handles it; script code calls `.value`.

## See also

| Topic | Link |
|---|---|
| The field type | [Field](/reference/forms/field) |
| Mounting the form (primary) | [View (Vue)](/reference/vue/view) |
| Mounting the form (single-component) | [useView (Vue)](/reference/vue/use-view) |
| React equivalent | [useField (React)](/reference/forms-react/use-field) |
| Solid equivalent | [useField (Solid)](/reference/forms-solid/use-field) |
| Form walkthrough | [Tutorial: Your first form](/tutorials/your-first-form) |
