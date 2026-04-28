---
description: "Reference for createFormContract() and FormContractError."
---

# `createFormContract()` and `FormContractError`

Factory and error class for declaring form contracts. `createFormContract()` returns a fresh [`FormContractChainImpl`](/reference/forms/form-contract-chain). Every chain method validates the entity name against a reserved set and throws `FormContractError` on collisions or malformed names.

## `createFormContract<V>()`

```ts
function createFormContract<V extends Record<string, unknown> = {}>(): FormContractChainImpl
```

Returns an empty `FormContractChainImpl`. The generic `V` is purely advisory — it is **not** enforced on subsequent `.field()` / `.sub()` / `.array()` calls. The chain accumulates its own type via phantom keys as methods are called.

```ts
import { createFormContract } from "@kbml-tentacles/forms"

const contract = createFormContract()
  .field("email", (f) => f<string>().required())
  .field("password", (f) => f<string>().required())
```

| Parameter | Type | Description |
|---|---|---|
| _(generic)_ `V` | `Record<string, unknown>` | Optional advisory type for the final values shape. Used with [`FormContract<V>`](/reference/forms/types) for recursive contracts. |

**Returns** a fresh `FormContractChainImpl<{}, []>` with no fields, no sub-forms, no arrays, and no cross-field validators.

No arguments. Calling it twice produces independent chains.

## Recursive contracts

Self-referential contracts must use a thunk for the recursive entity (`() => contract`), and the variable must be annotated with [`FormContract<V>`](/reference/forms/types) to break TypeScript's circular inference:

```ts
import { createFormContract, type FormContract } from "@kbml-tentacles/forms"

interface CommentValues {
  author: string
  body: string
  replies: CommentValues[]
}

const commentContract: FormContract<CommentValues> = createFormContract<CommentValues>()
  .field("author", (f) => f<string>().required())
  .field("body", (f) => f<string>().required())
  .array("replies", () => commentContract)
```

The thunk is invoked lazily the first time the entity materializes, so forward references compile and run.

## Reserved entity names

`.field()`, `.sub()`, and `.array()` reject any name that collides with the [`FormShape`](/reference/forms/form-shape) / [`FormRowShape`](/reference/forms/form-row-shape) surface. Reserved names:

```
$values         $errors          $errorPaths       $isValid
$isDirty        $isTouched       $isValidating     $isSubmitting
$isSubmitted    $isSubmitSuccessful  $submitCount   $dirtyFields
$touchedFields  $validatingFields    $formError    $disabled
submit          reset            resetTo           setValues
setValue        setError         setErrors         clearErrors
setFormError    validate         disable
submitted       rejected         resetCompleted
__path          __debug          kind
key             index            arrayRef          remove
```

A name is also rejected if it:

- is empty (`""`),
- contains `.` (path separator),
- contains `:` (SID separator).

```ts
createFormContract().field("submit", (f) => f<string>())
//   ^ FormContractError: "submit" is a reserved FormShape key

createFormContract().field("user.name", (f) => f<string>())
//   ^ FormContractError: field name "user.name" must not contain '.' or ':'
```

## `FormContractError`

```ts
class FormContractError extends Error {
  constructor(message: string)
  readonly name: "FormContractError"
}
```

Thrown synchronously during contract construction or [`createFormViewModel()`](/reference/forms/create-form-view-model) when:

- A duplicate entity name is declared on the same chain.
- A reserved name is declared.
- A field name contains `.` or `:`, or is empty.
- `.merge()` finds a colliding name.
- `createFormViewModel()` is called with a `contract` that is not a `FormContractChainImpl`.

The error message is prefixed with `[tentacles/forms]: `.

```ts
import { createFormContract, FormContractError } from "@kbml-tentacles/forms"

try {
  createFormContract()
    .field("email", (f) => f<string>())
    .field("email", (f) => f<string>())
} catch (err) {
  if (err instanceof FormContractError) {
    // err.message === '[tentacles/forms]: field "email" is already declared'
  }
}
```

## Builder shape

The returned chain exposes the following methods (see [`FormContractChainImpl`](/reference/forms/form-contract-chain) for full signatures):

| Method | Purpose |
|---|---|
| [`.field(name, builder)`](/reference/forms/form-contract-chain#field-name-builder) | Declare a leaf field. The `builder` callback receives a [field builder](/reference/forms/field-builder). |
| [`.sub(name, contract)`](/reference/forms/form-contract-chain#sub-name-contract) | Embed a nested form contract. Accepts a contract or thunk. |
| [`.array(name, contract, opts?)`](/reference/forms/form-contract-chain#array-name-contract-opts) | Embed an array of rows. Accepts a contract or thunk. |
| [`.validate(validator)`](/reference/forms/form-contract-chain#validate-validator) | Attach a [cross-field validator](/reference/forms/validators#crossfieldvalidator-v). |
| [`.merge(other)`](/reference/forms/form-contract-chain#merge-other) | Combine entities and cross-validators from another chain. |

The chain has no terminal `.build()` step — pass it directly to [`createFormViewModel({ contract })`](/reference/forms/create-form-view-model).

## See also

- [`FormContractChainImpl`](/reference/forms/form-contract-chain) — full chain reference.
- [`FormFieldBuilder`](/reference/forms/field-builder) — the inner builder passed to `.field()`.
- [`createFormViewModel`](/reference/forms/create-form-view-model) — materialize the contract.
- [`FormContract`](/reference/forms/types) — branded type for variable annotations.
- [`createContract`](/reference/core/create-contract) — the analogous core factory for models.
