---
description: "Validate constraints that depend on multiple fields using form-level and field-level context."
---

# Cross-field validation

Validate rules that involve more than one field — password and confirmation, end date after start date, total amount equals the sum of line items — without scattering ad-hoc effects across your component code.

You will learn:

- When to use chain-level `.validate()` versus field-level `.dependsOn()`
- How to attach an error to a specific field from a cross-field rule
- How `ctx.values` differs from `ctx.rootValues` inside nested forms
- Where cross-field validators sit in the run order
- How async cross-field validators behave at submit

## Chain-level `.validate(crossFieldFn)`

`createFormContract()` exposes a top-level `.validate()` that receives the full values object. It runs after every field-level validator on every change that touches a relevant field.

```ts
import { createFormContract } from "@kbml-tentacles/forms"

const SignupContract = createFormContract()
  .field("email",           (f) => f<string>().default("").required())
  .field("password",        (f) => f<string>().default("").required())
  .field("confirmPassword", (f) => f<string>().default("").required())
  .validate((values) =>
    values.password === values.confirmPassword
      ? null
      : { path: ["confirmPassword"], message: "Passwords differ" },
  )
```

Returning `null` means "all good." Returning a string sets the form-level `$formError`. Returning `{ path, message }` (or an array of those) routes the message to the matching field. Several `.validate()` calls compose — they all run, and their results merge.

| Return shape | Where the message lands |
|---|---|
| `null` / `undefined` | Cross-field rule passes |
| `"too high"` (string) | `form.$formError` |
| `["a", "b"]` (string[]) | `form.$formError` (joined or first depending on `criteriaMode`) |
| `{ path: ["confirmPassword"], message: "Passwords differ" }` | `form.confirmPassword.$error` |
| `[{ path: ["a"], message: "x" }, { path: ["b"], message: "y" }]` | Each path receives its own error |

`path` is an array of strings and numbers, resolved against the root form. Use `["address", "zip"]` for nested fields and `["phones", 2, "number"]` for array positions.

## Attaching errors to specific fields

Validation errors are most useful when they appear next to the input the user has to fix. The `path`-shaped return is how you do that from a chain-level validator.

```ts
.validate((values) => {
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    return [
      { path: ["endDate"], message: "End must be after start" },
      // optionally also flag start
      // { path: ["startDate"], message: "Start must be before end" },
    ]
  }
  return null
})
```

The runner overwrites the previous cross-field message on `endDate.$error` whenever this validator runs again. If the field also has its own `.validate()` that fails, both messages are merged (or the first one wins, depending on `criteriaMode`).

A returned `path` that does not correspond to a real field is silently dropped. Use the field name exactly as you declared it in the contract.

## Field-level `.dependsOn(paths)`

`.dependsOn()` solves a different problem. It does not write a cross-field validator — it just tells the runner "re-run the validators on *this* field whenever any of these paths change." Use it when you want the field's own validators to see fresh sibling values.

```ts
.field("password",        (f) => f<string>().default("").required())
.field("confirmPassword", (f) => f<string>()
  .default("")
  .required()
  .dependsOn(["password"])
  .validate((value, ctx) => value === ctx.values.password ? null : "Passwords differ"))
```

Without `.dependsOn(["password"])`, the confirm field's validator only runs when *its own* value changes. Edit `password` to "abc123", confirm "abc124", then fix `password` to "abc124" — the confirm field still shows the error until the user retypes it. `.dependsOn` removes that asymmetry.

| You want… | Use |
|---|---|
| The error to appear on field B when A changes, and stay on B | `.dependsOn(["A"])` on field B + `.validate(…ctx.values.A…)` on B |
| A single source of truth for "these two values relate to each other" | Chain-level `.validate()` returning `{ path: ["B"], message }` |
| To mix both — gate a chain-level rule on touching specific fields | Chain-level `.validate()` plus `.dependsOn()` on the affected fields |

There is no wrong answer. `.dependsOn()` keeps the validator co-located with the field that displays the error; chain-level `.validate()` keeps the rule visible at a glance from the contract definition. Pick whichever the rest of your team finds easier to maintain.

## `ctx.values` vs `ctx.rootValues` in nested forms

Validators inside a sub-form receive a `ValidatorCtx<Values>` where `values` is *the sub-form's values* — not the root.

