---
description: "Explains Tentacles validator adapter interface (sync/async shape, trade-offs) and how schema libs like Zod/Yup/Joi plug in via tiny adapters."
---

# Validator adapter design

The validator interface is intentionally tiny: three fields. `__type`, `async`, `validate`. That's it. Every schema library in the ecosystem — Zod, Yup, Joi, Valibot, Arktype — plugs into Tentacles through a ~15-line adapter. This explains why the interface is shaped this way and what you lose by choosing differently.

## The interface

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

Three fields. No base class. No decorator. No `extends`. A plain object literal is a valid validator.

## Why `__type`?

It's a brand. `__type: "form-validator"` lets the runtime distinguish "this is an adapted validator" from "this is a plain function." The `.validate()` builder method accepts both:

```ts
.validate((value) => value.includes("@") ? null : "Invalid")  // plain function
.validate(zod(z.string().email()))                              // adapter
```

Without the brand, runtime detection would require type-probing or instanceof checks against every adapter's class. With it, the runtime does one property check.

It also reserves extension room. Future validator categories (composite validators, meta-validators that wrap others) can use different `__type` values and be routed differently.

## Why `async: boolean` and not function-shape sniffing?

The runtime needs to know whether to `await` the result before continuing. Two options:

1. **Type-sniff at runtime** — check if `validate()` returns a thenable. Slower (one call to find out), and problematic for validators that might return either kind (e.g., sync schemas that short-circuit when the value is clearly wrong).
2. **Declare ahead** — the adapter promises `async: true` or `async: false`, and the runtime dispatches accordingly.

Option 2 wins because:

- Scheduling happens before the call. The async runner only touches validators flagged `async: true`; sync ones skip straight to the inline path.
- Debouncing, cancellation, and `flushAll()` for SSR only make sense for async validators. `async: false` skips all of those branches entirely.
- The brand matches runtime behavior: a schema that sometimes needs await would misbehave under sync scheduling, so the contract forces you to pick.

Some adapters only offer one variant (Arktype is sync-only, so there's no `arktypeAsync`). That's fine; the interface accepts either shape.

## `ValidationResult`'s four variants

```ts
type ValidationResult = null | string | string[] | ValidationIssue[]
```

Each variant exists because real validators emit different shapes:

- **`null`** — the common "pass" case. Avoids the ceremony of returning `{ ok: true }` or similar.
- **`string`** — the common "fail with one message" case. Most sync validators take this path. Routing: attach to the current `ctx.path`.
- **`string[]`** — one validator produces multiple messages for the same field. Collapsed to the first by default (`criteriaMode: "firstError"`), all preserved under `"all"`.
- **`ValidationIssue[]`** — the validator produced errors at arbitrary paths. Used by object-level schemas (Zod's `safeParse` on a full object) that need to distribute errors across many fields.

Why not unify into `ValidationIssue[]` everywhere? Because 90% of validators write `return "Required"` — forcing them to return `[{ path: [], message: "Required" }]` would be obnoxious.

Returning `null` is explicitly different from returning `undefined`. `undefined` is reserved for "validator didn't run / was skipped." `null` means "validator ran and said it's fine." This distinction matters for async cancellation — an aborted validator returns `null` from its adapter, not `undefined`, so the result is safely ignored rather than triggering a "validator returned nothing" warning.

## `ValidatorCtx` — what the validator sees

```ts
interface ValidatorCtx<Values = unknown> {
  readonly values: Values
  readonly rootValues: unknown
  readonly path: readonly (string | number)[]
  readonly signal: AbortSignal
}
```

Four fields, chosen to answer the four questions a validator might ask:

- **What am I validating?** — `values` (scope-local), `path`.
- **What else is in the form?** — `rootValues` for cross-field peeking.
- **Where should my errors be attached?** — `path` (used when you emit `ValidationIssue[]` with relative paths).
- **Should I still run?** — `signal` for async cancellation.

Scope matters: a validator on a sub-form sees `values` as the sub's values, not the root. Emitting a `ValidationIssue` with path `["city"]` from a sub-form validator routes the error into that sub-form, not the root. This keeps cross-scope plumbing out of the validator's concerns.

## Designing for adapter authors

The three-field interface means writing a new adapter is almost always:

1. Import the schema library.
2. Call the library's validate / parse function on `value`.
3. Map the library's error shape to `ValidationIssue[]` (or a string / null on success).
4. Return the result.

Fifteen lines. The existing adapters are all under 30 lines of real logic (the rest is types and comments).

This low barrier is important because:

- Schema libraries come and go. A design that requires a Tentacles-specific module (like `@tanstack/form-validator-protocol`) from each library would leave users stuck when new libraries emerge.
- Teams can write in-house adapters for custom DSLs (domain-specific validation, graph-based rules). The interface doesn't force "you must speak Zod or leave."
- Forked / patched adapters (customizing error messages, adding logging) can be written in an afternoon.

## What's deliberately not in the interface

**No validator metadata.** No `name`, no `description`, no `id`. Adapters don't need it; debugging happens through stack traces and the `code` field on `ValidationIssue`.

**No composition primitives.** No `and(v1, v2)`, no `or(v1, v2)`. Composition happens at the field builder level (`.validate(a).validate(b)` runs both), and the validator itself is a leaf.

**No access to the Effector scope or other stores.** Validators are pure functions of `(value, ctx)`. If you need reactive dependencies, declare them with `.dependsOn([paths])` at the builder level — the runtime re-runs the validator when the dependency changes, but the validator itself stays pure.

This keeps the surface narrow. More features would mean more edge cases, more tests, more things for adapter authors to think about. The cost of the minimalism is occasional awkwardness ("I want a validator that watches a Store directly" — you don't; you declare `.dependsOn([...])` at the builder level).

## The result

Zod, Yup, Joi, Valibot, and Arktype all plug in through the same three-field interface. They all produce `ValidationIssue[]` with consistent semantics. Users can mix adapters (Zod sync + custom async) without any adapter-specific machinery. Swapping libraries is a find-and-replace.

A tiny interface, carefully chosen, beats a big one. The proof is in the adapters — each is short, each is obvious, each composes the same way.

## See also

| Topic | Link |
|---|---|
| The validator interface | [Validators](/reference/forms/validators) |
| Example adapters | [Zod](/reference/validators/zod), [Yup](/reference/validators/yup), [Joi](/reference/validators/joi), [Valibot](/reference/validators/valibot), [Arktype](/reference/validators/arktype) |
| Lifecycle around the validator | [Validation lifecycle](/explanation/validation-lifecycle) |
| Hidden vs visible | [Hidden vs visible errors](/explanation/hidden-visible-errors) |
