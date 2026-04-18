# Reset and keep state

Two distinct operations: `reset()` restores fields to their defaults, `resetTo(values)` installs new initial values and clears dirty flags. Both accept a `KeepStateOptions` payload so you can preserve specific slices (like submit count, or errors from a failed attempt).

## What you will learn

- When to use `reset()` vs `resetTo(values)`
- Every field in `KeepStateOptions`
- Per-field `.resetOn("eventName")`
- The `resetCompleted` lifecycle event

## `reset()` vs `resetTo(values)`

| Call | Values become | `$initial` changes? | Use case |
|---|---|---|---|
| `form.reset()` | each field's `$default` | no | Clear form after submit; undo button |
| `form.resetTo(values)` | the passed values | yes — these become the new `$initial` | Load existing record for editing |

After `resetTo`, `$dirty` is false for every field because `$value === $initial`. Subsequent edits flip `$dirty` normally.

```ts
// Clear signup form to blank defaults
form.reset()

// Prefill edit form from server data
form.resetTo({
  email: user.email,
  password: "",
  confirmPassword: "",
  newsletter: user.newsletter,
})
```

## `KeepStateOptions` — the full table

Pass via the `{ keepX: true }` payload to `reset()` or `resetTo()`, or set once via `createFormViewModel({ resetOptions })`:

| Option | Preserves |
|---|---|
| `keepValues` | current `$value` on every field (reset only touches meta) |
| `keepDirty` | `$dirty` flags; useful with `keepValues` |
| `keepErrors` | `$error` stores and visibility |
| `keepTouched` | `$touched` flags |
| `keepSubmitCount` | `$submitCount` |
| `keepIsSubmitted` | `$isSubmitted` |
| `keepIsSubmitSuccessful` | `$isSubmitSuccessful` |
| `keepDisabled` | `$disabled` states |

### VM-level defaults

```ts
createFormViewModel({
  contract: signupContract,
  resetOptions: {
    keepSubmitCount: true,   // keep submission metrics across reset
  },
  fn: (form) => form,
})
```

Any `reset()` call inherits these unless overridden at call time.

### Call-time overrides

```ts
form.reset({ keepErrors: true })      // clear values but keep the red squiggles
form.resetTo(serverData, { keepSubmitCount: false })
```

The call-time payload wins over `resetOptions`.

## Common patterns

### Clear after successful submit

```ts
sample({
  clock: signupFx.done,
  target: form.reset,
})
```

Pair with `keepIsSubmitSuccessful: true` in `resetOptions` if you want to keep the "done" badge visible until the user starts a new submission.

### Revert to last-saved state

Keep a snapshot when the form loads and reset to it on cancel:

```ts
const $snapshot = createStore<Values | null>(null)
sample({ clock: form.submitted, target: $snapshot })

sample({
  clock: cancelClicked,
  source: $snapshot,
  filter: Boolean,
  target: form.resetTo,
})
```

### Preserve user edits across a server fetch

If the user starts typing before the initial fetch returns, you don't want `resetTo(serverData)` to clobber their input. Use `keepDirty` to preserve fields the user has touched:

```ts
fetchUserFx.doneData.watch((user) => {
  form.resetTo(user, { keepDirty: true })
})
```

Dirty fields keep their current value; non-dirty fields adopt the server's.

## Per-field `.resetOn(event)`

Declare at contract time that a field should reset when a specific event fires on the form shape:

```ts
createFormContract()
  .field("search", (f) => f<string>().default(""))
  .field("page", (f) => f<number>().default(0).resetOn("search"))
```

Every time `search` changes, `page` snaps back to its default. Convenient for "clear pagination when the filter changes" flows. `resetOn` accepts a single event name or an array.

```ts
.field("results", (f) =>
  f<Result[]>().default([]).resetOn(["search", "filter", "sort"]),
)
```

## The `resetCompleted` event

Fires once after `reset()` / `resetTo()` finishes applying. Use it for teardown effects (cancelling in-flight requests, closing dialogs):

```ts
fn: (form) => {
  form.resetCompleted.watch(() => {
    cancelInFlightFx()
  })
  return form
}
```

`resetCompleted` payload is the values after reset — useful if you want to log what the form is now showing.

## Resetting a single field

Each `Field<T>` has its own `reset()` and `resetTo(value)`:

```ts
form.email.reset()              // back to $default
form.email.resetTo("new@x.com") // new initial; $dirty becomes false
```

Use this when one field should reset independently (e.g., clearing only the password after a failed login).

## Resetting a form array

A `FormArrayShape` inherits the array's row defaults. `replace(rows)` sets a new list; `clear()` empties it. Neither touches the array-level `$arrayError` — clear it manually if needed:

```ts
form.contacts.clear()
form.contacts.$arrayError.reinit()
```

To reset every row to its contract defaults (preserving count), call `reset()` on each row via the array's `$instances`:

```ts
const $rows = form.contacts.$instances
$rows.getState().forEach((row) => row.reset())
```

## See also

| Topic | Link |
|---|---|
| All `FormShape` events and stores | [Reference: FormShape](/reference/forms/form-shape) |
| Field-level reset | [Reference: Field](/reference/forms/field) |
| Submit flow | [How-to: Handle submission](/how-to/handle-submission) |
| Why `$initial` and `$default` differ | [Explanation: Validation lifecycle](/explanation/validation-lifecycle) |