```ts
const AddressContract = createFormContract()
  .field("country", (f) => f<string>().default(""))
  .field("zip",     (f) => f<string>().default(""))
  .validate((values, ctx) => {
    // values.country / values.zip — local to the address sub-form
    // ctx.rootValues — the entire root form, including siblings of "address"
    if (values.country === "US" && !/^\d{5}$/.test(values.zip)) {
      return { path: ["zip"], message: "US ZIP must be 5 digits" }
    }
    return null
  })

const ProfileContract = createFormContract()
  .field("displayName", (f) => f<string>().default(""))
  .sub("address", AddressContract)
```

Inside `AddressContract.validate()`, `values.country` resolves locally. To reach the root form's `displayName`, use `ctx.rootValues.displayName`. The path returned in `{ path: ["zip"], message }` is also resolved relative to the sub-form — it lands on `form.address.zip.$error`.

This scoping rule applies everywhere — field validators, chain-level validators, async validators, and adapters built on schema libraries. A schema attached at the array level sees the array as its values; a schema attached at the root sees the whole form.

## Order of operations

When a single change touches a field that has every kind of validator wired:

1. Field's own sync `.required()` runs.
2. Field's own `.validate()` calls run in declaration order.
3. Field's own `.custom()` results are merged in.
4. Field's own `.warn()` runs (writes to `$warning`, never blocks).
5. Field's own `.validateAsync()` calls enter the debounce queue.
6. Every `.dependsOn()` consumer of this field's path repeats steps 1–5 for itself.
7. Chain-level sync `.validate()` calls run, with the latest values.
8. Chain-level async `.validate()` (Promise-returning) enters the async queue.

The whole pipeline is wired with effector `sample()` chains in `packages/forms/src/validation/validation-runner.ts:1`. The result is one consistent error map per change — you never see partial state in the UI.

The visible behaviour of `delayError` in your `validate` config still applies on top of this — even after the pipeline completes, errors only become visible when the field's mode/touched gate opens.

## Async cross-field validators

Returning a `Promise<ValidationResult>` from a chain-level `.validate()` makes it async. The runner treats it as part of the async queue: it gets cancelled when newer changes arrive, debounce settings are inherited from the form-level config, and `submit()` waits for it to settle.

```ts
.validate(async (values, ctx) => {
  if (!values.couponCode) return null

  try {
    const res = await fetch(`/api/coupon/${values.couponCode}`, { signal: ctx.signal })
    if (ctx.signal.aborted) return null
    const { ok, message } = await res.json()
    return ok ? null : { path: ["couponCode"], message }
  } catch (err) {
    if (ctx.signal.aborted) return null
    return null
  }
})
```

The same `ctx.signal` etiquette from [Add async validation](/how-to/add-async-validation) applies — short-circuit before returning so a stale verdict cannot overwrite a newer one.

## A complete example

A booking form that combines field-level rules, a `.dependsOn()` re-trigger, and a chain-level cross-field validator:

```ts
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms"

const BookingContract = createFormContract()
  .field("startDate", (f) => f<Date | null>()
    .default(null)
    .required("Pick a start date"))

  .field("endDate", (f) => f<Date | null>()
    .default(null)
    .required("Pick an end date")
    .dependsOn(["startDate"])
    .validate((value, ctx) =>
      value && ctx.values.startDate && value < ctx.values.startDate
        ? "End must be after start"
        : null,
    ))

  .field("guests", (f) => f<number>().default(1).required())

  .validate((values) => {
    if (!values.startDate || !values.endDate) return null
    const ms = +values.endDate - +values.startDate
    const nights = Math.round(ms / 86_400_000)
    if (nights * values.guests > 30) {
      return {
        path: ["guests"],
        message: "Maximum 30 guest-nights per booking",
      }
    }
    return null
  })

export const bookingFormViewModel = createFormViewModel({
  contract: BookingContract,
  validate: { mode: "blur", reValidate: "change" },
})
```

What runs when:

- User edits `endDate`: `endDate`'s sync validators run; chain-level rule re-runs.
- User edits `startDate`: `startDate`'s validators run, `endDate.dependsOn(["startDate"])` re-runs `endDate`'s validators, chain-level rule re-runs.
- User edits `guests`: `guests` validators run, chain-level rule re-runs.

Every path that depends on the edited value updates exactly once per change. There is no double-evaluation or stale state.

## See also

| Page | What it covers |
|---|---|
| [Add sync validation](/how-to/add-sync-validation) | `.validate()`, `.custom()`, `.required()` and modes |
| [Add async validation](/how-to/add-async-validation) | `ctx.signal` etiquette and debouncing |
| [Use a schema validator](/how-to/use-schema-validator) | Cross-field rules via Zod's `.refine()` |
| [Validators reference](/reference/forms/validators) | Dependency graph and visibility gating |
