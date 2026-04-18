# Enable SSR

Tentacles is built on effector v23 and inherits its scope-based SSR model. Every store created by the library has a deterministic SID, so a `fork()` on the server can be serialised and rehydrated on the client without manual plumbing.

## The SSR model

Effector v23 SSR works in three phases:

1. **Fork** — create a per-request `Scope` with `fork()`. All subsequent reads and writes go through this scope instead of the global stores.
2. **Run effects** — drive state changes via scoped effects (`Model.create(data, { scope })`, `allSettled(fx, { scope })`). The global stores remain untouched.
3. **Serialize and ship** — `serialize(scope)` extracts the scoped store values by SID; send the result as JSON to the client; call `fork({ values })` to rehydrate.

Because stores are keyed by SID, every request on the server sees its own isolated values, and the client-side fork lines up with the server by matching SIDs exactly.

Tentacles contributes two things to this model:

- `createContract()`, `createViewContract()`, and `createModel()` call `detectSidRoot()` internally to compute a stable prefix for field stores.
- `$dataMap`, `$instanceSlice`, registry stores, and indexes all carry SIDs so they serialise cleanly.

You do not need to call `createStore(..., { sid })` anywhere.

## Configure the babel plugin

Determinism requires every `createStore` call site to get a predictable SID. The library ships a babel plugin that injects SIDs at call sites (including `createStore`, `createContract`, `createViewContract`, and friends).

The plugin lives inside the package. The canonical resolution path from user code is `@kbml-tentacles/core/babel-plugin-tentacles-sid`. Add it to every bundle that compiles Tentacles code — server and client, since SIDs must match on both sides.

### Plain Babel projects

In `babel.config.js` or `.babelrc.js`:

```js
module.exports = {
  presets: ["@babel/preset-typescript"],
  plugins: [
    "@kbml-tentacles/core/babel-plugin-tentacles-sid",
    // other effector-related plugins, e.g. "effector/babel-plugin"
  ],
}
```

Run the same config for both server and client builds. The plugin derives SIDs from file paths and call-site positions, so matching input produces matching output regardless of target.

### Next.js

Next.js uses SWC by default. If you keep the SWC pipeline, consult the Next.js docs for the latest on mixing SWC with babel plugins — the exact wiring varies per Next.js version and sometimes requires opting back into babel for specific directories. If your bundler uses swc, see the Next.js guide for the current recommended pattern; exact wiring varies between releases.

The safest path today, if your Next.js version supports it, is to drop a `babel.config.js` (or `.babelrc`) at the project root so Next falls back to babel:

```js
// babel.config.js
module.exports = {
  presets: ["next/babel"],
  plugins: ["@kbml-tentacles/core/babel-plugin-tentacles-sid"],
}
```

Alternatively, if you prefer to stay on SWC, Tentacles works correctly as long as every contract and model is declared in a file the plugin can rewrite. Some teams isolate contracts in a package built with its own babel config and import the pre-compiled output into the Next app.

Do not hand-author SID options on contracts or stores — let the plugin do it.

## Create inside a scope

Every Tentacles model exposes an effect-backed `create` that accepts an optional `{ scope }` option.

```ts
import { fork } from "effector"
import { userModel } from "./models/user"

export async function handleRequest() {
  const scope = fork()

  // Writes go through the scope, never the global stores.
  await userModel.create({ name: "Alice" }, { scope })
  await userModel.create({ name: "Bob" }, { scope })

  return scope
}
```

Key points:

- `Model.create(data, { scope })` returns a `Promise` — Tentacles uses `allSettled(Model.createFx, { scope, params: data })` under the hood.
- `Model.create(data)` without a scope returns the instance synchronously from the global store.
- Other model operations (`updateFx`, `deleteFx`) follow the same pattern; pass `{ scope }` for server-side mutations.

If you prefer to drive effects manually, import `allSettled`:

```ts
import { allSettled } from "effector"

await allSettled(userModel.createFx, {
  scope,
  params: { name: "Alice" },
})
```

Both paths produce identical results.

## Inspect scoped state

Reading scoped state goes through `scope.getState(...)`, not `$store.getState()`:

```ts
const scope = fork()
await userModel.create({ name: "Alice" }, { scope })

scope.getState(userModel.$count)       // 1
scope.getState(userModel.$ids)         // [ "<pk>" ]
scope.getState(userModel.$dataMap)     // { "<pk>": { name: "Alice" } }
```

On the server, this is how you render components against per-request state. The library never calls `$store.getState()` internally (rule of the codebase), so there is no accidental leakage into the global scope.

You can read any store that the model or one of its queries exposes:

```ts
scope.getState(userModel.$instances)                   // Map<id, FullInstance>
scope.getState(userModel.indexes.$version)             // incremented on writes

// Collection queries are stores too — drive them from the same scope.
const activeUsers = userModel.query().where("active", eq(true))
scope.getState(activeUsers.$list)
scope.getState(activeUsers.$count)
```

If a component relies on derived stores that only materialise lazily (for example field-level stores exposed by `combine`), call the materialiser once before serialising so the value ends up in the payload.

## Serialize and send to the client

`serialize(scope)` walks the scope and emits `{ [sid]: value }`. Ship this alongside the rendered HTML:

```ts
import { serialize } from "effector"

export async function renderPage() {
  const scope = fork()
  await userModel.create({ name: "Alice" }, { scope })

  const html = renderToString(<App scope={scope} />)
  const state = serialize(scope)

  return { html, state }
}
```

The payload is plain JSON. It contains values for every scoped store that differs from its default — including Tentacles' `$dataMap`, `$ids`, and index stores.

Embed the payload in the HTML response however your framework prefers:

```ts
// server
return `
  <html>
    <body>
      <div id="root">${html}</div>
      <script>
        window.__EFFECTOR_STATE__ = ${JSON.stringify(state).replace(/</g, "\\u003c")};
      </script>
    </body>
  </html>
`
```

On the client, read it back and hydrate:

```ts
import { fork } from "effector"

const initialState = window.__EFFECTOR_STATE__  // injected by server
const scope = fork({ values: initialState })
```

From here, wrap your app with effector's provider (`effector-react/scope` or framework-specific equivalents) so components read from `scope` rather than the global stores.

Rehydration is idempotent: running `fork({ values })` with the same payload twice produces two scopes with identical state. If the payload includes an unknown SID (for example after a contract change that removed a field), effector silently ignores it rather than throwing.

## Concurrent request isolation

Multiple simultaneous `fork()` calls on the same server do not share state:

- Each scope carries its own store values, addressed by SID.
- Tentacles uses `withRegion` for per-instance stores, so instance state is pinned to the region created inside that scope.
- Model-level events fire inside the scope that invokes them; handlers wired through `sample` stay scoped.

In other words, you can handle thousands of concurrent requests with a single Node process without guards, provided every request creates its own scope and funnels writes through `{ scope }`.

## Gotchas

### Do not reuse a scope across requests

A scope models a single logical session. Reusing it across two HTTP requests leaks state. Fork anew at the start of every request and discard the scope when the response is flushed.

### Use `allSettled` (or `Model.create(data, { scope })`) for mutations

Calling `Model.createFx(data)` without `allSettled` or the `{ scope }` option runs the effect in the global scope, even if your render happens in a forked one. Always go through `allSettled` or the `{ scope }` helper for server-side writes.

### Synchronous `Model.create` is fine on the client

On the client, once you have a hydrated scope, components drive updates via scoped events and effects. Direct calls like `Model.create(data)` still work for throwaway demos or tests, but production code inside a scoped provider should keep going through `allSettled`/`{ scope }`.

### Derived state is rebuilt from base stores on hydrate

Only primary stores carry SIDs that round-trip through `serialize`. Derived stores (`.map()` results, `derived` fields, query outputs) rebuild themselves from their sources during `fork({ values })`. You do not — and should not — persist them manually.

### Babel plugin is non-optional for SSR determinism

Without the plugin, Tentacles falls back to generated SIDs that include counters. Counters are deterministic within a single process but not across server and client builds, so serialisation works but hydration fails silently (values do not reattach). The plugin is only required if you want the server-produced payload to apply on the client — which you always do in SSR.

### Effects respect scope automatically

When an effect is called via `allSettled(..., { scope })`, any internal `sample` or effect chain runs inside the same scope. Tentacles' model-level effects (`createFx`, `updateFx`, `deleteFx`) follow this contract, so you rarely need to pass `{ scope }` to nested handlers explicitly.

## Checklist

A minimal SSR-ready setup looks like this:

1. Add `@kbml-tentacles/core/babel-plugin-tentacles-sid` to every bundler config that compiles Tentacles code. Keep server and client configs in sync.
2. Declare contracts and models at module scope, not inside request handlers, so SIDs are stable across requests.
3. In the request handler, call `fork()` once, then drive writes with `Model.create(data, { scope })` or `allSettled(fx, { scope, params })`.
4. Read state exclusively through `scope.getState(...)`; never through `$store.getState()`.
5. Call `serialize(scope)` at the end of the render pass and embed the result into the HTML.
6. On the client, pull the payload out of the DOM (or wherever you injected it) and call `fork({ values })`.
7. Wrap the client tree with effector's scope provider so components resolve stores through the hydrated scope.

Following those seven steps keeps the per-request data isolated and produces matching state on the client. Everything else — queries, view models, inverses, indexes — inherits scope behaviour without extra configuration.

## Quick end-to-end example

Putting the pieces together on a hypothetical Node request handler:

```ts
import { allSettled, fork, serialize } from "effector"
import { renderToString } from "react-dom/server"
import { Provider } from "effector-react/scope"
import { userModel } from "./models/user"
import { App } from "./App"

export async function render(req) {
  const scope = fork()

  await allSettled(userModel.createFx, {
    scope,
    params: { name: req.query.name ?? "Guest" },
  })

  const html = renderToString(
    <Provider value={scope}>
      <App />
    </Provider>,
  )

  const state = serialize(scope)
  return { html, state }
}
```

On the client:

```ts
import { fork } from "effector"
import { hydrateRoot } from "react-dom/client"
import { Provider } from "effector-react/scope"
import { App } from "./App"

const scope = fork({ values: window.__EFFECTOR_STATE__ })

hydrateRoot(
  document.getElementById("root")!,
  <Provider value={scope}>
    <App />
  </Provider>,
)
```

With the babel plugin in place, the server payload lines up with the client scope by SID and the app continues from exactly the state rendered on the server.
