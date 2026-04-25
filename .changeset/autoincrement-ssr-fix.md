---
"@kbml-tentacles/core": patch
---

Fix `autoincrement()` colliding with server-seeded ids on the client
under SSR.

`createFx` / `createManyFx` now read the autoincrement counter store via
`attach({ source })` so effector hands the **scope-current** snapshot to
the handler. Previously the handler closed over the default-store
counter (which always starts at `0` on the client), so the first
client-side `model.create(...)` after hydration would issue id `1` —
already taken by a server-seeded row — and the new instance would
overwrite the existing one in `$dataMap`.

With the fix, the client scope sees the hydrated counter (e.g. `5` if
the server seeded ids `1..5`) and the next id allocated client-side is
`6`. No API change; existing SSR apps just stop producing ghost rows
after the first post-hydration `create`.
