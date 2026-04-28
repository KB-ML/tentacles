---
description: "Yup adapter: @kbml-tentacles/forms-yup — adapter for Yup schemas. Exports yup() (sync) and yupAsync() (async)."
---

# Yup adapter

`@kbml-tentacles/forms-yup` — adapter for [Yup](https://github.com/jquense/yup) schemas. Exports `yup()` (sync) and `yupAsync()` (async).

## Install

```bash
yarn add yup @kbml-tentacles/forms-yup
```

Peer dependency: any 1.x Yup version.

## `yup(schema, opts?)`

Sync adapter. Internally calls `schema.validateSync(value, { abortEarly })`.

```ts
function yup<T>(schema: unknown, opts?: { abortEarly?: boolean }): CustomValidator<T>
```

| Param | Default | Notes |
|---|---|---|
| `schema` | — | Any Yup schema: `string()`, `number()`, `object({...})`, etc. |
| `opts.abortEarly` | `false` | When `false`, Yup collects every failure; when `true`, it stops at the first |

```ts
import { string } from "yup"
import { yup } from "@kbml-tentacles/forms-yup"

.field("email", (f) =>
  f<string>()
    .default("")
    .custom(yup(string().email("Invalid email").required("Required"))),
)
```

## `yupAsync(schema, opts?)`

Async adapter. Internally calls `await schema.validate(value, { abortEarly })`. Use for Yup schemas that contain `.test()` callbacks returning promises.

```ts
function yupAsync<T>(schema: unknown, opts?: { abortEarly?: boolean }): CustomAsyncValidator<T>
```

```ts
import { string } from "yup"
import { yupAsync } from "@kbml-tentacles/forms-yup"

const uniqueUsername = string().test(
  "unique",
  "Taken",
  async (value) => {
    const res = await fetch(`/api/check?name=${value}`)
    const { available } = await res.json()
    return available
  },
)

.field("username", (f) =>
  f<string>()
    .default("")
    .validateAsync(yupAsync(uniqueUsername), { debounce: 300 }),
)
```

`ctx.signal` is checked after the promise settles — if the validator raced with a newer keystroke, the result is discarded.

## Object schemas

Attach at the form level via a cross-field `.validate()`:

```ts
import { object, string, ref } from "yup"
import { yup } from "@kbml-tentacles/forms-yup"

const signupSchema = object({
  email: string().email().required(),
  password: string().min(8).required(),
  confirmPassword: string()
    .oneOf([ref("password")], "Must match")
    .required(),
})

createFormContract()
  .field("email", (f) => f<string>().default(""))
  .field("password", (f) => f<string>().default(""))
  .field("confirmPassword", (f) => f<string>().default(""))
  .validate(yup(signupSchema))
```

Each Yup inner error's `path` (`"confirmPassword"`, `"address.city"`) is split on `.` and attached as a `ValidationIssue` at the matching form field.

## Error mapping

For every Yup `ValidationError.inner`, the adapter emits:

```ts
{
  path: err.path ? err.path.split(".") : [],
  message: err.message,
  code: err.type,     // e.g. "required", "email", "min"
}
```

`code` mirrors Yup's `type` — useful for i18n lookup.

## `abortEarly` trade-offs

| Setting | Behavior | Use when |
|---|---|---|
| `false` (default) | All errors collected and mapped to their paths | You want to show every mistake at once (typical forms) |
| `true` | First error only | Large schemas where validation is expensive; single-field feedback |

The per-field `.validate(yup(...))` path usually validates just one value, so `abortEarly` barely matters at the field level. It's relevant for object schemas attached via cross-field `.validate()`.

## Differences from Zod/Valibot

- Yup's error object is flat (`err.inner`), not tree-shaped — easier to map but loses nested structure.
- Yup supports `.test()` for ad-hoc custom rules, which integrate directly through `yupAsync`.
- No discriminated unions — for narrow types, Zod or Valibot are a better fit.

## See also

| Topic | Link |
|---|---|
| Validator adapter interface | [Validators](/reference/forms/validators) |
| Using schema validators | [How-to: Use a schema validator](/how-to/use-schema-validator) |
| Async scheduling | [How-to: Add async validation](/how-to/add-async-validation) |
| Sibling adapters | [Zod](/reference/validators/zod), [Joi](/reference/validators/joi), [Valibot](/reference/validators/valibot), [Arktype](/reference/validators/arktype) |
