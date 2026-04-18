# Hidden vs visible errors

Every form library has to answer two questions: "is this field valid right now?" and "should the user be looking at an error message right now?" Most conflate them. Tentacles keeps them separate.

## The tension

Suppose a required field starts empty. The moment the form mounts, it's invalid — the validator says so. But showing "Required" the instant the page loads is obnoxious UX. On the other hand, if you hold back validation until the user interacts, the form's `$isValid` lies for that stretch of time: it reports "valid" when nothing has been checked yet.

Many libraries resolve this by deferring validation until the user interacts. Then:

- `isValid` is `true` for a freshly-mounted form, even though submitting would fail.
- Enabling the submit button by reading `isValid` is wrong; you have to call `validate()` first, then read.
- Every "submitting" code path has to know to run a full validation pass.
- The library and the developer both maintain an implicit "have we validated yet" flag.

Tentacles takes a different approach: validation runs eagerly, display is gated.

## The two stores

```ts
$hiddenError: Store<string | null>  // "what is actually wrong with this field"
$visible:     Store<boolean>        // "has the user earned the right to see it"
$error = combine($hiddenError, $visible, (e, v) => v ? e : null)
```

`$hiddenError` is always correct. `$error` is what you render.

Aggregates read `$hiddenError`:

- `$isValid` = `every($hiddenError === null && subs/arrays valid)`
- `$isValidating` = `any currently-running async check`

So `$isValid` is true iff no validator would complain, regardless of whether any messages are currently on screen. You can wire `disabled={!$isValid}` on your submit button from the very first frame and it will behave correctly.

Aggregates that are about display, not correctness, read `$error`:

- `$errors` — the map of visible errors for rendering inline summaries.
- `$errorPaths` — same, for focus-first-error logic.

## How `$visible` transitions

`$visible` starts at `false` for every field. It flips to `true` the first time any of its trigger events fire:

- On `ValidationMode = "submit"` — flips only when `form.submit()` has been called at least once. The runtime routes the submit event through a `showAllErrors()` step that forces every `$visible` to `true` in one batch.
- On `"blur"` — flips on first `blurred()` event.
- On `"change"` — flips on first `changed()` event.
- On `"touched"` — flips when focus + blur have both happened.
- On `"all"` — flips on any of the above.

Once `true`, `$visible` does not flip back to `false` (unless you call `reset()` without `keepErrors`). The field has "earned" the right to show errors, and revoking that would be disorienting.

## Why `ReValidationMode` isn't a `$visible` concept

`ReValidationMode` looks similar — it controls when validation happens after errors have appeared — but it's not about visibility. It's about *when `$hiddenError` recomputes*.

- `ReValidationMode = "change"` — every keystroke re-runs validators. Best for rapid correction feedback.
- `"blur"` — only on blur. The user's in-progress typing is ignored; the field is re-checked when they tab away.
- `"submit"` — never re-checks until submit. The error you're looking at is stale until you try again.

This has nothing to do with `$visible`; it's purely about validator scheduling. We can say "run validators aggressively but show the error only on blur" (`mode: "blur"`, `reValidate: "change"` — default) or the reverse (`mode: "change"`, `reValidate: "blur"` — ambient correction, lazy re-check).

## The submit-time reveal

When the user clicks submit, the form must show every problem — including fields they never focused or typed into. Without the two-state split, we'd have to either:

- Run validators synchronously at submit time (defeats the point of async validators) and hope they settle.
- Keep a separate "showAll" flag that aggregates override.

With the split, submission's job is trivial:

```ts
submit.watch(() => {
  // Force display
  for (const field of allFields) field.$visible = true
  // Kick any stale async validators
  asyncRunner.flushAll()
  // Read $hiddenError for routing decision
  if (every($hiddenError === null)) fire(submitted)
  else fire(rejected)
})
```

No separate "show on submit" validation pass, no "if we haven't validated yet, validate now." The validators have always been running; submission just lifts the curtain.

## What you can build with it

Because `$hiddenError` is separately inspectable, you can:

- **Diagnostic tools** — show a panel listing every field's "real" error during development, separate from what the user sees.
- **Analytics** — track how often users hit validator failures before they see them (a signal for improving UX writing).
- **Smart submit buttons** — keep the button disabled based on `$isValid` (hidden state) while the user is still typing, without ever showing an error message until submit is attempted.
- **Error-specific autosuggest** — detect that `email` is `$hiddenError: "Invalid email"` and offer a correction before the user has even finished typing — without actually displaying the error yet.

These would all require awkward workarounds in a single-state model. Here, they're obvious.

## The cost

Two stores per field instead of one. The extra cost is negligible: `$hiddenError` and `$visible` are cheap `createStore` calls, and `$error` is a single `combine` of two booleans. Tentacles already creates ~10 stores per field (value, default, initial, dirty, touched, validating, disabled, etc.); one more is rounding error.

The conceptual cost is higher. "Why doesn't `$error` show anything when I just changed the value?" is answered by understanding that `$visible` is false until some trigger flips it. This is why the docs lead with `$error` (the "usually what you want" store) and expose `$hiddenError` as an advanced concept.

## See also

| Topic | Link |
|---|---|
| The full lifecycle | [Validation lifecycle](/explanation/validation-lifecycle) |
| The modes API | [Validation modes](/reference/forms/validation-modes) |
| The field shape | [Field](/reference/forms/field) |
| The form shape | [FormShape](/reference/forms/form-shape) |
