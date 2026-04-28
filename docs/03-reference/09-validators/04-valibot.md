---
description: "Valibot adapter: @kbml-tentacles/forms-valibot — adapter for Valibot schemas. Exports valibot() (sync) and valibotAsync() (async)."
---

# Valibot adapter

`@kbml-tentacles/forms-valibot` — adapter for [Valibot](https://valibot.dev) schemas. Exports `valibot()` (sync) and `valibotAsync()` (async).

Valibot is a modular, tree-shakable schema library — its core bundle is an order of magnitude smaller than Zod, making it attractive for client-side forms.

## Install

```bash
yarn add valibot @kbml-tentacles/forms-valibot
```

Peer dependency: Valibot 1.x.

## `valibot(schema)`

Sync adapter. Internally calls `safeParse(schema, value)`.

```ts
function valibot<T>(schema: unknown): CustomValidator<T>
```

```ts
import * as v from "valibot"
import { valibot } from "@kbml-tentacles/forms-valibot"

const Email = v.pipe(
  v.string(),
  v.email("Invalid email"),
  v.minLength(1, "Required"),
)

.field("email", (f) =>
  f<string>().default("").custom(valibot(Email)),
)
```

## `valibotAsync(schema)`

Async adapter. Internally calls `await safeParseAsync(schema, value)`. Use when the schema has `checkAsync` or any other async pipeline step.

```ts
function valibotAsync<T>(schema: unknown): CustomAsyncValidator<T>
```

```ts
import * as v from "valibot"
import { valibotAsync } from "@kbml-tentacles/forms-valibot"

const UniqueUsername = v.pipeAsync(
  v.string(),
  v.checkAsync(async (value) => {
    const res = await fetch(`/api/check?name=${value}`)
    const { available } = await res.json()
    return available
  }, "Username taken"),
)

.field("username", (f) =>
  f<string>()
    .default("")
    .validateAsync(valibotAsync(UniqueUsername), { debounce: 300 }),
)
```

`ctx.signal.aborted` is re-checked after the promise settles — if a newer input has started, the result is discarded.

## Object schemas

Attach at the form level via cross-field `.validate()`:

```ts
import * as v from "valibot"
import { valibot } from "@kbml-tentacles/forms-valibot"

const Signup = v.pipe(
  v.object({
    email: v.pipe(v.string(), v.email()),
    password: v.pipe(v.string(), v.minLength(8)),
    confirmPassword: v.string(),
  }),
  v.forward(
    v.partialCheck(
      [["password"], ["confirmPassword"]],
      (input) => input.password === input.confirmPassword,
      "Must match",
    ),
    ["confirmPassword"],
  ),
)

createFormContract()
  .field("email", (f) => f<string>().default(""))
  .field("password", (f) => f<string>().default(""))
  .field("confirmPassword", (f) => f<string>().default(""))
  .validate(valibot(Signup))
```

## Error mapping

For every issue in `result.issues`, the adapter emits:

```ts
{
  path: issue.path?.map((p) => p.key) ?? [],
  message: issue.message,
}
```

Valibot's `path` is a stack of `{ key }` nodes — the adapter maps them to the simple `(string | number)[]` shape used by form error routing. No `code` field is emitted by the adapter.

## Use Valibot when

- You're bundling for the browser and size matters. Valibot's tree-shakable design means you only pay for what you import.
- You want a TypeScript-first API without Zod's runtime class hierarchy.
- You're comfortable with the pipeline style (`v.pipe(schema, action1, action2)`) rather than the chain style (`schema.email().min(1)`).

## Differences from Zod/Yup

- Valibot schemas are plain functions, not classes — smaller runtime footprint.
- Pipeline-based APIs read more like functional composition.
- Type inference is equivalent to Zod.
- No built-in `code` / `type` field on issues — if you need error codes for i18n, attach them via custom messages or wrap the adapter.

## See also

| Topic | Link |
|---|---|
| Validator adapter interface | [Validators](/reference/forms/validators) |
| Using schema validators | [How-to: Use a schema validator](/how-to/use-schema-validator) |
| Async scheduling | [How-to: Add async validation](/how-to/add-async-validation) |
| Sibling adapters | [Zod](/reference/validators/zod), [Yup](/reference/validators/yup), [Joi](/reference/validators/joi), [Arktype](/reference/validators/arktype) |
