---
description: "Use schema libraries (Zod/Yup/Joi/Valibot/Arktype) as validators via small Tentacles adapters."
---

# Use a schema validator

Re-use an existing schema library — Zod, Yup, Joi, Valibot, or Arktype — instead of writing validators by hand. Each library has a dedicated adapter that turns a schema into a validator function you can drop into `.custom()` or any validate method.

| Adapter package | Sync factory | Async factory | Peer dependency |
|---|---|---|---|
| `@kbml-tentacles/forms-zod` | `zod(schema)` | `zodAsync(schema)` | `zod ^3.x` |
| `@kbml-tentacles/forms-yup` | `yup(schema, opts?)` | `yupAsync(schema, opts?)` | `yup ^1.x` |
| `@kbml-tentacles/forms-joi` | `joi(schema)` | `joiAsync(schema)` | `joi ^17.x` |
| `@kbml-tentacles/forms-valibot` | `valibot(schema)` | `valibotAsync(schema)` | `valibot ^0.x` |
| `@kbml-tentacles/forms-arktype` | `arktype(schema)` | — | `arktype ^2.x` |

Install the adapter you need and the matching schema library yourself — none are bundled. Every adapter returns a `CustomValidator<T>` (sync) or `CustomAsyncValidator<T>` (async), so the integration point is always `.custom()` or `.validateAsync()`.

## Zod

Zod is the most common choice for TypeScript projects. Plug it into a single field with `zod(schema)`:

```ts
import { z } from "zod"
import { zod, zodAsync } from "@kbml-tentacles/forms-zod"
import { createFormContract } from "@kbml-tentacles/forms"

const SignupContract = createFormContract()
  .field("email", (f) => f<string>()
    .default("")
    .custom(zod(z.string().email("Enter a valid email"))))
  .field("age", (f) => f<number>()
    .default(18)
    .custom(zod(z.number().int().min(13, "Too young"))))
```

`zod(schema)` reads the schema's `.parse()` result; failures become `ValidationIssue[]` preserving the path Zod returns. That means a nested-object schema surfaces errors at the right sub-paths — `z.object({ address: z.object({ zip: z.string().min(5) }) })` plugged into a top-level `.custom()` writes to `address.zip`, not to the parent.

Use `zodAsync(schema)` when your schema uses `.refine(async …)` or `.superRefine(async …)`. Since async refinements are only evaluated by `parseAsync`, the sync adapter cannot see them.

```ts
.custom(zodAsync(z.string().email().refine(
  async (email) => !(await isBanned(email)),
  { message: "This email is not allowed" },
)))
```

Pick the sync variant whenever you can — it is cheaper and synchronous validators run before async ones, giving faster feedback.

## Yup

Yup has a dual-world API — its sync runtime is best-effort and falls back to async for transforms. The adapter exposes both explicitly.

```ts
import * as Y from "yup"
import { yup, yupAsync } from "@kbml-tentacles/forms-yup"

const schema = Y.object({
  email: Y.string().email().required(),
  age: Y.number().min(13).required(),
})

const ProfileContract = createFormContract()
  .field("profile", (f) => f<{ email: string; age: number }>()
    .default({ email: "", age: 18 })
    .custom(yup(schema, { abortEarly: false })),
  )
```

The optional second argument is `{ abortEarly?: boolean }`. With `abortEarly: true` (the Yup default), validation stops at the first failure per schema — useful for simple schemas where you want the "first message wins" behaviour even inside `criteriaMode: "all"`. Flip it to `false` when the schema has `oneOf` / `anyOf` composition and you want every violation.

```ts
// Async — needed for .test(async …)
.custom(yupAsync(schema, { abortEarly: false }))
```

## Joi

Joi's `validate()` always collects errors (its internal `abortEarly` defaults to `true`, but the adapter forces `false`), so you always see every problem per call.

```ts
import Joi from "joi"
import { joi, joiAsync } from "@kbml-tentacles/forms-joi"

const schema = Joi.object({
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(13).required(),
})

const Form = createFormContract()
  .field("account", (f) => f<{ email: string; age: number }>()
    .default({ email: "", age: 0 })
    .custom(joi(schema)))
```

The async counterpart `joiAsync(schema)` is only needed when the schema uses `Joi.custom(async …)` handlers. Joi has no sync-vs-async schema split — in practice, reach for `joiAsync` if and only if your schema contains an async custom validator. Otherwise `joi(schema)` is enough.

## Valibot

Valibot produces the smallest bundle of the four libraries and has a functional API. The adapter hides the `safeParse` / `safeParseAsync` split:

