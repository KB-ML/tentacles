---
description: "Add debounced async validators to form fields with cancellation and predictable visibility rules."
---

# Add async validation

Validate a field against a server — username availability, email verification, coupon redemption — without blocking the UI thread or flooding the backend with every keystroke.

You will learn:

- How `.validateAsync(fn, opts)` differs from `.validate(fn)`
- Why debouncing matters and what values to pick
- How `ctx.signal.aborted` guards against stale writes
- When to override `mode` with `runOn` on a single field
- Which UI stores to read so the user sees "checking…" correctly
- How submit interacts with still-running async validators

## The signature

`.validateAsync(fn, opts?)` attaches one async validator to a field. The function receives the same `(value, ctx)` pair as `.validate()`, but it returns `Promise<ValidationResult>`.

```ts
import { createFormContract } from "@kbml-tentacles/forms"

const SignupContract = createFormContract()
  .field("username", (f) => f<string>()
    .default("")
    .required()
    .validateAsync(
      async (value, ctx) => {
        const res = await fetch(`/api/username/${encodeURIComponent(value)}`, {
          signal: ctx.signal,
        })
        if (ctx.signal.aborted) return null
        const { taken } = await res.json()
        return taken ? "Username is already taken" : null
      },
      { debounce: 300 },
    ),
  )
```

The same field may chain several `.validateAsync()` calls — each one gets its own debounce timer and abort controller. The runner fires them in parallel and collects every result.

## Why debounce matters

Typing "alice" in a username field triggers five change events — `a`, `al`, `ali`, `alic`, `alice`. Without a debounce each keystroke launches a network request. Even with abort controllers the server sees five connections, and the UI flickers between "checking…" and "available" rapidly.

| User experience | `debounce` value |
|---|---|
| Feels immediate, fires on every brief pause | `150ms` |
| Typical "waits for typing to stop" feel | `250ms`–`400ms` |
| Conservative; long forms or slow backends | `500ms`–`800ms` |

The debounce is per validator, not per field. If two async validators target the same field with different debounce values, they run independently on their own timers. Setting `debounce: 0` fires on every change — rarely what you want, but useful when the "value" you validate is already a committed choice (e.g. a button click that writes a numeric code).

`.validateAsync` does not debounce sync validators on the same field — those still fire immediately. The UI sees sync errors before the async one even starts.

## Cancel with `ctx.signal`

Every validator run gets a fresh `AbortController`. When the field changes again before the previous validator finishes, the previous run's signal flips to `aborted`. Pass `ctx.signal` to `fetch` and check it before writing the result.

```ts
.validateAsync(async (value, ctx) => {
  try {
    const res = await fetch(`/api/unique?v=${value}`, { signal: ctx.signal })
    if (ctx.signal.aborted) return null
    const data = await res.json()
    if (ctx.signal.aborted) return null
    return data.ok ? null : "Taken"
  } catch (err) {
    if (ctx.signal.aborted) return null
    // network error — do not surface as a validation error
    console.error(err)
    return null
  }
})
```

Why two separate `signal.aborted` checks? The first rejects when fetch itself was aborted. The second rejects between `await res.json()` resolving and the return statement — a subtle but real race in slow-JSON environments. Short-circuit every awaited boundary.

Without these checks, a stale validator can overwrite a newer result with an outdated verdict — the "Taken" error survives even after the user has typed a new, available name.

## `runOn` override

`runOn` lets one async validator follow a different schedule than the form and the field. It accepts the same `ValidationMode` values — `"submit"`, `"blur"`, `"change"`, `"touched"`, `"all"`.

```ts
.field("email", (f) => f<string>()
  .default("")
  .required()
  .validateOn("change")              // sync validators run on change
  .validateAsync(syntaxCheckSync,  { runOn: "change" })
  .validateAsync(domainLookupAsync, { runOn: "blur", debounce: 200 }),
)
```

Why: the syntax check is cheap and local, so it runs on every change. The DNS lookup is expensive and the user will resent every keystroke costing a round-trip, so it waits for blur. `runOn` lets both validators live on the same field with different UX contracts.

Omit `runOn` to inherit the field's `.validateOn()`, which in turn inherits the form-level `mode`.

