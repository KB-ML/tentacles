---
description: "Reference for @kbml-tentacles/forms-arktype: use Arktype schemas as Tentacles validators."
---

# Arktype adapter

`@kbml-tentacles/forms-arktype` — adapter for [Arktype](https://arktype.io) schemas. Exports `arktype()` only — Arktype has no async pipeline, so the adapter is sync-only.

## Install

```bash
yarn add arktype @kbml-tentacles/forms-arktype
```

Peer dependency: Arktype 2.x.

## `arktype(schema)`

Sync adapter. Arktype schemas are callable — the adapter invokes `schema(value)` and inspects the result for the Arktype errors sentinel.

```ts
function arktype<T>(schema: unknown): CustomValidator<T>
```

```ts
import { type } from "arktype"
import { arktype } from "@kbml-tentacles/forms-arktype"

const Email = type("string.email")

.field("email", (f) =>
  f<string>().default("").custom(arktype(Email)),
)
```

## Object schemas

Attach at the form level via cross-field `.validate()`:

```ts
import { type } from "arktype"
import { arktype } from "@kbml-tentacles/forms-arktype"

const Signup = type({
  email: "string.email",
  password: "string>=8",
  age: "number>=18",
})

createFormContract()
  .field("email", (f) => f<string>().default(""))
  .field("password", (f) => f<string>().default(""))
  .field("age", (f) => f<number>().default(0))
  .validate(arktype(Signup))
```

## Error mapping

When the schema returns its error sentinel (`{ " arkKind": "errors" }`), the adapter maps each entry to a `ValidationIssue`:

```ts
{
  path: Array.from(err.path ?? []),
  message: err.message,
  code: err.code,
}
```

`code` is Arktype's rule identifier — useful as an i18n key.

## No async variant

Arktype focuses on high-performance sync validation — it pre-compiles schemas into optimized predicates at type-definition time. There is no `arktypeAsync` because Arktype itself doesn't support async rules.

For async fields (uniqueness checks, server validation), use one of the other adapters for the async path and Arktype for the sync one:

```ts
import { type } from "arktype"
import { arktype } from "@kbml-tentacles/forms-arktype"
import { zodAsync } from "@kbml-tentacles/forms-zod"
import { z } from "zod"

.field("username", (f) =>
  f<string>()
    .default("")
    .custom(arktype(type("string>=3")))
    .validateAsync(zodAsync(z.string().refine(async (v) => await isUnique(v))), {
      debounce: 300,
    }),
)
```

Sync validators run first; if they pass, the async check fires.

## Use Arktype when

- You want TypeScript-first schemas expressed as type strings (`"string.email"`, `"number>=18"`) with inline refinements.
- Validation speed at runtime matters — Arktype's compiled predicates outperform most alternatives.
- You're all-sync — no uniqueness checks, no remote validation, no debounced probes.

## Differences from Zod/Valibot

- Schema authoring style is different: Arktype uses type-string syntax (`type("string>=3")`), not a fluent builder.
- No async — if you need it, you're mixing adapters.
- Error messages are concise and machine-readable by default; customize via `.configure({ actual, expected })` on individual types.

## See also

| Topic | Link |
|---|---|
| Validator adapter interface | [Validators](/reference/forms/validators) |
| Using schema validators | [How-to: Use a schema validator](/how-to/use-schema-validator) |
| Sibling adapters | [Zod](/reference/validators/zod), [Yup](/reference/validators/yup), [Joi](/reference/validators/joi), [Valibot](/reference/validators/valibot) |