```ts
import * as v from "valibot"
import { valibot, valibotAsync } from "@kbml-tentacles/forms-valibot"

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  age:   v.pipe(v.number(), v.minValue(13)),
})

const Form = createFormContract()
  .field("account", (f) => f<{ email: string; age: number }>()
    .default({ email: "", age: 0 })
    .custom(valibot(schema)))
```

Use `valibotAsync(schema)` for schemas that include `v.checkAsync()`. Valibot's issue paths are preserved — a nested failure writes to the correct sub-path just like Zod.

## Arktype

Arktype is sync-only. The adapter exposes a single `arktype(schema)` factory.

```ts
import { type } from "arktype"
import { arktype } from "@kbml-tentacles/forms-arktype"

const user = type({
  email: "string.email",
  age: "number >= 13",
})

const Form = createFormContract()
  .field("account", (f) => f<{ email: string; age: number }>()
    .default({ email: "", age: 0 })
    .custom(arktype(user)))
```

If your rules need async checks, reach for a different adapter or pair `arktype()` with a separate `.validateAsync()` handler on the same field.

## Validate the whole form against one schema

All adapters return functions suitable for chain-level `.validate()` too. Use this when a single schema describes the entire payload and you prefer a central definition to per-field declarations.

```ts
import { z } from "zod"
import { zod } from "@kbml-tentacles/forms-zod"
import { createFormContract } from "@kbml-tentacles/forms"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, {
  message: "Passwords differ",
  path: ["confirmPassword"],
})

const SignupContract = createFormContract()
  .field("email",           (f) => f<string>().default(""))
  .field("password",        (f) => f<string>().default(""))
  .field("confirmPassword", (f) => f<string>().default(""))
  .validate(zod(schema))
```

The chain-level `.validate()` runs after every field-level validator, exactly like a hand-written cross-field validator — see [Cross-field validation](/how-to/cross-field-validation) for the interaction rules. Paths returned by the schema resolve against the root values, so `path: ["confirmPassword"]` lands on that specific field.

## Mix and match

You are not forced to pick one approach per form. A common pattern:

- Use a schema validator for "structural" rules (types, required, length).
- Write a hand-rolled `.validate()` for cross-field or server-driven logic.
- Use `.validateAsync()` for network checks the schema cannot express.

```ts
createFormContract()
  .field("email", (f) => f<string>()
    .default("")
    .custom(zod(z.string().email()))            // structural
    .validateAsync(checkUniqueEmail, { debounce: 300 })) // network

  .field("password",        (f) => f<string>().default("").required())
  .field("confirmPassword", (f) => f<string>()
    .default("")
    .required()
    .dependsOn(["password"])
    .validate((v, ctx) => v === ctx.values.password ? null : "Passwords differ"))
```

Nothing special happens at the intersection — adapters simply return validator functions, so they compose with every other validation primitive.

## Which adapter do I pick?

| You value… | Adapter |
|---|---|
| Smallest install, functional style | `@kbml-tentacles/forms-valibot` |
| Best TypeScript inference and ecosystem | `@kbml-tentacles/forms-zod` |
| Existing schemas from an older project | `@kbml-tentacles/forms-yup` |
| Backend parity with a Node service already on Joi | `@kbml-tentacles/forms-joi` |
| Type-first authoring with zero runtime duplication | `@kbml-tentacles/forms-arktype` |

Most projects do well with Zod. Switch only when the answer above is clearly "yes" — migrating schemas later is mostly mechanical because every adapter emits the same `ValidationIssue[]` shape.

## Peer-dependency notes

Every adapter lists its schema library as a `peerDependency` — you install the one you actually use. The adapters are thin (~1–3 KB each) because the heavy lifting stays inside the schema library.

```bash
npm install @kbml-tentacles/forms-zod zod
npm install @kbml-tentacles/forms-yup yup
npm install @kbml-tentacles/forms-joi joi
npm install @kbml-tentacles/forms-valibot valibot
npm install @kbml-tentacles/forms-arktype arktype
```

No hidden upgrade coupling — you can move between major versions of the schema library without waiting for a Tentacles release, as long as the adapter's peer range allows it.

## See also

| Page | What it covers |
|---|---|
| [Add sync validation](/how-to/add-sync-validation) | Native `.validate()` / `.custom()` / `.warn()` |
| [Add async validation](/how-to/add-async-validation) | Debouncing, abort signals, network errors |
| [Cross-field validation](/how-to/cross-field-validation) | Chain-level `.validate(values => …)` |
| [Field builder reference](/reference/forms/field-builder) | `.custom()` signature and `ValidationIssue` shape |
