# useField (Solid)

Binds a `Field<T>` to a Solid component. Returns an `Accessor<T>` for every reactive store on the field plus helpers for plain `<input>` integration.

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
  value: Accessor<T>
  error: Accessor<string | null>
  warning: Accessor<string | null>
  dirty: Accessor<boolean>
  touched: Accessor<boolean>
  validating: Accessor<boolean>
  disabled: Accessor<boolean>
  changed: (value: T) => void
  blurred: () => void
  register: () => {
    readonly value: unknown
    onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) => void
    onBlur: () => void
  }
}
```

| Member | Description |
|---|---|
| `value` | `Accessor<T>` — current value; call `value()` in JSX |
| `error` | `Accessor<string \| null>` — visible error |
| `warning` | `Accessor<string \| null>` — non-blocking warning |
| `dirty`, `touched`, `validating`, `disabled` | `Accessor<boolean>` — call with `()` |
| `changed(v)` | Imperative change — same target as a user edit |
| `blurred()` | Imperative blur — flips `$touched` |
| `register()` | Spread onto a plain `<input>` for value/input/blur wiring |

Solid's `useUnit` returns `Accessor<T>` — every reactive value must be called as a function to read inside a tracking scope.

## Single field

Mount the form with `<View>` (the primary pattern) and read it from descendants with `useModel`:

```tsx
import { View, useModel } from "@kbml-tentacles/solid"
import { useField } from "@kbml-tentacles/forms-solid"
import { signupFormViewModel } from "./signup-form"

function EmailField() {
  const form = useModel(signupFormViewModel)
  const email = useField(form.email)

  return (
    <label>
      Email
      <input {...email.register()} />
      {email.error() && <span>{email.error()}</span>}
    </label>
  )
}

export function SignupScreen() {
  return (
    <View model={signupFormViewModel}>
      <EmailField />
    </View>
  )
}
```

`register()` spreads `value`, `onInput`, and `onBlur`. The `value` getter is live — Solid's reactive system re-reads it whenever the underlying `$value` changes.

## Array form

Pass multiple fields in a single call to batch the `useUnit` subscription:

```tsx
function SignupFields() {
  const form = useModel(signupFormViewModel)
  const [email, password, confirmPassword] = useField([
    form.email,
    form.password,
    form.confirmPassword,
  ])

  return (
    <>
      <input {...email.register()} />
      <input type="password" {...password.register()} />
      <input type="password" {...confirmPassword.register()} />
    </>
  )
}
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

```tsx
// Input displays "25" (format applied); changed receives parsed number
<input type="number" {...age.register()} />
```

The `register().value` getter runs `format()` on each read; `onInput` runs `parse()` before calling `changed()`.

## Non-string inputs

`register()` is string-biased. For checkboxes, numbers, objects, bind manually using `changed()` and `value()`:

```tsx
// Checkbox
<input
  type="checkbox"
  checked={newsletter.value()}
  onChange={(e) => newsletter.changed(e.currentTarget.checked)}
  onBlur={newsletter.blurred}
/>

// Select with typed options
<select
  value={role.value()}
  onChange={(e) => role.changed(e.currentTarget.value as Role)}
>
  <For each={roles}>{(r) => <option value={r}>{r}</option>}</For>
</select>
```

## Reactive patterns

Because every getter is an `Accessor<T>`, `createMemo` and `createEffect` work out of the box:

```tsx
import { createMemo, createEffect } from "solid-js"

const email = useField(form.email)

const showHint = createMemo(() => email.touched() && !email.value().includes("@"))

createEffect(() => {
  if (email.error()) console.log("error:", email.error())
})
```

## Edge cases

- **Passing the same field twice** — allowed, returns two independent `UseFieldResult` objects. Reactive updates fire on both.
- **Field from an unmounted form** — stores are scope-bound; `useField` will still work but won't receive updates. Don't cache fields across mounts.
- **Disabled fields** — `disabled()` reflects `field.$disabled`, but `register()` does not add a `disabled` DOM attribute automatically. Apply `disabled={disabled()}` on the input yourself.
- **Always call accessors** — `email.value` without parentheses returns the accessor itself, not the value. Solid tracks only when you call it.

## Comparison with React / Vue

- **React** returns plain values and hooks into `useUnit` once. Reactivity comes from component re-renders.
- **Vue** returns `Ref<T>` — templates auto-unwrap; script code calls `.value`.
- **Solid** returns `Accessor<T>` — call with `()` everywhere. Fine-grained reactivity re-runs only the specific JSX node that reads the accessor.

## See also

| Topic | Link |
|---|---|
| The field type | [Field](/reference/forms/field) |
| Mounting the form (primary) | [View (Solid)](/reference/solid/view) |
| Mounting the form (single-component) | [useView (Solid)](/reference/solid/use-view) |
| React equivalent | [useField (React)](/reference/forms-react/use-field) |
| Vue equivalent | [useField (Vue)](/reference/forms-vue/use-field) |
| Form walkthrough | [Tutorial: Your first form](/tutorials/your-first-form) |
