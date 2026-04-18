# `@kbml-tentacles/forms-zod`

Adapter that turns a [Zod](https://zod.dev) schema into a Tentacles [`CustomValidator`](/reference/forms/validators) or [`CustomAsyncValidator`](/reference/forms/validators) so it can be attached to any form field with `.validate()` or `.validateAsync()`.

## Install

```bash
npm install @kbml-tentacles/forms-zod zod @kbml-tentacles/forms @kbml-tentacles/core effector
```

```bash
yarn add @kbml-tentacles/forms-zod zod @kbml-tentacles/forms @kbml-tentacles/core effector
```

```bash
pnpm add @kbml-tentacles/forms-zod zod @kbml-tentacles/forms @kbml-tentacles/core effector
```

## Peer deps

| Package | Range | Notes |
|---|---|---|
| `zod` | `>=3.20` | Tested against `zod@4.x`. The adapter only uses `safeParse` / `safeParseAsync` and reads `error.issues`, so any v3.20+ release works. |
| `@kbml-tentacles/forms` | `^0.1.2` | Provides `CustomValidator` / `CustomAsyncValidator` interfaces. |
| `@kbml-tentacles/core` | `^0.1.2` | Indirect — re-exported by `@kbml-tentacles/forms`. |

## Exports

| Export | Kind | Variant | Description |
|---|---|---|---|
| [`zod`](#zod) | function | sync | Wraps `safeParse` — use for purely synchronous schemas. |
| [`zodAsync`](#zodasync) | function | async | Wraps `safeParseAsync` — required for schemas with `refine(async ...)` or `superRefine(async ...)`. |

Both functions return a branded validator object (`__type: "form-validator"`) and are passed to a field builder's `.validate()` / `.validateAsync()`.

## `zod`

```ts
function zod<T>(schema: z.ZodType<T>): CustomValidator<T>
```

### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `schema` | `z.ZodType<T>` | yes | Any Zod schema whose inferred output type matches the field's value type. Async refinements are not allowed; use [`zodAsync`](#zodasync) instead. |

### Returns

`CustomValidator<T>` — a branded sync validator object that the form runtime calls with the current field value. Returns `null` on success, `ValidationIssue[]` on failure.

### Example

```ts
import { z } from "zod";
import { zod } from "@kbml-tentacles/forms-zod";
import { createFormContract } from "@kbml-tentacles/forms";

const contract = createFormContract().field("email", (f) =>
  f<string>()
    .default("")
    .validate(zod(z.string().email("Invalid email"))),
);
```

A composite schema works the same way — pass it to a sub-form or use it for cross-field validation:

```ts
const userSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().nonnegative(),
});

createFormContract()
  .sub("user", userContract)
  .validate((values) => zod(userSchema).validate(values, ctx));
```

### Error shape mapping

Zod returns `ZodSafeParseResult` from `safeParse`. On failure, `result.error.issues` is an array of `ZodIssue`:

```ts
type ZodIssue = {
  path: (string | number)[];
  message: string;
  code: string;
  // …additional fields, ignored by the adapter
};
```

The adapter maps each issue into a [`ValidationIssue`](/reference/forms/validators):

| Zod field | `ValidationIssue` field | Notes |
|---|---|---|
| `issue.path` | `path` | Falls back to `[]` if undefined. |
| `issue.message` | `message` | Forwarded verbatim — use Zod's per-rule messages for i18n. |
| `issue.code` | `code` | Preserves the discriminator (`too_small`, `invalid_type`, …). |

If neither `result.error?.issues` nor `result.issues` is populated (defensive path for future Zod releases), the adapter returns an empty array — equivalent to a passing validation.

### Edge cases / gotchas

- **No async refinements.** Calling `zod()` with a schema that contains an async refinement throws inside `safeParse` (Zod's behaviour, not the adapter's). Use [`zodAsync`](#zodasync).
- **Type inference is one-way.** `zod<T>` requires `T` to match the field's declared type. If you let Zod infer the output (`z.infer<typeof schema>`), pass it as the field's value type so the two stay in sync.
- **Coercion.** If the schema uses `z.coerce.*`, the adapter does not write the coerced value back — coercion is reported as success/failure, but the field still holds the user input. Apply `.transform({ parse, format })` on the field if you want stored coercion.
- **Multiple issues per field.** A schema like `z.string().min(8).regex(/\d/)` may emit two issues against the same path. The adapter forwards both; the form runtime then renders them through `Field.$error` (string mode) or `$errors` (issue list).

## `zodAsync`

```ts
function zodAsync<T>(schema: z.ZodType<T>): CustomAsyncValidator<T>
```

### Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `schema` | `z.ZodType<T>` | yes | A Zod schema, optionally containing async refinements. Sync schemas also work but pay an extra microtask. |

### Returns

`CustomAsyncValidator<T>` — a branded async validator object. The form runtime awaits it with the active `AbortSignal`.

### Example

```ts
import { z } from "zod";
import { zodAsync } from "@kbml-tentacles/forms-zod";

const usernameSchema = z
  .string()
  .min(3)
  .refine(async (name) => !(await checkUsernameTaken(name)), {
    message: "Username already taken",
  });

createFormContract().field("username", (f) =>
  f<string>()
    .default("")
    .validateAsync(zodAsync(usernameSchema), { debounce: 300 }),
);
```

### Error shape mapping

Identical to [`zod`](#zod): each `ZodIssue` becomes a `ValidationIssue` with `path`, `message`, and `code`.

### Cancellation

The adapter awaits `schema.safeParseAsync(value)` and then checks `ctx.signal.aborted` before returning the issues. If the signal aborted while the schema was running, the adapter returns `null` so the form runtime drops the stale result without surfacing it as an error.

This is the contract of every `CustomAsyncValidator`: never throw on abort, never emit issues after `signal.aborted` is `true`.

### Edge cases / gotchas

- **Network refinements.** The adapter does not know how to cancel an in-flight `fetch` started inside a refinement. Read `ctx.signal` from a closure and pass it to `fetch(url, { signal: ctx.signal })` — but since Zod itself does not forward the signal, you usually need to wrap the schema in a function that captures the signal first.
- **Debounce.** Use the second argument to `.validateAsync()` to debounce noisy fields. Debounce is independent of cancellation; if the schema is already running when a new value arrives, the previous run is aborted and the new one starts after the debounce delay.
- **Sync schemas.** `zodAsync` accepts schemas with no async refinements — it just pays one extra microtask. Prefer `zod` when async is not needed.

## See also

- [Validators (generic interface)](/reference/forms/validators) — the `CustomValidator` / `CustomAsyncValidator` contract every adapter implements.
- [Field builder](/reference/forms/field-builder) — `.validate()`, `.validateAsync()`, `.warn()`.
- [Use a schema validator](/how-to/use-schema-validator) — practical guide to picking and wiring an adapter.
- [Your first form](/tutorials/your-first-form) — end-to-end tutorial that uses an adapter for field validation.
