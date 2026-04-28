---
description: "Reference for ValidationMode and ReValidationMode scheduling and visibility semantics."
---

# Validation modes

`ValidationMode` controls when validation errors first become visible. `ReValidationMode` controls when they re-check after the user has seen them. Both are declared at form-creation time and can be overridden per field.

## Types

```ts
type ValidationMode = "submit" | "blur" | "change" | "touched" | "all"
type ReValidationMode = "change" | "blur" | "submit"
```

## `ValidationMode` — when errors first appear

Validation *runs* regardless of mode — what the mode controls is the `$visible` toggle behind each `$error` store. The "hidden" computed error is always up to date; the mode decides when it's displayed.

| Mode | Error becomes visible when… | Use case |
|---|---|---|
| `"submit"` | User calls `form.submit()` | Quiet forms — no error shown until the user actively tries to submit. Default. |
| `"blur"` | Field loses focus for the first time | Classic form UX — errors appear as the user tabs through |
| `"change"` | Field's value changes (first keystroke) | Immediate feedback; loud |
| `"touched"` | Field is touched (focus + blur once) | Errors appear only after interaction, not on first focus |
| `"all"` | On any of change, blur, or touched | Noisiest — all signals trigger visibility |

Default is `"submit"`.

## `ReValidationMode` — when errors re-check after appearing

Once a field has shown an error, subsequent interactions use `reValidate`:

| Mode | Re-check trigger | Use case |
|---|---|---|
| `"change"` | Every keystroke | The default — rapid correction feedback |
| `"blur"` | Only on blur | Lighter — users complete typing before re-checking |
| `"submit"` | Only on next submit | Batch — error persists until submit attempt |

Default is `"change"`.

## Form-wide config

Set via `createFormViewModel({ validate })`:

```ts
createFormViewModel({
  contract: signupContract,
  validate: {
    mode: "blur",
    reValidate: "change",
  },
})
```

Every field adopts these unless overridden.

## Per-field overrides

Each field can override both via the builder:

```ts
createFormContract()
  .field("email", (f) =>
    f<string>()
      .validate((v) => (v.includes("@") ? null : "Invalid email"))
      .validateOn("change")       // override mode
      .reValidateOn("blur"),      // override reValidate
  )
```

Overrides are per-field. Other fields keep the form-wide setting.

## Validator-level override

Async validators can override `runOn` for themselves only:

```ts
.field("username", (f) =>
  f<string>()
    .validateOn("blur")
    .validateAsync(asyncCheck, { debounce: 300, runOn: "change" }),
)
```

Sync validators run on the field's `validateOn` mode; the async validator runs on `change` (even though the field is `blur`).

## `criteriaMode`

```ts
validate: { criteriaMode: "firstError" | "all" }
```

| Mode | Behavior |
|---|---|
| `"firstError"` (default) | First failing validator for a field short-circuits the rest |
| `"all"` | Every validator runs; `$error` holds the first message, but `$errors` path map collects all |

Relevant when a field has multiple `.validate()` calls. Choose `"all"` when you want to display a bulleted list of all errors.

## `delayError`

```ts
validate: { delayError: 200 }
```

Waits `N` milliseconds after the error is computed before making it visible. Reduces flicker when a validator runs rapidly (keystroke-level). Applies to the visibility toggle, not the validator itself.

## Mode choice guide

| If users… | Pick `mode` | Pick `reValidate` |
|---|---|---|
| Submit rarely; want quiet form | `"submit"` | `"change"` |
| Fill fields left-to-right | `"blur"` | `"change"` |
| Need immediate feedback (search, autocompletes) | `"change"` | `"change"` |
| Build a wizard with multi-step visible state | `"touched"` | `"blur"` |
| Enforce everything loudly | `"all"` | `"change"` |

## See also

| Topic | Link |
|---|---|
| The full validation flow | [Explanation: Validation lifecycle](/explanation/validation-lifecycle) |
| Why there's a hidden/visible split | [Explanation: Hidden vs visible errors](/explanation/hidden-visible-errors) |
| Sync validators | [How-to: Add sync validation](/how-to/add-sync-validation) |
| Async validators with debounce | [How-to: Add async validation](/how-to/add-async-validation) |