## UI gating with `$isValidating` and `$validatingFields`

While async validators are in flight, two reactive stores let you show "checking…" badges without race conditions:

| Store | Shape | Meaning |
|---|---|---|
| `form.$isValidating` | `Store<boolean>` | Any async validator anywhere in the form is running |
| `form.$validatingFields` | `Store<ReadonlySet<string>>` | Set of field paths currently validating |
| `form.username.$validating` | `Store<boolean>` | That specific field has a pending async validator |

Render the field-level store for per-input spinners and the form-level store for a "Still checking…" banner on the submit button.

```tsx
// React example — see /how-to/integrate-with-react for full setup
function UsernameField() {
  const { value, error, validating, register } = useField(form.username)
  return (
    <label>
      <input {...register()} />
      {validating && <span>Checking availability…</span>}
      {error && <em>{error}</em>}
    </label>
  )
}
```

Note the ordering: if both `validating` and `error` would show, the error usually wins — render them in the order that matches your UX. The store flips `validating: false` the instant the final async validator resolves.

## Submit waits for pending async

Hitting submit while an async validator is still running does *not* let the form race through. The submit orchestrator pauses until every pending async validator settles, then routes to `submitted` or `rejected` based on the final error map. You do not need to `await` anything from userland — the orchestrator handles the ordering internally.

This also means two rapid submits are coalesced: the second one hits the preventDoubleSubmit guard (see [Handle submission](/how-to/handle-submission)) and is dropped.

For SSR, the `AsyncRunner` (defined in `packages/forms/src/validation/async-runner.ts`) exposes a `flushAll()` method called before serialization — any validator scheduled during render is awaited so the hydrated client sees a consistent error map.

## Network errors — error or pass?

An async validator that throws writes the thrown message to `$error`. This is almost always wrong for a network failure — the user did not enter an invalid value, the server just could not answer. Catch errors and decide explicitly:

```ts
.validateAsync(async (value, ctx) => {
  try {
    const res = await fetch(`/api/check/${value}`, { signal: ctx.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.ok ? null : "That value is not allowed"
  } catch (err) {
    if (ctx.signal.aborted) return null
    // Policy decision:
    //   - return null → treat network error as "no error, try again later"
    //   - return "Network error, please retry" → surface it to the user
    return null
  }
})
```

Surfacing a "Network error" message is tempting but creates a loop where the user cannot proceed until the network returns. Usually the safer default is to swallow the error at validation time and instead show a toast or banner from a higher-level effect. Reserve visible validator errors for things the user can fix.

## Mixing sync and async on one field

The runner always fires sync validators first and then queues async ones. A sync failure short-circuits the async fetch — no reason to hit the network if the format is already wrong.

```ts
.field("email", (f) => f<string>()
  .default("")
  .required()
  .validate((v) => /@/.test(v) ? null : "Enter a valid email")
  .validateAsync(async (v, ctx) => {
    const res = await fetch(`/api/email/check/${v}`, { signal: ctx.signal })
    if (ctx.signal.aborted) return null
    return (await res.json()).taken ? "Already registered" : null
  }, { debounce: 300 }),
)
```

Visible behaviour: the user types "bob", sees "Enter a valid email" immediately; types "bob@x.co", the sync check passes, the async validator debounces 300ms, then "Already registered" appears.

## Summary

Async validators follow four rules:

1. Every run gets a fresh `AbortController`; check `ctx.signal.aborted` before returning.
2. Debounce sensibly (250–400ms for user-typed fields).
3. Use `runOn` when one async validator needs a different trigger than the rest.
4. Treat network failures as "no result" unless you have a strong UX reason to surface them.

## See also

| Page | What it covers |
|---|---|
| [Add sync validation](/how-to/add-sync-validation) | `.validate()`, `.custom()`, `.warn()` and scheduling |
| [Handle submission](/how-to/handle-submission) | Submit / rejected lifecycle and double-submit guard |
| [Cross-field validation](/how-to/cross-field-validation) | Chain-level `.validate(values => …)` |
| [Enable SSR](/how-to/enable-ssr) | `flushAll()` for server-rendered form state |
