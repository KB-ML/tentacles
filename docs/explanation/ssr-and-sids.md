# SSR and SIDs

Server-side rendering in a reactive framework is a story about identity.

You have state on the server. You serialize it and send it to the client. The client deserializes it and resumes where the server left off.

For that to work, every piece of state needs a stable identifier that means the same thing in both places.

In effector, that identifier is called an SID.

This page is about what SIDs are, how Tentacles makes them work without asking the user to think about them, and what scoped effector operations (`fork`, `serialize`, `allSettled`) buy you at runtime.

By the end you should understand why `Model.create(data, { scope })` returns a Promise, what the babel plugin is doing, and why scope isolation matters for any server that handles concurrent requests.

## What an SID is

SID stands for "store identifier."

It is a string that effector attaches to every store and every scoped effect.

Two stores with the same SID are considered the same store for purposes of serialization and scope isolation.

### Serialization and hydration

When you call `serialize(scope)`, effector walks the scope's state, and the output is an object keyed by SID.

When you call `fork({ values: serialized })`, effector re-hydrates by matching the keys against the SIDs of the stores that exist on the client.

### The stability requirement

The key property is stability across server and client.

If a store has SID `"abc-123"` on the server and `"abc-456"` on the client, the hydration misses.

The client's store never gets the server's value, and the UI re-renders with whatever the client initialized to.

That is a silent bug — it does not throw, it just produces the wrong screen.

### Compile-time generation

SIDs are generated at compile time.

Effector's ecosystem has a babel plugin (`@effector/babel-plugin`) and a swc plugin (`@effector/swc-plugin`) that rewrite every `createStore`, `createEvent`, `combine`, and similar call to include an SID derived from the source file and the call's position.

Because the compiler sees the same code on the server and the client, the SIDs match.

### Manual SIDs

Manual SIDs are also possible — you can write `createStore(0, { sid: "my-counter" })` — but for a library that creates many stores internally, manual SIDs are impractical.

Tentacles is a library that creates many stores internally.

The plugin is how we avoid forcing the user to name each one.

## The babel plugin and module paths

The standard effector babel plugin assigns SIDs based on the file path and the call location.

A store created at `src/features/auth/store.ts` line 10 column 5 gets a different SID from one created at `src/features/posts/store.ts` line 10 column 5.

The bundler, not the plugin, is responsible for making sure those paths are stable across builds.

Most bundlers are.

### Why Tentacles needs special handling

Tentacles's stores are not created at user-visible call sites.

When you write `createContract().store("title", ...).pk("id")`, the chain is a builder; the actual `createStore` calls happen later, inside `createModel`.

The SID assigned by the plugin corresponds to the call inside `createModel`, which is the same line and column for every model.

That alone would give every model the same SIDs, which is wrong.

### The fix

The fix is a two-step: the babel plugin injects an SID into a probe call at the site of `createContract()`, and Tentacles reads that probe's SID to determine a unique prefix, then uses the prefix when it creates the model's actual stores.

This is what `detectSidRoot` does.

## How `detectSidRoot` works

When you call `createContract()`, the library creates a small, throwaway effector store inside that call and immediately reads its `sid` property.

The store is discarded.

The SID tells the library where in the source code `createContract()` was called — which is what we actually want to know.

### Storing the root

The library stashes that SID as the contract's `sidRoot` and uses it as a prefix for every SID it generates later for this contract.

### The consequence

The consequence is that every `createContract()` call has a different `sidRoot` (because each call happens at a different source location).

Every model derived from that contract has SIDs prefixed with `sidRoot`.

The model's `$dataMap`, its `$ids`, its events — all of them carry SIDs that start with the contract's root.

### When the plugin is missing

This scheme needs the plugin to be running.

If the plugin is not configured, the throwaway store's `sid` is undefined, and Tentacles falls back to a randomly-generated root.

The fallback is not SSR-safe, because random roots do not match across server and client.

The library issues a `tentaclesWarn` when it detects this situation, so you get a console message pointing at the problem.

### In practice

In practice, almost all users either have the plugin running (through a bundler preset) or run on the server with a similar mechanism.

Next.js projects get it from `@effector/next`.

Vite projects get it from `@effector/babel-plugin` applied through the Babel integration.

The library does not assume your setup; it just asks that you configure the plugin, and it gives you a warning when you have not.

## What `fork` does

`fork()` creates a scope.

A scope is an isolated copy of every effector store in your application.

Two scopes have independent state: a write in one does not affect the other.

### Why this matters for SSR

This is the mechanism that makes SSR safe for concurrent requests — you fork a scope per request, do your work in that scope, serialize the scope, and throw it away.

The next request gets a fresh fork, starting from the global defaults.

### The mechanism

Concretely, `fork()` walks the set of every SID-annotated store in your bundle and creates a parallel state for each one.

The fork does not clone the stores themselves; it clones their state.

Reads and writes on the scope go through a scope-aware `.getState()` and scope-aware propagation.

The stores are still the same JavaScript objects, but they carry multiple state copies, one per active scope.

### Rehydration

`fork({ values })` is the rehydration variant.

