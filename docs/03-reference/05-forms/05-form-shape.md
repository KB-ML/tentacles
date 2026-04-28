---
description: "Reference for FormShape: reactive values, errors, flags, control events, and lifecycle."
---

# FormShape

The reactive surface of a form. Produced by `createFormViewModel()` and exposed to consumers through `<View>` (primary) or `useView()` (single-component alternative); descendants pull the shape with `useModel(formViewModel)`.

```ts
interface FormShape<Values> {
  // Aggregate stores
  $values: Store<Values>
  $errors: Store<DeepErrors<Values>>
  $errorPaths: Store<ReadonlyMap<string, string>>
  $isValid: Store<boolean>
  $isDirty: Store<boolean>
  $isTouched: Store<boolean>
  $isValidating: Store<boolean>
  $isSubmitting: Store<boolean>
  $isSubmitted: Store<boolean>
  $isSubmitSuccessful: Store<boolean>
  $submitCount: Store<number>
  $dirtyFields: Store<ReadonlySet<string>>
  $touchedFields: Store<ReadonlySet<string>>
  $validatingFields: Store<ReadonlySet<string>>
  $formError: Store<string | null>
  $disabled: Store<boolean>

  // Control events (EventCallable — invocable)
  submit: EventCallable<void>
  reset: EventCallable<void | null | ResetPayload<Values>>
  resetTo: EventCallable<DeepPartial<Values> | null | undefined>
  setValues: EventCallable<DeepPartial<Values>>
  setValue: EventCallable<SetValuePayload>
  setError: EventCallable<SetErrorPayload>
  setErrors: EventCallable<Record<string, string>>
  clearErrors: EventCallable<void | string | string[]>
  setFormError: EventCallable<string | null>
  validate: EventCallable<void | string | string[]>
  disable: EventCallable<boolean>

  // Lifecycle events (Event — not callable; use .watch / sample)
  submitted: Event<Values>
  rejected: Event<DeepErrors<Values>>
  resetCompleted: Event<Values>

  // Metadata
  readonly __path: readonly (string | number)[]
  readonly kind: "form"

  // Field access (dynamically typed from the contract)
  [fieldName]: Field<T> | FormShape<Sub> | FormArrayShape<Row>
}
```

## Aggregate stores

| Store | Type | Description |
|---|---|---|
| `$values` | `Store<Values>` | Current values for every field, sub-form, and array |
| `$errors` | `Store<DeepErrors<Values>>` | Mirror of values with each leaf replaced by `string \| null` |
| `$errorPaths` | `Store<ReadonlyMap<string, string>>` | Flat map of dotted path → message (only paths with errors) |
| `$isValid` | `Store<boolean>` | `true` when `$errorPaths` is empty |
| `$isDirty` | `Store<boolean>` | `true` when any field is dirty |
| `$isTouched` | `Store<boolean>` | `true` when any field is touched |
| `$isValidating` | `Store<boolean>` | `true` while any async validator is in flight |
| `$isSubmitting` | `Store<boolean>` | True from the start of `submit()` until routing completes |
| `$isSubmitted` | `Store<boolean>` | True after the first `submit()` call (success or fail) |
| `$isSubmitSuccessful` | `Store<boolean>` | True only if the most recent submit succeeded |
| `$submitCount` | `Store<number>` | Incremented on each `submit()` call |
| `$dirtyFields` | `Store<ReadonlySet<string>>` | Dotted paths of currently-dirty fields |
| `$touchedFields` | `Store<ReadonlySet<string>>` | Dotted paths of currently-touched fields |
| `$validatingFields` | `Store<ReadonlySet<string>>` | Paths with async validators running |
| `$formError` | `Store<string \| null>` | Whole-form error (network failure, generic "save failed") |
| `$disabled` | `Store<boolean>` | When `true`, every field's `$disabled` is also `true` |

## Control events

### `submit: EventCallable<void>`

Triggers the submit orchestrator: flips all error visibility, runs every validator, awaits async, routes to `submitted` or `rejected`.

```ts
form.submit()
```

Guarded by `preventDoubleSubmit`: ignored while already submitting.

### `reset: EventCallable<void | null | ResetPayload<Values>>`

Reset field values to defaults. Accepts:

- `undefined` / `null` — reset using VM-level `resetOptions`
- `DeepPartial<Values>` — reset to these values (equivalent to `resetTo`)
- `{ values?, keepOptions? }` — explicit form

```ts
form.reset()                          // defaults
form.reset({ keepOptions: { keepSubmitCount: true } })
form.reset({ values: { email: "a@b.c" } })
```

### `resetTo: EventCallable<DeepPartial<Values> | null | undefined>`

Set `$initial` to the passed values, then snap every field to that. `$dirty` becomes false because `$value === $initial`.

```ts
form.resetTo({ email: user.email, newsletter: true })
```

### `setValues: EventCallable<DeepPartial<Values>>`

Set multiple field values at once without touching `$initial`. Fields become dirty if the new values differ from `$initial`.

```ts
form.setValues({ email: "prefill@example.com" })
```

### `setValue: EventCallable<SetValuePayload>`

```ts
interface SetValuePayload {
  path: string
  value: unknown
}

form.setValue({ path: "contacts.0.phone", value: "+1-555-0100" })
```

### `setError` / `setErrors`

```ts
form.setError({ path: "email", error: "already taken" })
form.setErrors({ email: "taken", username: "too short" })
```

### `clearErrors: EventCallable<void | string | string[]>`

Clear errors by path. With no arg, clears every field error.

```ts
form.clearErrors()
form.clearErrors("email")
form.clearErrors(["email", "username"])
```

### `setFormError: EventCallable<string | null>`

Sets `$formError`. Independent of field errors — does not affect `$isValid`.

### `validate: EventCallable<void | string | string[]>`

Force re-validation. Arg scopes which fields to re-run; no arg runs all.

```ts
form.validate()               // re-run every validator
form.validate("email")        // re-run email's validators only
form.validate(["email", "password"])
```

### `disable: EventCallable<boolean>`

Toggle the form-wide `$disabled` store.

## Lifecycle events

These are `Event<T>`, not callable. Subscribe via `.watch` or `sample`.

| Event | Payload | Fires when |
|---|---|---|
| `submitted` | `Values` | Submit succeeded — validation passed |
| `rejected` | `DeepErrors<Values>` | Submit blocked by validation |
| `resetCompleted` | `Values` | `reset()` or `resetTo()` finished |

```ts
sample({ clock: form.submitted, target: signupFx })
```

## Field access

Fields declared on the contract are exposed directly by name:

```ts
const signupContract = createFormContract()
  .field("email", (f) => f<string>().default(""))
  .sub("address", addressContract)
  .array("phones", phoneContract)

// Access:
form.email           // Field<string>
form.address         // FormShape<Address>
form.phones          // FormArrayShape<Phone>
form.phones.$at(0)   // Store<FormRowShape<Phone> | null>
```

## Metadata

- `__path: readonly (string | number)[]` — path from the root form. Empty array for the top-level form; `["address"]` for a sub-form; `["contacts", 2]` for a row.
- `kind: "form"` — discriminator for runtime type checks.

## See also

| Topic | Link |
|---|---|
| Individual field API | [Field](/reference/forms/field) |
| Array shape | [FormArrayShape](/reference/forms/form-array-shape) |
| Row shape | [FormRowShape](/reference/forms/form-row-shape) |
| Submit flow | [How-to: Handle submission](/how-to/handle-submission) |
| Why errors aren't always visible | [Explanation: Hidden vs visible errors](/explanation/hidden-visible-errors) |
