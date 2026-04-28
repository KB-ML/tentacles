---
description: "Field: The reactive surface of a single form field, materialized per field declared on a createFormContract()."
---

# Field

The reactive surface of a single form field, materialized per field declared on a `createFormContract()`.

```ts
interface Field<T> {
  // Stores
  $value: Store<T>
  $default: Store<T>
  $initial: Store<T>
  $error: Store<string | null>
  $warning: Store<string | null>
  $dirty: Store<boolean>
  $touched: Store<boolean>
  $validating: Store<boolean>
  $disabled: Store<boolean>

  // User actions
  changed: EventCallable<T>
  blurred: EventCallable<void>

  // Imperative control
  setValue: EventCallable<SetFieldValuePayload<T>>
  setError: EventCallable<string | null>
  setWarning: EventCallable<string | null>
  reset: EventCallable<void>
  resetTo: EventCallable<T>
  validate: EventCallable<void>

  // Metadata
  readonly __path: readonly (string | number)[]
  readonly __transform?: {
    parse: (domValue: unknown) => T
    format: (value: T) => unknown
  }
  readonly kind: "field"
}
```

## Stores

| Store | Type | Description |
|---|---|---|
| `$value` | `Store<T>` | Current value |
| `$default` | `Store<T>` | Contract-declared default (target of `field.reset()`) |
| `$initial` | `Store<T>` | Current "baseline" — what `$dirty` compares against. Updated by `resetTo` |
| `$error` | `Store<string \| null>` | Visible error — `null` while hidden (see [validation modes](/reference/forms/validation-modes)) |
| `$warning` | `Store<string \| null>` | Non-blocking message from `.warn(...)` |
| `$dirty` | `Store<boolean>` | `!deepEqual($value, $initial)` |
| `$touched` | `Store<boolean>` | Flipped true on `blurred` |
| `$validating` | `Store<boolean>` | True while async validators for this field are running |
| `$disabled` | `Store<boolean>` | Field-level disable state |

## User actions

### `changed: EventCallable<T>`

Called by input widgets on every value change. Flips `$value`, re-evaluates validators (subject to `reValidateOn`), clears the "hidden" error flag once visible.

```ts
<input onChange={(e) => field.changed(e.target.value)} />
```

### `blurred: EventCallable<void>`

Called when the input loses focus. Flips `$touched`, runs validators if `validateOn: "blur"` or `"touched"`, and (once the field has an error) may show it depending on mode.

## Imperative control

### `setValue: EventCallable<SetFieldValuePayload<T>>`

```ts
type SetFieldValuePayload<T> =
  | T
  | {
      value: T
      shouldValidate?: boolean  // trigger validation after set
      shouldTouch?: boolean     // flip $touched
      shouldDirty?: boolean     // force $dirty (normally derived)
    }

field.setValue("alice@example.com")
field.setValue({ value: "alice@example.com", shouldValidate: true })
```

Same target as `changed`, but with fine-grained control over side effects. Use for programmatic updates that should not behave like user input.

### `setError: EventCallable<string | null>`

Directly set `$error`. Pass `null` to clear. Bypasses validation — the next validator run can overwrite it.

```ts
field.setError("server says: already taken")
```

### `setWarning: EventCallable<string | null>`

Directly set `$warning`. Unlike errors, warnings are always visible (no mode gating).

### `reset: EventCallable<void>`

Restore to `$default`. Clears `$dirty`, `$touched`, `$error`, `$warning`.

### `resetTo: EventCallable<T>`

Set `$initial` and `$value` to the passed value. `$dirty` becomes false.

```ts
field.resetTo("new-default@example.com")
```

### `validate: EventCallable<void>`

Re-run this field's validators (sync + async). Useful after a dependency changes without using `.dependsOn()`.

## Metadata

### `__path: readonly (string | number)[]`

The field's location relative to the form root. Used by `setValue({ path, value })` and by framework adapters.

```ts
form.email.__path           // ["email"]
form.address.city.__path    // ["address", "city"]
form.contacts[0].phone.__path   // ["contacts", 0, "phone"]   (row-shape field)
```

### `__transform?: { parse, format }`

Present if the contract declared `.transform({ parse, format })`. Framework adapters read this to bridge DOM strings and typed values:

```ts
.field("age", (f) =>
  f<number>()
    .default(0)
    .transform({
      parse: (s: string) => Number(s),
      format: (n: number) => String(n),
    }),
)
```

`useField` from a framework adapter applies the transform automatically inside `register()`.

### `kind: "field"`

Discriminator for runtime type checks (distinguishes from `"form"`, `"array"`).

## `$default` vs `$initial` — when they differ

- `$default` — set once from the contract's `.default(v)` call. Never changes unless you change the contract.
- `$initial` — starts equal to `$default`, then updated by `resetTo(value)` or by the top-level `form.resetTo(values)`.

This split lets `reset()` return to the contract's declared default while `$dirty` tracks "different from what the user started editing".

## See also

| Topic | Link |
|---|---|
| The field builder that produces `Field<T>` | [Field builder](/reference/forms/field-builder) |
| How the form exposes fields | [FormShape](/reference/forms/form-shape) |
| Framework binding helpers | [useField (React)](/reference/forms-react/use-field), [useField (Vue)](/reference/forms-vue/use-field), [useField (Solid)](/reference/forms-solid/use-field) |
