# Add sync validation

Wire synchronous checks — required fields, length limits, custom predicates, non-blocking warnings — into a form contract so that `$error` populates the moment the user violates a rule.

You will learn:

- How `.required(msg?)` compares to a hand-written `.validate()`
- When to reach for `.custom()` instead of `.validate()`
- How to emit a soft warning with `.warn()` without blocking submit
- How the `mode` / `reValidate` settings drive *when* validators run
- How `.dependsOn()` re-runs one field's validators when another changes

## `.required(msg)` — the simple case

`.required(message?)` is shorthand for "the value must not be empty." It handles the common cases: `undefined`, `null`, empty string, empty array. Use it when you have nothing to add beyond "this field must be filled in."

```ts
import { createFormContract } from "@kbml-tentacles/forms"

const LoginContract = createFormContract()
  .field("email",    (f) => f<string>().default("").required("Email is required"))
  .field("password", (f) => f<string>().default("").required())
```

If you omit the message, the runner uses a generic "Required" default. Type-wise, `.required()` narrows the value out of `undefined` — this matters when another validator later receives `ctx.values.email` and expects a `string`, not `string | undefined`.

Call `.required()` at most once per field. Combining it with `.optional()` throws at contract build time.

## `.validate(fn)` — custom sync predicate

`.validate()` accepts any function that returns a `ValidationResult` — `null` for pass, a string for a single error, a `string[]` for multiple, or a `ValidationIssue[]` when you need to route messages to specific sub-paths.

```ts
const ProfileContract = createFormContract()
  .field("username", (f) => f<string>()
    .default("")
    .required("Pick a username")
    .validate((value) => value.length < 3 ? "Must be at least 3 characters" : null)
    .validate((value) => /^[a-z0-9_]+$/.test(value) ? null : "Lowercase letters, digits, and _ only"),
  )
```

Multiple `.validate()` calls compose — the runner applies them **in declaration order** and stops at the first failure by default. Flip `validate.criteriaMode` to `"all"` at the `createFormViewModel` level to collect every failure simultaneously (see below).

`.validate()` receives `(value, ctx)`. The context exposes more than the value itself:

```ts
.validate((value, ctx) => {
  // ctx.values      — the values at this form scope (sub-form values if nested)
  // ctx.rootValues  — the root form values
  // ctx.path        — this field's path, e.g. ["address", "zip"]
  // ctx.signal      — AbortSignal; honour it in long validators
  if (ctx.values.country === "US" && !/^\d{5}$/.test(value)) {
    return "US zip must be 5 digits"
  }
  return null
})
```

Use `ctx.values` for inter-field checks inside a single scope, `ctx.rootValues` when the dependency sits on another branch of the form. See [Cross-field validation](/how-to/cross-field-validation) for the full decision tree.

## `.custom(fn)` — structured multi-error

`.custom()` behaves like `.validate()` but its return type is narrowed to `ValidationIssue[]`. Use it when a single field can produce multiple independent errors that you want to display individually, or when you need to attach an error to a nested path inside a sub-form rule.

```ts
.field("password", (f) => f<string>()
  .default("")
  .required()
  .custom((value) => {
    const issues = []
    if (value.length < 8)        issues.push({ path: [], message: "At least 8 characters" })
    if (!/[A-Z]/.test(value))    issues.push({ path: [], message: "At least one uppercase letter" })
    if (!/\d/.test(value))       issues.push({ path: [], message: "At least one digit" })
    return issues
  }),
)
```

With `criteriaMode: "all"`, the UI sees each message on a separate row. With `criteriaMode: "firstError"` (default) the first issue wins and the rest are dropped. `.custom()` is also where every schema-validator adapter (Zod, Yup, Joi, …) plugs in — see [Use a schema validator](/how-to/use-schema-validator).

## `.warn(fn)` — non-blocking warnings

`.warn()` looks like `.validate()` but writes to `$warning` instead of `$error`. Warnings never block submission and never flip `$isValid` to `false`. Use them for "this is allowed but you probably did not mean it" hints.

```ts
.field("price", (f) => f<number>()
  .default(0)
  .validate((v) => v < 0 ? "Price cannot be negative" : null)
  .warn((v) => v > 10_000 ? "Are you sure? This is unusually high." : null),
)
```

Render warnings beside the field with an icon and a gentler tone — the distinction between warning and error stays clear to the user if your UI reserves red for `$error.`

## Validation modes — when validators run

The form view model accepts a `validate` config block that controls scheduling:

