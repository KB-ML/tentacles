---
description: "Reference index of exported @kbml-tentacles/forms TypeScript types."
---

# Types

Supporting types exported from `@kbml-tentacles/forms`. Refer to [FormShape](/reference/forms/form-shape), [Field](/reference/forms/field), [FormArrayShape](/reference/forms/form-array-shape), [FormRowShape](/reference/forms/form-row-shape), and [Validators](/reference/forms/validators) for the primary runtime shapes.

## `KeepStateOptions`

```ts
interface KeepStateOptions {
  keepValues?: boolean
  keepDirty?: boolean
  keepErrors?: boolean
  keepTouched?: boolean
  keepSubmitCount?: boolean
  keepIsSubmitted?: boolean
  keepIsSubmitSuccessful?: boolean
  keepDisabled?: boolean
}
```

Used in two places:

- `createFormViewModel({ resetOptions })` — defaults applied to every reset.
- `form.reset({ keepOptions })` — override at call time.

| Field | Preserves |
|---|---|
| `keepValues` | Current `$value` on every field |
| `keepDirty` | `$dirty` flags |
| `keepErrors` | `$error` + visibility state |
| `keepTouched` | `$touched` flags |
| `keepSubmitCount` | `$submitCount` |
| `keepIsSubmitted` | `$isSubmitted` |
| `keepIsSubmitSuccessful` | `$isSubmitSuccessful` |
| `keepDisabled` | `$disabled` states |

## `ResetPayload<V>`

```ts
type ResetPayload<V> =
  | DeepPartial<V>
  | { values?: DeepPartial<V>; keepOptions?: KeepStateOptions }
```

The argument accepted by `form.reset(...)`. Plain `DeepPartial<V>` is sugar for `{ values: …, keepOptions: {} }`.

## `SetValuePayload`

```ts
interface SetValuePayload {
  path: string
  value: unknown
}
```

Argument for `form.setValue({ path, value })`. Paths use dot notation (`"address.city"`) or array indices (`"contacts.0.phone"`).

## `SetErrorPayload`

```ts
interface SetErrorPayload {
  path: string
  error: string | null
}
```

Argument for `form.setError({ path, error })`. `null` clears the error at that path.

## `SetFieldValuePayload<T>`

```ts
type SetFieldValuePayload<T> =
  | T
  | {
      value: T
      shouldValidate?: boolean
      shouldTouch?: boolean
      shouldDirty?: boolean
    }
```

Argument for `field.setValue(...)`. The object form lets you control side effects — e.g., set a value without touching the field.

## `DeepPartial<T>`

Recursive partial — every object leaf becomes optional:

```ts
type DeepPartial<T> = T extends Primitive ? T : {
  [K in keyof T]?: DeepPartial<T[K]>
}
```

Arrays are kept as arrays with `DeepPartial` elements.

## `DeepErrors<T>`

Mirror of `T` with every leaf replaced by `string | null`:

```ts
type DeepErrors<T> = T extends Primitive
  ? string | null
  : T extends Array<infer U>
    ? ReadonlyArray<DeepErrors<U> | null>
    : { [K in keyof T]?: DeepErrors<T[K]> }
```

Used in `$errors` and in `rejected` event payloads.

## `FormArrayOptions`

```ts
interface FormArrayOptions {
  min?: number
  max?: number
  key?: string | ((row: unknown) => string)
}
```

Passed as the third argument to `.array(name, contract, opts?)`.

- `min` / `max` — row count constraints. Violations populate `$arrayError`.
- `key` — stable row identifier. Either a string (field name on the row) or a function. Used by `removeKey` and by `<Each>` for React/Vue/Solid list keys.

## `ExtractValues<C>`

Type helper — extracts the values shape from a `FormContractChainImpl`:

```ts
import type { ExtractValues } from "@kbml-tentacles/forms"

const signupContract = createFormContract()
  .field("email", (f) => f<string>().default(""))
  .field("age", (f) => f<number>().default(0))

type SignupValues = ExtractValues<typeof signupContract>
// { email: string; age: number }
```

## `InferFieldsFromChain<C>`

Alias for the internal `Fields` type parameter of a chain. Useful when typing a helper that takes "any form contract":

```ts
function processContract<C extends FormContractChainImpl<any, any>>(
  contract: C,
  values: InferFieldsFromChain<C>,
) { /* ... */ }
```

## `FormContract<V>`

A branded alias for a finalized contract:

```ts
type FormContract<V> = FormContractChainImpl<V, any>
```

Use when you want to type a variable that holds a contract without exposing the full generic:

```ts
const signupContract: FormContract<SignupValues> = createFormContract()
  .field("email", (f) => f<string>().default(""))
```

## `FormContractError`

Thrown on contract construction errors (duplicate field name, reserved name, invalid characters, empty names). Extends `Error`.

```ts
try {
  createFormContract()
    .field("submit", (f) => f<string>())  // "submit" is reserved
} catch (e) {
  if (e instanceof FormContractError) {
    // handle
  }
}
```

## See also

| Topic | Link |
|---|---|
| Where these types show up | [FormShape](/reference/forms/form-shape), [Field](/reference/forms/field) |
| Reset semantics | [How-to: Reset and keep state](/how-to/reset-and-keep-state) |
| Reserved names and validation rules | [createFormContract](/reference/forms/create-form-contract) |
