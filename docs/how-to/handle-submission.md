# Handle submission

You have a form contract, validators, and a UI. Now the user hits **Submit** — how do you pipe validated values into an effect, show loading state, deal with server errors, and prevent double-clicks?

This guide covers the submit lifecycle end to end.

## What you will learn

- What `form.submit()` does internally
- How to subscribe to `form.submitted` vs `form.rejected`
- How to wire a submit effect with `sample`
- How to surface server-side errors
- How the double-submit guard works

## The submit flow, step by step

Calling `form.submit()` triggers this sequence:

1. **Double-submit guard** — if `preventDoubleSubmit` is on and a submit is already in flight, the call is ignored.
2. `$isSubmitting` flips to `true`; `$submitCount` increments.
3. **`showAllErrors()`** — every field's `$visible` flag flips to `true`, so hidden errors become visible (even on untouched fields).
4. **`validateAll()`** — runs every field's validators, then cross-field validators. Awaits any pending async validators.
5. Based on the result:
   - All valid → `submitted` event fires with the current values; `$isSubmitSuccessful = true`.
   - Any errors → `rejected` event fires with the errors map; `$isSubmitSuccessful = false`.
6. `$isSubmitting` flips back to `false`; `$isSubmitted = true`.

You never invoke steps 3–5 manually — you just call `form.submit()` and subscribe to the outcome.

## Subscribe to `submitted` with `sample`

The idiomatic pattern connects the lifecycle event to an effector `Effect`:

```ts
import { createEffect, sample } from "effector"
import { createFormViewModel } from "@kbml-tentacles/forms"

const signupFx = createEffect(async (values: SignupValues) => {
  const res = await fetch("/api/signup", {
    method: "POST",
    body: JSON.stringify(values),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
})

export const signupFormViewModel = createFormViewModel({
  contract: signupContract,
  fn: (form) => {
    sample({
      clock: form.submitted,
      target: signupFx,
    })
    return form
  },
})
```

`form.submitted` is an `Event<Values>` — not callable, only observable. `sample` listens for it and forwards the payload to `signupFx`.

## React to failure

Three different failure channels:

| Channel | When it fires |
|---|---|
| `form.rejected` | Validation failed on submit |
| `signupFx.failData` | The effect itself threw |
| Custom server-error mapping | You pulled errors off the response and dispatched `form.setErrors(...)` |

Handle each:

```ts
fn: (form) => {
  sample({ clock: form.submitted, target: signupFx })

  // Validation failure — optional, for analytics or focus management
  form.rejected.watch((errors) => {
    console.log("validation blocked submit:", errors)
  })

  // Server-side failure — surface to UI
  sample({
    clock: signupFx.failData,
    fn: (error) => error.message,
    target: form.setFormError,
  })

  return form
}
```

`form.setFormError` sets `$formError`, which is separate from per-field errors — ideal for "network unreachable" or generic failures.

## Map server validation errors to field paths

When your backend returns field-specific errors (e.g., `{ email: "already taken" }`), route them with `setErrors`:

```ts
sample({
  clock: signupFx.failData,
  filter: (error) => error instanceof ValidationError,
  fn: (error) => error.fieldErrors,    // { email: "already taken" }
  target: form.setErrors,
})
```

`setErrors` accepts `Record<string, string>` — keys are dotted paths (`"user.email"`, `"contacts.0.phone"`), values are the error message.

## UI-level state

Subscribe to the boolean stores for loading UI:

```tsx
const isSubmitting = useUnit(form.$isSubmitting)
const isValid      = useUnit(form.$isValid)
const isValidating = useUnit(form.$isValidating)
const formError    = useUnit(form.$formError)

<button type="submit" disabled={isSubmitting || isValidating || !isValid}>
  {isSubmitting ? "Signing up…" : "Sign up"}
</button>

{formError && <div role="alert">{formError}</div>}
```

- **`$isValidating`** is true while any async validator is in flight. Gate submit on it if you want the user to wait for server-side email availability checks.
- **`$isValid`** is `false` whenever any field has an error; no need to check each one.

## `preventDoubleSubmit`

Two guards are baked into `SubmitOrchestrator`:

1. **In-flight guard** — while `$isSubmitting` is true, additional `submit()` calls are discarded.
2. **Opt-in flag** — `createFormViewModel({ preventDoubleSubmit: true })` enables this path (default is `true`).

If you need to allow a fresh attempt after a failed submit, nothing extra is needed — the guard clears as soon as validation finishes. If you want to allow only **one** successful submit (e.g., a final confirmation page), gate on `$isSubmitSuccessful` yourself:

```tsx
<button disabled={isSubmitSuccessful || isSubmitting}>Submit</button>
```

## Redirect on success

Combine `submitted` with router navigation:

```ts
import { sample } from "effector"

sample({
  clock: signupFx.doneData,   // not form.submitted — wait for the effect to finish
  fn: (user) => `/welcome/${user.id}`,
  target: navigateFx,
})
```

Chaining from `signupFx.doneData` (not `form.submitted`) ensures you navigate *after* the request succeeds, not immediately after client-side validation.

## Programmatic submit

`form.submit()` is an `EventCallable<void>` — invoke it from anywhere that has the form shape:

```tsx
// From a parent component
<button onClick={() => form.submit()}>Save</button>
```

For a keyboard shortcut, wire it in the form view model's `fn` using the view model's lifecycle events — no framework hook required:

```ts
createFormViewModel({
  contract: signupContract,
  fn: (form, { mounted, unmounted }) => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter") form.submit()
    }
    mounted.watch(() => window.addEventListener("keydown", onKey))
    unmounted.watch(() => window.removeEventListener("keydown", onKey))
    return form
  },
})
```

You don't need to re-implement double-submit logic — the orchestrator handles it.

## See also

| Topic | Link |
|---|---|
| What `$isValid` / `$isSubmitting` mean | [Reference: FormShape](/reference/forms/form-shape) |
| Validation before submit | [Reference: Validation modes](/reference/forms/validation-modes) |
| Reset after success | [How-to: Reset and keep state](/how-to/reset-and-keep-state) |
| Full lifecycle narrative | [Explanation: Validation lifecycle](/explanation/validation-lifecycle) |