You pass a serialized object (the one produced by `serialize(scope)` on the server), and the fork initializes its state from those values instead of from the store defaults.

The values are keyed by SID, which is why stable SIDs are critical: the mapping has to find each store on the client to install its initial value.

## What `serialize` does

`serialize(scope)` walks the scope and produces an object keyed by SID whose values are the current state of each scoped store.

By default, it only includes stores whose state differs from the default — which is usually what you want for SSR, since you only need to transport changes.

### The output

The output is a plain JavaScript object, which means it can be sent to the client as JSON.

In Next.js, you typically embed it in the initial HTML as a `<script>` block.

The client parses it and uses it to fork the scope.

### What Tentacles contributes

Tentacles's `$dataMap` is the big one to serialize.

It holds every instance's data.

`serialize(scope)` picks it up along with everything else, because it has an SID just like any other store.

You do not need to do anything special to include your models in the serialization.

Fork them, mutate them, serialize the scope. The model state travels with it.

## What `allSettled` does

`allSettled(event, { scope, params })` is effector's way to run an event in a specific scope and wait for all side effects to complete.

It returns a Promise that resolves when the effect chain reaches a steady state in the scope.

### Why it matters for Tentacles

The reason it matters for Tentacles is that `Model.create(data, { scope })` runs through `allSettled` internally.

Creating an instance fires an effect (`createFx`), which runs reducers, which may trigger downstream effects.

On the server, you need to wait for all of that to settle before you serialize, or else you serialize an incomplete state.

`allSettled` is the waiting mechanism.

### Why `Model.create` returns a Promise

Because `allSettled` is asynchronous, `Model.create(data, { scope })` returns a Promise.

This is why the tutorial's SSR example awaits it.

In the global scope, `Model.create(data)` is synchronous — effects propagate synchronously in the global scope, or at least, close enough that the library can return the instance directly.

In a forked scope, the effect propagation goes through the scope's async machinery, and the call has to await.

### The pragmatic choice

This is one of the handful of places where the library's API shape depends on whether you are in a scope or not.

We considered making it always async, which would have kept the types simpler, but the ergonomic cost of awaiting every create in regular application code was not worth it.

The split is pragmatic: sync in the global scope, async in a forked scope.

## Scope isolation in practice

For SSR, the workflow is roughly:

1. Per request, `const scope = fork()`.
2. Inside the request handler, `await Model.create(data, { scope })` for any models you populate.
3. Run any queries or views that depend on the scope.
4. Render the HTML with the scope-aware `useUnit` (React) or `<provide-scope>` (Vue).
5. `const values = serialize(scope)`.
6. Embed the values in the HTML, drop the scope, return the response.

### Concurrent requests

For concurrent requests, each gets its own scope.

They do not interfere.

The global scope stays at its defaults.

The library's stores — model registries, query caches, view model definitions — are shared between all scopes because they are compile-time singletons, but their state is scope-local.

### When isolation is not perfect

The isolation is not perfect.

Closures captured at module load (module-level `let` bindings, imperative `.on(...)` calls on stores) are shared across scopes, because they are not scope-aware.

Tentacles goes out of its way to avoid module-level state: there is no global instance cache, no top-level event wiring outside of `fn`.

The `fn` builder runs when you call `createModel`, which is at module load, so its wiring is shared — but its wiring is over effector stores, which are scope-aware, so the shared graph produces per-scope behavior.

### The risk in `fn`

If you happen to write imperative code inside `fn` that captures module-local variables, those captures leak across scopes.

The library cannot catch this automatically.

The rule of thumb is that `fn` should wire stores and events through effector primitives, not through JavaScript mutation, and if you stick to that the isolation holds.

## Why every Tentacles store has an SID

Because of `detectSidRoot` and the plugin, every store Tentacles creates carries an SID.

The shared `$dataMap`, the `$ids` registry, the `$idSet`, `$count`, the lazy `$instances`, the event-backed `updateFx`, the per-instance slice stores when they materialize — all of them have SIDs.

### Complete coverage

When you `serialize(scope)`, the output includes everything the library has set up for that scope.

There are no hidden stores that escape serialization.

### The cost

The cost of this is that the serialized object can be large.

A model with ten thousand instances, each with ten fields, has a `$dataMap` whose state is a hundred-thousand-entry object.

The SID for `$dataMap` maps to that entire object.

Serializing it is O(N), and the JSON payload is proportional to the data.

### When SSR is not the answer

For large data, SSR is not the right transport.

You do not want to inline ten thousand records in the HTML.

The pattern we recommend for that case is to SSR the shell (the page that tells the user where they are), hydrate the client quickly, and let the client fetch the data via normal network requests.

The library makes this easy: you do not have to create the instances on the server if you do not want to.

Only the models you populate on the server carry server state.

## Why scope leaks are insidious

A scope leak is when state from one request ends up visible to another.

It is not a theoretical worry; it is a common class of bug in server-side applications.

The typical cause is some module-level variable that should have been scope-local but is shared across requests because the code was written with the client in mind.

### Why effector's model helps

The effector scope model is a good defense, because it forces every store's state to live in the scope.

If you stay within effector primitives, you cannot accidentally leak.

