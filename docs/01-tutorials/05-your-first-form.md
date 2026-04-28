---
description: "Tutorial: build a typed signup form with sync/async validation and React bindings."
---

# Your first form

In this tutorial you will build a signup form using `@kbml-tentacles/forms` and `@kbml-tentacles/forms-react`. By the end you will have a typed contract, sync and async validators, a password-confirmation cross-field rule, submit and reset flows, and a field-level binding through `useField`.

This assumes you have done [Your first model](/tutorials/your-first-model) and [A React todo app](/tutorials/react-todo-app) — the form layer builds on the view-model runtime, so the core idioms carry over.

## What you will learn

- How to declare a form with `createFormContract()` and field builders
- How sync validators differ from async validators (and how to debounce)
- How `createFormViewModel()` turns a contract into a `ViewModelDefinition`
- How `useField` binds a `Field<T>` to an input in one call
- How `submit`, `reset`, and `resetTo` interact with the validation lifecycle

## 1. Set up the project

Reuse the React app from the [React tutorial](/tutorials/react-todo-app), or spin up a fresh one:

```sh
npm create vite@latest signup-form -- --template react-ts
cd signup-form
npm install
npm install effector effector-react @kbml-tentacles/core @kbml-tentacles/react @kbml-tentacles/forms @kbml-tentacles/forms-react
```

`@kbml-tentacles/forms` is built on top of `@kbml-tentacles/core` — `createFormViewModel` returns a `ViewModelDefinition`, so you mount it with `<View model={...}>` exactly like any other view model.

## 2. Define the form contract

Create `src/signup-form.ts`:

```ts
import { createFormContract } from "@kbml-tentacles/forms"

export const signupContract = createFormContract()
  .field("email", (f) =>
    f<string>()
      .default("")
      .required("Email is required")
      .validate((v) => (v.includes("@") ? null : "Invalid email")),
  )
  .field("password", (f) =>
    f<string>()
      .default("")
      .required("Password is required")
      .validate((v) => (v.length >= 8 ? null : "At least 8 characters")),
  )
  .field("confirmPassword", (f) =>
    f<string>()
      .default("")
      .required("Please confirm your password"),
  )
  .field("newsletter", (f) => f<boolean>().default(false))
  .validate((values) =>
    values.password === values.confirmPassword
      ? null
      : { path: ["confirmPassword"], message: "Passwords do not match" },
  )
```

A few things to notice:

- **`f<T>()` is a call**, like `s<T>()` on model contracts — you invoke `f` with the value type as a type argument.
- **`.required(msg)`** is just sugar for `.validate(v => v == null || v === "" ? msg : null)`. It also narrows the type so the field is non-optional on the output.
- **`.validate(values => …)`** at the chain level is a **cross-field** validator. It runs after field-level validation and receives the full values object. Return `null` (pass), a string, or a `{ path, message }` object to attach the error to a specific field.

## 3. Create the view model

`createFormViewModel()` takes the contract and returns a normal `ViewModelDefinition` — exactly what `<View>` expects.

```ts
// src/signup-form.ts (continued)
import { createFormViewModel } from "@kbml-tentacles/forms"

export const signupFormViewModel = createFormViewModel({
  contract: signupContract,
  validate: {
    mode: "blur",         // validate each field when it loses focus
    reValidate: "change", // once a field has shown an error, re-check on each keystroke
  },
  resetOptions: {
    keepValues: false,
    keepErrors: false,
    keepSubmitCount: false,
  },
  preventDoubleSubmit: true,
  fn: (form, ctx) => {
    form.submitted.watch((values) => {
      console.log("ready to send:", values)
    })
    return form
  },
})
```

- **`validate.mode`** controls *when errors first become visible*. `"blur"` holds errors back until the user leaves the field; `"submit"` (default) holds them until submit. The validator itself runs regardless — modes only gate visibility.
- **`validate.reValidate`** governs *subsequent* validation — once an error has been shown, it re-checks on change (the default). This mirrors React Hook Form's behavior.
- **`fn(form, ctx)`** receives the full `FormShape` and the view-model context. Return `form` to expose its full surface, or return a subset.

## 4. Build the form component

Create `src/SignupScreen.tsx`:

```tsx
import { useUnit } from "effector-react"
import { View, useModel } from "@kbml-tentacles/react"
import { useField } from "@kbml-tentacles/forms-react"
import { signupFormViewModel } from "./signup-form"

function SignupFormBody() {
  const form = useModel(signupFormViewModel)

  const [email, password, confirmPassword] = useField([
    form.email,
    form.password,
    form.confirmPassword,
  ])
  const newsletter = useField(form.newsletter)

  const [isSubmitting, isValid, submit, reset] = useUnit([
    form.$isSubmitting,
    form.$isValid,
    form.submit,
    form.reset,
  ])

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label>
        Email
        <input {...email.register()} />
        {email.error && <span>{email.error}</span>}
      </label>

      <label>
        Password
        <input type="password" {...password.register()} />
        {password.error && <span>{password.error}</span>}
      </label>

      <label>
        Confirm password
        <input type="password" {...confirmPassword.register()} />
        {confirmPassword.error && <span>{confirmPassword.error}</span>}
      </label>

      <label>
        <input
          type="checkbox"
          checked={newsletter.value}
          onChange={(e) => newsletter.changed(e.target.checked)}
        />
        Subscribe to the newsletter
      </label>

      <button type="submit" disabled={isSubmitting || !isValid}>
        {isSubmitting ? "Signing up…" : "Sign up"}
      </button>
      <button type="button" onClick={() => reset()}>
        Reset
      </button>
    </form>
  )
}

export function SignupScreen() {
  return (
    <View model={signupFormViewModel}>
      <SignupFormBody />
    </View>
  )
}
```

