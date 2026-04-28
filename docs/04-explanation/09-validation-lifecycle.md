---
description: "End-to-end flow from user input to sync/async validation results and visible messages."
---

# Validation lifecycle

This explains what actually happens between a user keystroke and a visible error message. The flow is the same for every validator — sync, async, schema-adapted, cross-field — because they all reduce to the same two-state machine: `$hiddenError` (the true verdict) and `$visible` (the gate that decides whether to show it).

## The two-state model

Most form libraries conflate "has this field failed?" with "is the user allowed to see the failure?" Tentacles separates them:

- **`$hiddenError: Store<string | null>`** — the live result of all validators for a field. Updates every time the value changes, dependencies change, or an async check returns. It is always correct.
- **`$visible: Store<boolean>`** — a gate. True means "the user has interacted enough that errors are fair to show." Controlled by `ValidationMode` (first-show) and `ReValidationMode` (after-show).
- **`$error: Store<string | null>`** — the derived public store: `$visible ? $hiddenError : null`.

Reading `field.$error` always gives you the correct thing to show. Reading `field.$hiddenError` (it's also exposed, rarely) gives you the true state regardless of UX gating.

Why this matters: without the split, you either validate eagerly and spam the user (every keystroke on an empty required field flashes "Required") or lazily and mis-report submitability (the form thinks it's valid because you didn't run checks yet). Tentacles runs checks eagerly and shows them lazily.

## The full path of one keystroke

User types an `a` into the `email` field with contract `.validate(v => v.includes("@") ? null : "Invalid email")`:

1. `field.changed("a")` fires. The runtime writes `"a"` into `$value` and sets `$dirty = true`.
2. The sync validator runs immediately (it's cheap and synchronous). Result: `"Invalid email"`. `$hiddenError` is set to that string.
3. If any other fields listed `email` in `.dependsOn([...])`, they re-run too — same mechanism, same updates.
4. **`$visible` decides whether to surface it.** If `ValidationMode` is `"change"`, `$visible` flips to `true` now. If it's `"blur"`, nothing shows yet — `$visible` stays `false`.
5. If `$visible` is `true`, `$error` now exposes `"Invalid email"`.

Meanwhile, any aggregate store that depends on `$error` (like `$errors` or `$isValid`) updates reactively. `$isValid` reads `$hiddenError` directly, not `$error` — because "is the form submittable" is independent of "have we shown the user their mistakes yet."

## The async overlay

Add `.validateAsync(checkRemote, { debounce: 300 })`:

1. Steps 1–3 above happen as before. Sync validators settle synchronously.
2. The `AsyncRunner` sees the change and schedules a debounced check. A timer starts; if the user types again before 300ms, the timer resets.
3. `$validating` flips to `true`.
4. When the timer fires, the validator is called with a fresh `AbortController`. Its `signal` is on `ctx.signal`. If a newer call starts before this one finishes, the old signal is aborted.
5. When the promise settles, the adapter first checks `ctx.signal.aborted`. If aborted, the result is discarded. If not, `$hiddenError` updates with the result.
6. `$validating` flips to `false`.

Sync validators still short-circuit async ones: if the sync check says "required", async never runs. This is configured per-field by `criteriaMode`; the default (`"firstError"`) stops at the first failure.

## What `$visible` actually gates on

| `ValidationMode` | `$visible` becomes true when |
|---|---|
| `"submit"` | `form.submit()` has been called at least once |
| `"blur"` | Field's `blurred()` event has fired at least once |
| `"change"` | `$value` has been written at least once (the first `changed()` call) |
| `"touched"` | Field has been focused then blurred at least once |
| `"all"` | Any of change, blur, or touched has occurred |

After `$visible` goes true for the first time, the `ReValidationMode` takes over. It does not gate visibility anymore — `$visible` stays true — it controls **when `$hiddenError` re-evaluates**. `"change"` means every keystroke; `"blur"` means only on blur; `"submit"` means the field freezes until the next submit.

This distinction — first-show vs re-show — is why the two modes exist. "Pick when to start complaining" and "pick how loudly to complain once you've started" are orthogonal questions.

## Submission as a reset of the world

`form.submit()` is not just "check everything and route."  It's a mass state transition:

1. `$isSubmitting` flips to `true`.
2. `showAllErrors()` fires — every field's `$visible` is forced to `true`. This is the only way to show errors that were gated behind `"blur"` / `"touched"` modes for fields the user never touched.
3. `validateAll()` runs synchronously, collecting all current `$hiddenError` states (sync is complete; async is whatever it is right now — if anything is still `$validating`, submission waits).
4. Pending async validators are allowed to complete (or `flushAll()` is called for SSR).
5. If every field's `$hiddenError` is `null`, the `submitted` event fires with the current `$values`.
6. Otherwise, `rejected` fires with `{ errors, errorPaths }`.
7. `$isSubmitting` flips to `false`.

From the user's perspective, submission is "show me every problem at once." Mechanically, it's a forced `$visible` flip plus a synchronization barrier with the async runner.

## Cross-field validators

When you call `.validate(crossFieldFn)` on the chain (not on an individual field), you're adding a validator whose `ValidatorCtx` sees the whole values object. It has three possible outputs:

- Returns `null` — all clear.
- Returns a string — attaches to the form itself via `$formError`, not to any specific field.
- Returns `ValidationIssue[]` — routes each issue to the field at `issue.path`, interleaving with that field's own errors.

The inverted dependency graph (see `ValidationRunner`) means that even with 50 cross-field rules, one change triggers only the validators that actually touched the changed field. There's no "re-run everything on any change."

## Why it's built this way

The two-state model is load-bearing. Without it:

- Early feedback modes would require running validators lazily, which breaks submit semantics.
- Late feedback modes would require deferring validator execution, which breaks `$isValid` accuracy.
- Async validators would race with visibility flips in confusing ways.

With it, every store has one job. `$hiddenError` is "what is true right now." `$visible` is "has the user earned the right to see it yet." `$error` is their conjunction. Each piece is independently testable and independently configurable.

## See also

| Topic | Link |
|---|---|
| The mode API | [Validation modes](/reference/forms/validation-modes) |
| Why visibility is split | [Hidden vs visible errors](/explanation/hidden-visible-errors) |
| Validator interfaces | [Validators](/reference/forms/validators) |
| Submission flow | [How-to: Handle submission](/how-to/handle-submission) |
| Async specifics | [How-to: Add async validation](/how-to/add-async-validation) |