The risk is in the boundary code — the glue between effector and the rest of your application.

### What Tentacles does to close gaps

Tentacles tries to close the boundary holes.

`Model.create(data, { scope })` routes through `allSettled`, which ensures the effect runs in the right scope.

`Model.query()` uses a memoized `CollectionQuery` whose stores are scope-aware.

`scope.getState(bookModel.$count)` reads the count in the right scope.

The proxy field accessors route through the scope when called inside a scope-aware framework binding.

### The subtle risk

The one place this can get subtle is in user `fn` code.

If `fn` does something like `const cache: Map<string, number> = new Map()` and then reads or writes that cache in response to events, the cache is shared across scopes.

Two concurrent requests would see each other's cache state.

This is the user's code, not the library's, but the library's documentation tries to make this risk explicit.

### The rule

The rule: anything you need to persist across events should be in a store.

The library provides stores as the default way to hold state precisely because they are scope-aware.

Ad-hoc JavaScript structures are not.

## Testing scope behavior

The library tests every feature in three modes: default (global scope), SSR (fork, serialize, fork-with-values), and memory leaks.

### The SSR test

The SSR test typically runs the feature in a scope, serializes, and then forks a fresh scope from the serialized output.

If the behavior matches the original, the feature is SSR-safe.

If something is missing, it usually shows up as a failed assertion on the post-hydration scope.

### The memory test

The memory leak test runs the feature, then destroys the scope (or the instances), and checks that no references to the test objects remain.

This is how we catch leaks in the region machinery and in anything that uses `withRegion`.

### Why three modes are required

These tests are in `packages/core/tests/` alongside the default tests.

They are part of the contract that each feature supports all three modes.

If you are building a feature that interacts with scopes, you will write tests in all three shapes — it is not optional.

## The shape of the guarantee

The guarantee Tentacles makes is: if you configure the effector plugin and stick to the library's primitives, scope isolation and serialization work without extra effort.

You fork, you do your thing, you serialize, you send it, you re-fork on the client, and the state matches.

The library handles SID generation, store identification, and async effect completion.

### The costs

The cost is the plugin dependency (a small setup step), the `allSettled` wrapping in `Model.create` when scoped (a small ergonomic friction), and the size of the serialized output when models carry a lot of data (a limit on what you want to serialize versus what you want to fetch on the client).

### All manageable

All three costs are the kind of thing you manage, not the kind of thing that breaks.

The library tries to keep them visible — through warnings, through the async signature of scoped creates, through documentation — so that you know what you are choosing when you choose.

## Why SIDs are per-scope, not global

An SID is a store's identity. Two stores with the same SID are the same store for purposes of serialization.

But the state is per-scope, not per-SID. A store has one SID and many state copies — one for each active scope.

This is how scope isolation works at the level of a single store: the store is shared (it is the same JavaScript object) but the state is split (each scope has its own cell).

### The implication

The implication is that SIDs do not uniquely identify a piece of state; they identify a piece of shape.

If you want to compare state across scopes, you read the same SID in each scope and get different values.

If you want to compare shape (are these the same store?), you compare SIDs.

Tentacles uses SIDs consistently this way. The model's `$dataMap` has one SID. Its state in the global scope differs from its state in any forked scope. Serialization captures per-scope state, keyed by SID.

## The babel plugin and where it fits

The babel plugin is the piece that makes all of this work without user intervention.

It rewrites your source code at build time, injecting SIDs into every effector call. The rewrite happens once, before your code is bundled. The rewritten code is what ships.

On the server, it runs (rewritten) and produces SIDs.

On the client, the same rewritten code runs and produces the same SIDs.

### If the plugin is not running

If the plugin is not running on either side, or if it is configured differently on each side, the SIDs diverge, and hydration fails silently.

The library warns when it can detect this at startup (via `detectSidRoot`), but it cannot catch every configuration error.

The best way to avoid plugin-configuration bugs is to centralize the bundler configuration across server and client. Most frameworks do this automatically (Next.js, Remix, SvelteKit with the effector integration); custom setups should mirror the server and client paths explicitly.

## A mental model

The mental model that serves you best is this.

Think of an SID as a compile-time address.

Think of a store as a mailbox at that address.

Think of each scope as a different office building with its own copy of every mailbox.

A fork creates a new office. Serialize walks the current office and reads every mailbox's contents. Fork-with-values creates a new office and pre-fills every mailbox with the values you handed it.

Tentacles builds its mailboxes automatically, and the babel plugin ensures they all have addresses. You handle the offices (fork, serialize, fork-again) and the library handles the mailboxes.

## Summary

SIDs are effector's way of identifying stores across process boundaries.

Tentacles generates them with help from the babel plugin and a small probe call inside `createContract()` that detects the module's SID root.

Every store the library creates carries an SID prefixed with the contract's root, so serialization picks them up automatically.

`fork`, `serialize`, and `fork({ values })` handle scope creation and hydration.

`allSettled` makes `Model.create` in a scope awaitable, which is why the API returns a Promise in that case.

The result is SSR that works with minimal configuration. You set up the plugin once; the library does the rest.
