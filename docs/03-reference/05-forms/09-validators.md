---
description: "Validators: The validator interface, context, and result shapes used by every validation path in @kbml-tentacles/forms."
---

# Validators

The validator interface, context, and result shapes used by every validation path in `@kbml-tentacles/forms`.

## The interface

Every validator — whether written inline with `.validate(fn)`, adapted from a schema library via `.custom(adapter(schema))`, or attached as a cross-field rule — ultimately conforms to one of these:

```ts
interface CustomValidator<T> {
  readonly __type: "form-validator"
  readonly async: false
  validate(value: T, ctx: ValidatorCtx): ValidationResult
}

interface CustomAsyncValidator<T> {
  readonly __type: "form-validator"
  readonly async: true
  validate(value: T, ctx: ValidatorCtx): Promise<ValidationResult>
}
```

The runtime dispatches sync vs async based on the `async: boolean` flag — no function-shape sniffing.

## Function-shape validators

`.validate()` and `.validateAsync()` accept plain functions:

```ts
type SyncFieldValidator<T> = (value: T, ctx: ValidatorCtx) => ValidationResult
type AsyncFieldValidator<T> = (value: T, ctx: ValidatorCtx) => Promise<ValidationResult>

type FieldValidator<T> = SyncFieldValidator<T> | AsyncFieldValidator<T>
```

The runtime wraps these into `CustomValidator` / `CustomAsyncValidator` internally.

## `ValidatorCtx`

```ts
interface ValidatorCtx<Values = unknown> {
  readonly values: Values
  readonly rootValues: unknown
  readonly path: readonly (string | number)[]
  readonly signal: AbortSignal
}
```

| Field | What it holds |
|---|---|
| `values` | Values at the *current scope* — for a field validator, the field's value; for a sub-form validator, the sub's values; for a cross-field validator on the root, the root values |
| `rootValues` | Full form values, regardless of scope |
| `path` | Where this validator is attached — e.g. `["address", "city"]` |
| `signal` | `AbortSignal` — for async validators, check `signal.aborted` before returning |

### Using `signal` in async validators

```ts
.field("username", (f) =>
  f<string>()
    .validateAsync(async (value, ctx) => {
      const res = await fetch(`/api/check?name=${value}`, { signal: ctx.signal })
      if (ctx.signal.aborted) return null
      const { available } = await res.json()
      return available ? null : "Already taken"
    }, { debounce: 300 }),
)
```

If the user types another keystroke before the request returns, the previous signal aborts — both the network request and the result handling are cancelled cleanly.

## `ValidationResult`

```ts
type ValidationResult = null | string | string[] | ValidationIssue[]
```

| Variant | Meaning |
|---|---|
| `null` | Pass — no error |
| `string` | One error, attached to the current `ctx.path` |
| `string[]` | Multiple errors on the current path (collapsed to the first by default, all with `criteriaMode: "all"`) |
| `ValidationIssue[]` | Multiple errors at explicit paths — for cross-field / multi-field validators |

## `ValidationIssue`

```ts
interface ValidationIssue {
  readonly path: readonly (string | number)[]
  readonly message: string
  readonly code?: string
}
```

Emit a `ValidationIssue[]` when one validator needs to surface errors across several fields:

```ts
createFormContract()
  .field("password", (f) => f<string>().default(""))
  .field("confirmPassword", (f) => f<string>().default(""))
  .validate((values) =>
    values.password === values.confirmPassword
      ? null
      : [{ path: ["confirmPassword"], message: "Passwords do not match" }],
  )
```

`code` is free-form and kept through the pipeline — use it for i18n keys or analytics.

## `CrossFieldValidator`

```ts
type CrossFieldValidator<V> = (
  values: V,
  ctx: ValidatorCtx<V>,
) => ValidationResult | Promise<ValidationResult>
```

Attached with `.validate()` at the chain level (distinct from `.validate(fn)` on a field). Receives the values object at that scope and the same `ValidatorCtx`.

Returning a `string` attaches the error to the *form* (it populates `$formError`). Returning `ValidationIssue[]` attaches errors to specific fields.

## Pre-made adapters

Instead of writing validators by hand, use a schema library with an adapter:

| Adapter | Package | Exports |
|---|---|---|
| Zod | `@kbml-tentacles/forms-zod` | `zod`, `zodAsync` |
| Yup | `@kbml-tentacles/forms-yup` | `yup`, `yupAsync` |
| Joi | `@kbml-tentacles/forms-joi` | `joi`, `joiAsync` |
| Valibot | `@kbml-tentacles/forms-valibot` | `valibot`, `valibotAsync` |
| Arktype | `@kbml-tentacles/forms-arktype` | `arktype` (sync-only) |

```ts
import { z } from "zod"
import { zod } from "@kbml-tentacles/forms-zod"

.field("email", (f) =>
  f<string>().default("").custom(zod(z.string().email())),
)
```

Each adapter call produces a `CustomValidator<T>` or `CustomAsyncValidator<T>`; plug into `.custom(...)`.

## Writing your own adapter

The interface is tiny — a 15-line custom adapter is realistic:

```ts
import type { CustomValidator, ValidationIssue } from "@kbml-tentacles/forms"

export function myValidator<T>(schema: MySchema<T>): CustomValidator<T> {
  return {
    __type: "form-validator",
    async: false,
    validate(value, ctx) {
      const result = schema.check(value)
      if (result.ok) return null
      return result.errors.map<ValidationIssue>((e) => ({
        path: e.pathSegments,
        message: e.msg,
      }))
    },
  }
}
```

## See also

| Topic | Link |
|---|---|
| Using a schema validator | [How-to: Use a schema validator](/how-to/use-schema-validator) |
| Async scheduling | [How-to: Add async validation](/how-to/add-async-validation) |
| Individual adapters | [Zod](/reference/validators/zod), [Yup](/reference/validators/yup), [Joi](/reference/validators/joi), [Valibot](/reference/validators/valibot), [Arktype](/reference/validators/arktype) |
| When results become visible | [Validation modes](/reference/forms/validation-modes) |
| Design of the adapter layer | [Explanation: Validator adapter design](/explanation/validator-adapter-design) |
