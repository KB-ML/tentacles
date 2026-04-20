# Design decisions

Every library is a collection of choices.

Some of the choices are obvious in retrospect and some are only obvious once you have seen the alternative.

This page is a curated list of the ones that most shape how Tentacles feels to use.

For each, I want to give you three things: what the choice is, what we considered instead, and what the residual cost looks like.

Good libraries keep their trade-offs visible, because the trade-offs are what you inherit when you build on top of them.

## No `getState` or `watch` in library code

The library never calls `getState` or `watch` on its own stores outside of a handful of explicitly-tested edge cases.

This is a rule we enforce in code review, not a convention we hope people follow.

### Why the rule exists

The reason is straightforward.

`getState` reads from the default scope regardless of which scope the caller is in.

If the library used `getState` to read a store inside a reactive computation, scoped behavior would break — the library would always see the global scope, and forked scopes would not affect the computation.

`watch` has a related problem: the subscription is on the store itself, not the scope-specific projection, so it fires for all scopes instead of just the current one.

Both patterns violate scope isolation quietly.

### The alternatives we considered

The alternatives we considered were `scope.getState(store)` (which requires threading the scope through every call site, making the library's internals verbose) and relying on `useUnit` from the framework bindings (which is fine at the rendering layer but not at the data layer, where there is no component to attach to).

Neither worked for the kind of pure reactive wiring the library does internally.

### What we settled on

The rule we settled on is that library code uses `combine`, `sample`, `.map`, and other effector primitives to express reactive relationships.

Those primitives are scope-aware out of the box.

When you `combine` two stores and `.map` them into a third, the derivation is automatically per-scope.

No explicit threading of the scope is needed.

### The residual cost

The residual cost is that some computations are more awkward to express.

If the library wants to check "did this ID change" it has to do it through `sample` instead of `watch`, which is more ceremony for simple cases.

We accept the ceremony because it is the price of scope isolation being correct-by-default.

## Lazy effector units — user pays only for what they observe

The library does not create effector units that nothing subscribes to.

Lazy stores, lazy materialization, lazy region creation — wherever the library can defer creating a node until a consumer actually wants one, it does.

### The simpler alternative

The alternative is to eagerly create every unit during model construction.

That is the simpler implementation; you avoid conditional logic and the state machines that track "has this thing been asked for yet."

It is also dramatically more expensive at scale.

A model with a hundred fields would eagerly create a hundred stores per instance.

Multiply by ten thousand instances, and you have a million unnecessary nodes.

### The middle ground we considered

We considered a middle ground: eagerly create the per-model singletons (`$count`, `$ids`, `$idSet`) but lazy-create the per-instance stores.

That is close to what the library actually does.

The full lazy path extends further: we also lazy-create the `$instanceSlice` that would back per-instance materialization, and we lazy-create the region only when a model's shape requires it.

### The residual cost

The residual cost of lazy creation is complexity.

The code has conditional branches for "has X been created yet?", cache-invalidation-like logic for "if Y is created, make sure Z is wired up first," and subtle ordering dependencies between lazy creations.

We test those paths carefully, but the complexity is real.

It is also bounded — the lazy logic is localized to the layer that owns the resource — so it does not spread.

### The payoff

The payoff is that cost grows only with observation.

A model with a thousand instances and five fields costs roughly the same as one with a thousand instances and fifty fields, because only the observed fields materialize.

A user who never calls `combine` pays no materialization cost at all.

That is a valuable property for a library meant to scale.

## Shared `$dataMap` vs per-instance data stores

The single-store architecture is the library's defining structural decision.

All instances of a model share one `$dataMap` store.

Every read and every write routes through it.

Per-instance field accessors are proxy objects, not stores.

### The natural alternative

The alternative is per-instance stores: each instance has its own `$title`, its own `$pages`, its own everything.

That is the natural object-oriented shape, and it is what the library's predecessors did.

The problem was scale. Each store is an effector graph node; ten thousand instances with five fields each is fifty thousand nodes, and the graph starts to strain.

### Why we rejected the hybrid

We considered a hybrid — per-instance stores by default, shared `$dataMap` for users who opt in.

The hybrid did not pan out because it split the library's mental model in two.

Users who read the documentation for one path would be confused by the other.

We picked one path and committed.

### The residual cost

The residual cost is the proxy abstraction, which leaks in a few ways.

It does not pass `instanceof Store`.

Its `.getState()` does not honor the calling scope without the framework bindings.

Materialization is lazy and can happen at surprising moments.

The [field proxies](/explanation/field-proxies) page catalogs these.

For most users the abstraction is invisible; for advanced users it requires some care.

### The payoff

The payoff is the scale properties we quoted earlier.

Loading ten thousand instances costs about as much as loading ten, from the library's side.

Serializing a scope with ten thousand records serializes one store, not ten thousand.

Every layer above the model layer (queries, framework bindings) builds on the shared store and benefits from it.

## Phantom-key generics vs full runtime metadata in types

Tentacles's type inference is done with phantom keys — unique-symbol-keyed properties on generic types that carry information at compile time but have no runtime presence.

The alternative would be to expose the full contract metadata as runtime types, with real objects carrying type information that the user can inspect.

### What we would gain from runtime metadata

We considered full runtime metadata.

It would have made some advanced patterns easier — runtime reflection over a contract, dynamic contract construction, declarative serialization schemes.

It would also have doubled the library's runtime footprint, because every descriptor would be twice: once for the type system, once for runtime inspection.

### The phantom-key approach

The phantom-key approach keeps runtime state minimal.

Descriptors exist at runtime but are not structured for inspection — they are flat arrays of typed objects, designed for the model layer to consume, not for user-land reflection.

The type system knows about every field and its shape, but that knowledge is purely compile-time.

### The residual cost

The residual cost is that runtime introspection is harder.

If you want to iterate over a contract's fields at runtime, you can, but you have to know about the internal descriptor format.

The library does not expose a public "walk this contract" API, though it may in the future.

For now, the common cases (inferring prop types, generating forms from contracts) are handled through the type system and do not need runtime introspection.

### The payoff

The payoff is a library whose runtime is measured in kilobytes, not megabytes.

Phantom keys have zero cost at runtime.

The cost is entirely on the TypeScript compiler's side, which is a place where sophistication is cheaper than in the browser.

## `createModel({ contract })` config object vs `contract.createModel()` chain

Models are created with a config object: `createModel({ contract, fn, name, strategies })`.

The alternative is a method on the contract: `bookContract.createModel({ fn, name, strategies })`.

Both work.

### The advantage of the config object

The config-object form has one advantage and one disadvantage.

The advantage is that the contract chain's API stays narrow.

Every option that could be passed to `createModel` would otherwise have to be threaded through the chain class's method signature.

If we add a new option, we extend the function; we do not have to extend the chain class, which would complicate its conditional intersection types.

### The disadvantage

The disadvantage is that the call is slightly wordier.

You write `createModel({ contract: bookContract, fn: ... })` instead of `bookContract.createModel({ fn: ... })`.

The difference is a few characters and a named argument.

### Why we picked it

We picked the config-object form because the library treats `createModel` as a gate between two worlds: the declaration world (the contract) and the runtime world (the model).

Method-chaining would blur that boundary.

Keeping `createModel` as a standalone function makes the gate visible.

### The residual cost

The residual cost is the wordiness.

In practice, most users do not notice it, because they call `createModel` once per model and import the model from wherever they declared it.

The verbosity is in the declaration, not in the consumption.

## Pre-built contracts required for `createViewModel` (throws TentaclesError)

`createViewModel({ contract, props, fn })` expects `contract` to be a finalized view contract.

If you pass an unfinalized chain, the library throws a `TentaclesError`.

This is unusual — view contracts do not have a `.pk()` method (they do not have primary keys), so there is no obvious call that finalizes them.

### How finalization works for view contracts

The rule is that you pass the view contract chain directly, and the library treats it as finalized at the moment of `createViewModel`.

### The problem and the fix

The problem is that a chain passed to `createViewModel` might be missing fields the runtime needs.

Type-wise, we cannot always catch this.

Runtime-wise, the library checks that the chain has the shape it expects and throws if not.

### Why we did not make it silent

We considered making the check silent — log a warning, fall back to defaults, let the view model run in a degraded state.

That would mask bugs.

A missing field in a view contract is almost always a mistake, and silently degrading would turn it into a subtle bug downstream.

Throwing early is better.

### The residual cost

The residual cost is that users who pass incomplete chains see an error at `createViewModel` time rather than at first use.

The error message names the missing field, which is usually enough to fix the issue.

The ergonomic cost is low; the safety benefit is high.

## Strategy pattern vs instanceof — why `Symbol.for` for cross-module compatibility

Contract utilities (`pick`, `omit`, `partial`, `required`, `merge`) dispatch through a strategy object keyed by `Symbol.for("tentacles:contractChainStrategy")`.

The alternative is `instanceof` checks against the concrete chain classes.

### The two reasons instanceof fails

The `instanceof` approach fails for two reasons.

First, it does not work across package boundaries: `FormContractChainImpl` (from `@kbml-tentacles/forms`) would not be recognized by core's utilities, so users would need form-specific versions of every utility.

Second, it does not work when the core package is loaded twice (which happens when dependencies introduce duplication), because the two copies have two `ModelContractChain` classes with distinct identities.

### Why `Symbol.for` is the key

`Symbol.for` solves both.

The symbol is globally registered, so both copies of core call `Symbol.for` with the same key and get the same symbol.

Any chain that exposes a strategy under the symbol is recognized, regardless of which copy of core it came from or which downstream package authored the chain type.

### See the dedicated page

The [strategy pattern](/explanation/strategy-pattern) page has the full story.

Here I want to flag the residual cost.

### The residual cost

The strategy interface (seven methods: `entityNames`, `createEmpty`, `copyEntities`, `copyAll`, `applyPartial`, `applyRequired`, `validateRefs`) is fixed.

Adding a new utility that needs a new operation means extending the interface, and every chain type has to implement the new method.

So far the seven methods have been enough; we will extend them carefully if we need to.

## Peer dep on effector ^23.0.0 — alignment with scope isolation API

Tentacles declares `effector` as a peer dependency and targets version 23 and up.

Earlier versions of effector had scope isolation but with a different API (`fork(domain)` took a domain argument, for example).

We did not want to support the old API.

### The broad-range alternative

The alternative was to target the broadest version range we could, with conditional code paths for each major version.

That is plausible for small libraries with narrow dependencies on effector.

Tentacles uses effector heavily and depends on the scope isolation model working exactly as it does in v23.

Supporting the older API would have meant a significant branch in our code base.

### The multi-variant alternative

We considered shipping two variants of the library, one per effector major version.

The maintenance cost of two parallel implementations was too high for the user-base we serve.

### The residual cost

The residual cost is that users on older effector versions cannot use Tentacles without upgrading.

For most users this is not a real cost; effector releases are not disruptive, and v23 has been stable for a long time.

For users with older codebases, the upgrade path is straightforward (effector's migration guide is short), and they pick up other improvements along the way.

## Zero boilerplate — the shape of a contract is enough to generate `$ids`, `$count`, `instances()`, `createFx`

When you declare a contract and call `createModel({ contract })`, you immediately have `bookModel.$ids`, `bookModel.$count`, `bookModel.instances()`, `bookModel.createFx`, `bookModel.created`, and a dozen other units.

You did not ask for them. They are generated from the contract's shape.

### The alternative: declare everything

The alternative is to ask the user to declare them.

That is the shape of most low-level libraries: you create a store for your IDs, an event for creation, an effect for your backend sync.

Each call is a line of code.

A model with five stores and three events ends up being a few dozen lines of boilerplate.

### Why we generate

Tentacles generates them because we wanted the model to be a first-class abstraction, not a pattern the user assembles from primitives.

The contract is the minimum the user has to declare (field names, value types, relationships); everything else is derived.

### The residual cost

The residual cost is that the library's API surface is large.

There are many units on each model, and users have to learn what they all are.

The reference documentation is correspondingly larger.

We try to keep the learning curve gentle by grouping the units into obvious categories (state, events, effects, lifecycle) and by using consistent naming.

### The payoff

The payoff is that a model can be declared in a dozen lines and used in dozens more.

The ratio of declaration to use is low, which is what you want in a library meant for application-scale data.

## React `<View>` uses `lifecycle.unmount()`, not `.destroy()` — StrictMode safety

The React bindings tear down a view model instance by calling `lifecycle.unmount()`, which fires the `unmounted` lifecycle event but does not dispose the underlying region.

The Vue and Solid bindings call `destroy()`, which tears down the region.

### The StrictMode problem

The reason is React Strict Mode.

In development, Strict Mode mounts components twice, unmounts them once, then mounts them again.

If the first unmount destroyed the region, the second mount would fail because the region would already be disposed.

The mismatch would produce errors in development that users would have to work around.

### Why idempotent destruction is hard

We considered making destruction idempotent — allow `destroy()` to be called multiple times, with the second call being a no-op.

That is hard to implement correctly for regions that have disposers with side effects.

The disposers may have already run and deallocated resources; a second teardown cannot meaningfully repeat them.

### Why detecting Strict Mode is hard

We considered using a different teardown mechanism in React — something that tears down on actual unmount but no-ops on Strict Mode's fake unmount.

Detecting Strict Mode reliably is hard; React does not expose whether a mount is double-mounted.

### What we settled on

The approach we settled on is to use lifecycle events for teardown signaling and leave region disposal for explicit cases (such as a framework that truly knows when a component unmounts).

Vue and Solid do not have Strict Mode, so they can destroy the region directly.

React relies on lifecycle events, which are replayable without issues.

### The residual cost

The residual cost is that React view model regions are not torn down on StrictMode unmount.

In theory, this means a Strict Mode double-mount keeps the first region alive briefly.

In practice, the lifecycle events trigger the cleanup that matters (subscription disposal, effect aborts), and the region itself is small.

When the component truly unmounts (Strict Mode concluded, or production build), the region is garbage-collected normally.

## Builder, factory, and adapter patterns for everything

The library leans heavily on OOP patterns.

`ModelContractChain` is a builder.

`createModel` is a factory.

`RefApiFactory` is... a factory.

`PrimaryKeyResolver` is an adapter between raw data and PK-aware operations.

The patterns are not decorations; they are the library's internal structure.

### The functional alternative

We considered a more functional layout — pure functions over descriptors, with behavior inlined into the functions that use it.

That is cleaner for small libraries; for a library with as many cross-cutting concerns as Tentacles, it produces files full of repeated logic.

The patterns let us name a concept once and use it in many places.

### The residual cost

The residual cost is the indirection.

Reading the library's source means chasing through factories and adapters to find the actual work.

For a maintainer familiar with the patterns, this is cheap.

For a new reader, it takes some time.

### The payoff

The payoff is the ability to extend behavior cleanly.

The strategy pattern we discussed earlier is the prime example — the pattern lets us open for extension without modification.

Similar patterns elsewhere let us swap in different PK resolvers, different ref APIs, different effect handlers, without rewriting the surrounding code.

## Testing every feature in three modes

Each feature in the library has three tests: default, SSR, and memory-leaking.

The default test checks that the feature works in the global scope.

The SSR test forks a scope, runs the feature, serializes, forks again with values, and checks that the behavior matches.

The memory test runs the feature, destroys the instances, and checks that no references remain.

### The shallower alternative

The alternative is to test the default path deeply and trust that SSR and memory work because the underlying primitives are scope-aware and garbage-collectible.

That is the approach many libraries take, and it is sometimes right.

For Tentacles, the scope isolation and memory behavior are claims we make to users, and we test them explicitly.

### The residual cost

The residual cost is more tests.

Every feature grows the test matrix.

Writing the SSR and memory tests requires infrastructure that is more complex than typical unit tests — fork, serialize, and check state across scopes.

The memory tests require weak references and finalization registries, which are new enough APIs that they have quirks.

### The payoff

The payoff is confidence that the library's claims hold.

SSR bugs are insidious — they look like hydration mismatches, they are hard to reproduce, they leak user data.

Memory leaks are similar — they grow slowly and destabilize servers under load.

Testing for both rules out entire categories of failure before they reach users.

That confidence is worth the test burden.

## The shape of a contract chain

The chain builder returns a new chain object from each call.

We considered an alternative: a mutable chain that modifies itself in place and returns `this`.

### Why immutable chain

The immutable chain is more expensive at build time (a new object per call) but cheaper to reason about.

Users cannot accidentally share a chain and have its state diverge.

Typed chains that mutate themselves require conditional types that track mutation history, which gets ugly fast.

### The residual cost

The residual cost is allocation.

Each `.store(...)` call allocates a new chain.

The total cost is proportional to the number of chain steps, which is usually small (tens of calls per model at most).

### The payoff

The payoff is that every chain is a snapshot.

You can hand a partial chain to another function, add to it, and keep the original.

The type system tracks the snapshots cleanly because each snapshot has its own type.

## One contract, many model instances

A finalized contract can be used to construct many models.

Each `createModel({ contract })` call produces an independent model — its own `$dataMap`, its own registry, its own lifecycle.

### Why we allow this

The reason is practical. Test fixtures want fresh models on every test run without redeclaring the contract.

Multi-tenant codebases sometimes want one model per tenant with the same schema.

Complex applications sometimes want to version a model (say, a "draft" and "published" variant) while keeping the schema in one place.

### The residual cost

The residual cost is nothing in the common case.

Users who only call `createModel` once per contract do not notice.

The library is not special-casing the one-model case; it just happens to be cheap to allow multiple models.

### The payoff

The payoff is composability.

Contracts are reusable units; models are disposable instances of them.

Thinking about them separately makes testing easier and enables patterns the single-model case would not support.

## Sync `instances()` instead of a `Store<Instance[]>`

`Model.instances()` is a synchronous method, not a store.

Instance proxies are stable objects whose reactivity lives in per-field `$field` stores. Wrapping them in a `Store<Instance[]>` layered stores-of-stores without adding any signal we do not already get from `$ids` (membership) and the field stores themselves.

### The store-of-stores alternative

An earlier version of the API exposed `Model.$instances: Store<Instance[]>` and `Model.instance(id): Store<Instance | null>`.

Subscribing to them did not tell you anything `$ids` / `$idSet` + `get(id)` would not. It did, however, build a reactive node per subscribed id plus the list-store itself — cost with no payoff.

### Why sync wins

Most callers want one of two things:

- "Is this id in the collection?" — answered by `$idSet` (O(1) reactive membership)
- "Give me the Instance for this id right now" — answered by `get(id)` (synchronous)

For scoped reads the `getSync(id, scope)` / `getByKeySync(...parts, scope)` variants route through `scope.getState($dataMap)`. Inside `combine` / `sample` you already receive a scope-correct `$dataMap`, so `combine($ids, ...fields, (ids, ...) => ids.map(model.get))` is both cheap and correct.

## Summary

This page is a list of trade-offs, not a list of features.

Every choice has a cost.

The costs are manageable in the common case and visible in the uncommon one.

The benefits are the properties that make Tentacles worth using: scale, type safety, SSR safety, extension.

If you are designing a library that will face similar trade-offs, the patterns here may be useful. Not every choice we made is the right one for every library; some are specific to the scale and shape we were targeting.

But the discipline — think about the cost, consider alternatives, pick deliberately — transfers.
