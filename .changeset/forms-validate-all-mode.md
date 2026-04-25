---
"@kbml-tentacles/forms": patch
---

Fix `validate.mode: "all"` (and `"change"`) not running validation on
form mount, and fix `shape.validate()` being a no-op.

Two related issues:

- When a form was created with `validate: { mode: "all" }` or
  `"change"`, `validateAll()` was never invoked at startup, so errors
  for empty/invalid initial values stayed hidden until the user
  interacted with a field. The runtime now calls `validateAll()`
  immediately during construction whenever the configured mode is `all`
  or `change`. The same wiring also propagates into form arrays — each
  newly-built row runs `validateAll()` if its parent's mode dictates it.
- `shape.validate()` had no listener attached, so calling it did
  nothing. It is now wired to fire `validateAll()` + `showAllErrors()`
  on the underlying validation runner, matching what callers
  (and the docs) already assumed.

Form arrays additionally re-export the form-level `validateAll` /
`showAllErrors` events through their runtime context so cross-row
revalidation propagates correctly when the parent form forces a full
revalidate.