Walk through what happens:

1. **`<View model={signupFormViewModel}>`** mounts the view model and puts its shape in context for every descendant. Inside, **`useModel(signupFormViewModel)`** reads it. `form.email`, `form.password`, etc. are `Field<T>` objects. `form.$isSubmitting`, `form.$isValid`, etc. are `Store<…>` instances.
2. **`useField(form.email)`** subscribes to every store on that field in a *single* `useUnit` call and returns a plain object with unwrapped values plus a `register()` helper. One component, one subscription.
3. **`{...email.register()}`** spreads `value`, `onChange`, and `onBlur` onto the input. For a boolean checkbox, use `value` + `changed()` directly — `register()` is string-biased.
4. **`form.submit()`** is an `EventCallable<void>`. It triggers the full flow: `showAllErrors()` → `validateAll()` → route to `submitted` or `rejected`.

## 5. Add async validation

Let's check email availability as the user types. Update the contract:

```ts
.field("email", (f) =>
  f<string>()
    .default("")
    .required("Email is required")
    .validate((v) => (v.includes("@") ? null : "Invalid email"))
    .validateAsync(
      async (v, ctx) => {
        const res = await fetch(`/api/check-email?q=${encodeURIComponent(v)}`, {
          signal: ctx.signal,
        })
        if (ctx.signal.aborted) return null
        const { available } = await res.json()
        return available ? null : "Already taken"
      },
      { debounce: 350, runOn: "change" },
    ),
)
```

Three things worth calling out:

- **`ctx.signal`** is a standard `AbortSignal`. If the user types another keystroke before the request returns, the previous one is cancelled — no stale "already taken" showing for a value the user has since changed.
- **`debounce: 350`** means the runner waits 350ms of inactivity before dispatching the async validator. Debounce is per-validator, not per-form.
- **`runOn: "change"`** overrides the form-level mode for *just this validator* — async validators that hit the network typically want `change` or `blur`, not `submit`.

While the async validator is in flight, `form.$isValidating` is `true` and the field exposes `validating: true` via `useField`. Use that to show a spinner or disable submit:

```tsx
const isValidating = useUnit(form.$isValidating)
<button disabled={isSubmitting || isValidating || !isValid}>Sign up</button>
```

On submit, the orchestrator awaits all pending async validators before routing to `submitted` vs `rejected`.

## 6. React to lifecycle events

The form shape exposes three lifecycle events:

- **`submitted: Event<Values>`** — fired once after a successful submit, with the (validated) values.
- **`rejected: Event<DeepErrors<Values>>`** — fired when validation fails on submit.
- **`resetCompleted: Event<Values>`** — fired after `reset()` / `resetTo()` finishes.

Wire them in `fn`:

```ts
fn: (form, { mounted }) => {
  form.submitted.watch((values) => {
    // send to backend, navigate, etc.
    console.log("submit success:", values)
  })

  form.rejected.watch((errors) => {
    console.warn("submit blocked by:", errors)
  })

  form.resetCompleted.watch(() => {
    console.log("back to defaults")
  })

  return form
},
```

Or, more idiomatically, use `sample`:

```ts
import { sample } from "effector"

sample({
  clock: form.submitted,
  target: signupFx,   // some Effect<Values, userModel, Error>
})
```

`signupFx.failData` can feed back into `form.setFormError` or `form.setErrors`.

## 7. `resetTo` vs `reset`

Two distinct operations:

- **`form.reset()`** — restores each field to its `$default`. Respects `resetOptions` (keepDirty, keepErrors, etc.).
- **`form.resetTo(values)`** — restores each field to the values you pass, then treats them as the new `$initial`. Use this when you load existing data to edit.

```ts
// Load existing user for editing
const user = await fetchUserFx(id)
form.resetTo({
  email: user.email,
  password: "",
  confirmPassword: "",
  newsletter: user.newsletter,
})
```

After `resetTo`, `$dirty` is false for all fields (because `$value === $initial`). Subsequent edits flip `$dirty` as expected.

## 8. What you have built

```
signup-form/
└── src/
    ├── signup-form.ts    Contract + view model definition
    └── SignupScreen.tsx  <View> + useModel + useField wiring
```

You used:

- **`createFormContract()`** — fluent schema with `.field()`, `.validate()` (cross-field).
- **Field builder** — `.default`, `.required`, `.validate`, `.validateAsync` with debounce and abort signals.
- **`createFormViewModel()`** — wraps the contract into a `ViewModelDefinition` with validation modes and reset options.
- **`useField`** — one-shot binding that subscribes to the whole field in a single `useUnit` call.
- **Form shape** — `$isSubmitting`, `$isValid`, `$isValidating`, `submit`, `reset`, `resetTo`, plus `submitted`/`rejected` events.

## Where to go next

| If you want to… | Read |
|---|---|
| Build repeating rows (contacts, line items) | [How-to: Work with form arrays](/how-to/work-with-form-arrays) |
| Skip custom validators and use Zod/Yup/Joi | [How-to: Use a schema validator](/how-to/use-schema-validator) |
| Nest one form inside another | [How-to: Define a form contract](/how-to/define-a-form-contract) — the `.sub()` section |
| See the full validator interface | [Reference: Validators](/reference/forms/validators) |
| Understand when errors become visible | [Explanation: Hidden vs visible errors](/explanation/hidden-visible-errors) |
