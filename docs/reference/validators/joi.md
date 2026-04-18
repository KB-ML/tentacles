# Joi adapter

`@kbml-tentacles/forms-joi` — adapter for [Joi](https://joi.dev) schemas. Exports `joi()` (sync) and `joiAsync()` (async).

## Install

```bash
yarn add joi @kbml-tentacles/forms-joi
```

Peer dependency: Joi 17.x.

## `joi(schema)`

Sync adapter. Internally calls `schema.validate(value, { abortEarly: false })`.

```ts
function joi<T>(schema: unknown): CustomValidator<T>
```

```ts
import Joi from "joi"
import { joi } from "@kbml-tentacles/forms-joi"

.field("email", (f) =>
  f<string>()
    .default("")
    .custom(joi(Joi.string().email().required().messages({
      "string.email": "Invalid email",
      "any.required": "Required",
    }))),
)
```

Joi runs synchronously regardless of the flag — the Joi sync path is the default for non-external rules.

## `joiAsync(schema)`

Async adapter. Internally calls `await schema.validateAsync(value, { abortEarly: false })`. Required when the Joi schema contains `.external()` rules (promise-returning validators).

```ts
function joiAsync<T>(schema: unknown): CustomAsyncValidator<T>
```

```ts
import Joi from "joi"
import { joiAsync } from "@kbml-tentacles/forms-joi"

const uniqueUsername = Joi.string().external(async (value) => {
  const res = await fetch(`/api/check?name=${value}`)
  const { available } = await res.json()
  if (!available) throw new Error("Username taken")
  return value
})

.field("username", (f) =>
  f<string>()
    .default("")
    .validateAsync(joiAsync(uniqueUsername), { debounce: 300 }),
)
```

The adapter checks `ctx.signal.aborted` after the promise settles — stale responses are dropped when the user types again mid-flight.

## Object schemas

Attach at the form level via cross-field `.validate()`:

```ts
import Joi from "joi"
import { joi } from "@kbml-tentacles/forms-joi"

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref("password"))
    .required()
    .messages({ "any.only": "Must match" }),
})

createFormContract()
  .field("email", (f) => f<string>().default(""))
  .field("password", (f) => f<string>().default(""))
  .field("confirmPassword", (f) => f<string>().default(""))
  .validate(joi(signupSchema))
```

## Error mapping

The adapter maps each entry in `error.details` to a `ValidationIssue`:

```ts
{
  path: d.path,       // already an array: ["address", "city"]
  message: d.message,
  code: d.type,       // e.g. "string.email", "any.required"
}
```

Joi's `path` is already a `(string | number)[]`, so no splitting is needed. `code` is Joi's rule `type` — useful as an i18n key.

## `abortEarly` is forced to `false`

Unlike the Yup adapter, the Joi adapter does not expose `abortEarly`. It is always `false`. Reason: per-field validators usually receive a single value, so short-circuiting saves nothing, and object-level validations benefit more from collecting all errors at once.

If you need early termination, build it into the schema itself (Joi's `.error()` throws can short-circuit).

## Custom messages

Joi's `.messages({ ... })` is the only way to customize error text — the adapter passes whatever Joi emits through verbatim.

```ts
Joi.string().min(8).messages({ "string.min": "Password must be at least 8 chars" })
```

## Differences from Zod/Yup

- Joi is the most featureful runtime validator — `ref`, `when`, `alternatives`, `extension` — but its types are weakly inferred (`unknown` out).
- Joi runs in Node-first environments; bundle size is large for browser forms. If bundle matters, prefer Zod or Valibot.
- No TypeScript-first inference — you'll often declare the value type separately from the schema.

## See also

| Topic | Link |
|---|---|
| Validator adapter interface | [Validators](/reference/forms/validators) |
| Using schema validators | [How-to: Use a schema validator](/how-to/use-schema-validator) |
| Async scheduling | [How-to: Add async validation](/how-to/add-async-validation) |
| Sibling adapters | [Zod](/reference/validators/zod), [Yup](/reference/validators/yup), [Valibot](/reference/validators/valibot), [Arktype](/reference/validators/arktype) |