```ts
import { createFormViewModel } from "@kbml-tentacles/forms"

export const signupFormViewModel = createFormViewModel({
  contract: SignupContract,
  validate: {
    mode: "blur",          // first validation trigger before any submit
    reValidate: "change",  // subsequent validation trigger once a field is touched
    criteriaMode: "all",
    delayError: 300,
  },
})
```

| Setting | Allowed values | Default | Meaning |
|---|---|---|---|
| `mode` | `"submit"` \| `"blur"` \| `"change"` \| `"touched"` \| `"all"` | `"submit"` | First validation trigger |
| `reValidate` | `"change"` \| `"blur"` \| `"submit"` | `"change"` | Trigger after a field has been touched/submitted once |
| `criteriaMode` | `"firstError"` \| `"all"` | `"firstError"` | Collect first failure vs all failures per field |
| `delayError` | `number` (ms) | `0` | Defer `$error` visibility to avoid flicker during typing |

`mode: "submit"` matches the React Hook Form default — validation only runs when the user hits submit, then `reValidate` takes over. `mode: "blur"` feels smoother for long forms — errors appear after a field loses focus, and typing immediately revalidates. Pick what matches your UX, not what is "technically correct" — both are valid.

## Field-level overrides — `.validateOn` / `.reValidateOn`

Per-field scheduling wins over the form-level defaults. Use this when one field needs a different UX — for instance, an expensive uniqueness check that must only run on blur even when the rest of the form validates on change.

```ts
.field("username", (f) => f<string>()
  .default("")
  .required()
  .validate(ensureNoReservedWord)
  .validateOn("blur")
  .reValidateOn("change"),
)
```

`.validateOn()` and `.reValidateOn()` are single-shot modifiers — calling them twice on the same field is a type error. Omit them to inherit the form-level settings.

## `.dependsOn(paths)` — re-run on foreign changes

Field validators normally only re-run when the field itself changes. `.dependsOn(paths)` widens that to any path in the form. This is how password-and-confirm pairs stay consistent:

```ts
.field("password", (f) => f<string>()
  .default("")
  .required()
  .validate((v) => v.length < 8 ? "Too short" : null))

.field("confirmPassword", (f) => f<string>()
  .default("")
  .required()
  .dependsOn(["password"])
  .validate((v, ctx) => v === ctx.values.password ? null : "Passwords differ"))
```

When the user types in `password`, the confirm field re-runs its validator and clears its error if the two now match. Without `.dependsOn`, the confirm error lingers until the user retypes it.

`paths` accepts a string or `string[]`. The paths resolve against the root form — use `"address.zip"` for nested fields, `"phones.0.number"` for array positions. Arrays normally change too often to depend on a specific index; prefer `dependsOn(["phones"])` to react to any mutation in the list.

## Validator return-shape cheatsheet

| Return value | Interpretation |
|---|---|
| `null`, `undefined`, `""`, `false` | Field passes this validator |
| `"message"` (string) | Single error on this field |
| `["a", "b"]` (string[]) | Multiple errors on this field |
| `[{ path: ["sub", "x"], message: "oops" }]` | Attach messages to specific paths inside the form |
| A function that throws | Caught and surfaced as an error on this field |

`.custom()` narrows to the `ValidationIssue[]` shape so TypeScript catches an accidental string return. `.validate()` accepts any `ValidationResult` — keep it simple unless you need the extra expressiveness.

## What runs and in what order

One field mutation triggers this pipeline:

1. Sync `.required()` runs first.
2. `.validate()` calls run in declaration order. The runner stops at the first failure if `criteriaMode: "firstError"`, otherwise collects everything.
3. `.custom()` results are merged in.
4. `.warn()` fires, writing to `$warning` — never blocks.
5. If any `.validateAsync()` is attached, it enters the async queue ([Add async validation](/how-to/add-async-validation)).
6. Form-level `.validate(crossFieldFn)` runs after all fields ([Cross-field validation](/how-to/cross-field-validation)).

The resulting messages land on `$hiddenError` immediately and on `$error` only after the visibility gate — driven by `mode`, `reValidate`, `delayError`, and whether the field has been touched — opens for this field.

## See also

| Page | What it covers |
|---|---|
| [Add async validation](/how-to/add-async-validation) | `.validateAsync()`, debouncing, cancellation |
| [Use a schema validator](/how-to/use-schema-validator) | Drop Zod/Yup/Joi/Valibot/Arktype schemas into `.custom()` |
| [Cross-field validation](/how-to/cross-field-validation) | Chain-level `.validate()` and `ctx.rootValues` |
| [Field builder reference](/reference/forms/field-builder) | Full signature of every validation method |
