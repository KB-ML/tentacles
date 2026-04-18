# Contracts and runtime

If you have used Tentacles for more than five minutes, you have noticed that defining a model is a two-step act.

First you build a contract — a chain of method calls that ends in `.pk()`.

Then you pass that contract to `createModel({ contract })`, and only then does anything actually run.

The library could collapse those into one. Many libraries do. Tentacles does not, and the reasons matter for understanding the rest of the system.

This page is about the seam between declaration and runtime. Why it exists, what each side is responsible for, and what changes when you cross it.

## Two languages, one schema

A contract is written in a different language from a model, even though both are TypeScript.

The contract is a description of intent. It says "this model has a `title` field that holds a string, an `addPages` event that takes a number, and a primary key on `id`."

The contract does not have stores. It does not have events. It does not subscribe to anything, fire anything, or hold any state.

It is a graph of descriptors with phantom-key generics carrying the type information at compile time.

A model is the runtime realization of that intent.

When you call `createModel({ contract })`, the library reads each descriptor and builds the corresponding effector unit.

The `title` field becomes an entry in the model's `$dataMap`.

The `addPages` event becomes a model-level `createEvent`.

The primary key descriptor becomes a `PrimaryKeyResolver` configured to find `id` on incoming data.

Whole machinery wakes up, and from that point on you are in effector territory.

## Why keep them separate

Keeping these two languages separate is what lets the contract stay declarative and the model stay efficient.

The contract can be inspected, transformed, and combined without producing side effects.

You can write `pick(bookContract, ["title", "author"])` and get a new contract with just those fields, without the original ever having materialized a store.

You can write `partial(bookContract)` and get a contract whose stores are all optional, again without touching effector.

These transformations are pure functions on descriptors. They would be impossible if the contract were already alive.

The other side of the seam — the model — is where the cost lives.

Once you call `createModel`, you have committed to a particular runtime shape.

You cannot swap fields in or out. You cannot change the primary key. The model is fixed.

If you want a different shape, you build a different contract and create a different model.

This rigidity is intentional. It keeps the runtime small and predictable, and it lets the type system tell you what is and is not allowed at the call site.

## The fluent chain builder

The contract is built through a chain of method calls.

Each method adds one field and returns a new chain object whose type has been narrowed to know about that field.

By the end of the chain you have a type that knows every field's name and value type, and you have not lost any information along the way.

```ts
const bookContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .event("addPages", (e) => e<number>())
  .pk("id")
```

### Why a chain instead of an object literal

Why a chain? You could imagine an object-literal API instead:

```ts
const bookContract = createContract({
  fields: {
    id: store<number>(),
    title: store<string>(),
    addPages: event<number>(),
  },
  pk: "id",
})
```

Both shapes can express the same data.

The chain wins on three things.

### Type narrowing

The first is type narrowing.

Each call in a chain returns a new type that includes the previous fields.

After `.store("id", ...)` the chain knows about `id`.

After `.store("title", ...)` it knows about both `id` and `title`.

By the time you call `.pk("id")`, the type system knows the full shape and can verify that `"id"` is a valid PK target.

The object-literal version cannot easily do this. You would need an enormous conditional type to thread the field information through, and the error messages would be opaque.

### Fluent extensibility

The second is fluent extensibility.

A chain method like `.store("id", (s) => s<number>())` accepts a builder function.

That builder receives a `StoreTypedImpl` you can configure further: `s<number>().default(0).unique().index()`.

The configuration is itself a chain, and the field's compile-time type carries the configuration along.

With an object-literal API you would have to express that same configuration as nested options, which gets noisy fast.

### Method-hiding

The third is method-hiding.

Once you have called `.pk()`, the chain does not let you call `.store()` again — the builder methods are removed from the type.

This is achieved with conditional intersection types in the chain's type definitions.

The result is that you cannot accidentally build a contract that is half-finalized; the type system will not let you.

## Phantom-key generics

The chain builder accumulates type information through phantom-key generics.

A phantom key is a property in a generic type that carries information at compile time but has no runtime presence.

Tentacles uses several: `_bcStores`, `_bcEvents`, `_bcDerived`, `_ccRefs`, `_pcProps`, `_built`, `_pkFields`.

Each is keyed by a unique symbol, so users cannot accidentally collide with them.

### How they accumulate

When you call `.store("title", (s) => s<string>())`, the chain's type adds `title: string` to `_bcStores`.

When you call `.event("addPages", (e) => e<number>())`, it adds `addPages: number` to `_bcEvents`.

By the time you finalize, the chain knows the complete shape.

Then, when you call `createModel({ contract })`, the model's type extracts the shapes from these phantom keys and uses them to give you typed `$store` accessors and event signatures on the resulting model.

### Compile-time only

The phantom keys exist only at compile time.

At runtime, the chain object has a plain `fields` array — the descriptors.

The phantom keys are how we communicate "here is what the runtime will look like" to the type system without having to build a parallel runtime data structure.

They are zero-cost in the sense that they emit nothing at runtime.

### Prefixing

Phantom keys are also what makes prefixing work.

On instances, store fields and computed fields appear with a `$` prefix: `instance.$title`, not `instance.title`.

The contract type does not have `$` prefixes; the prefix is applied in the type that maps a contract to an instance.

The `PrefixedKey<K, Entity>` helper does this. It walks the entity kind (store, event, derived, ref) and decides whether to add the prefix based on the kind.

Stores and computed fields get prefixed because they evaluate to stores; events do not because they are callable functions on the instance.

## Finalization and the new class

When you call `.pk(...)`, the contract is finalized.

What "finalized" means in practice is that you get back a different class — `FinalizedContractImpl` instead of `ModelContractChain`.

This is unusual.

You might expect the same chain object to be returned with a narrower type, or a flag to be set indicating that finalization happened.

Both would be cheaper to implement.

We do neither.

### Why a new class

The reason for the class change is that finalization is more than a state flag.

It changes what the contract is for.

Before `.pk()`, the contract is a builder — you can add more fields, and the type system encourages you to.

After `.pk()`, the contract is an artifact — a finished schema you pass to `createModel`.

The two roles are different enough that giving them different classes makes the boundary visible in the type system.

You cannot accidentally treat a builder as a finished contract because the methods do not line up.

### Validation at finalization

The class change also lets us run validation at finalization time.

When you call `.pk("id")`, the library checks that `id` is a real field on the contract and throws a `TentaclesError` if it is not.

Compound primary keys (`.pk("orgId", "userId")`) are validated the same way.

This is the only place where contract-level errors are surfaced eagerly.

Everywhere else, errors wait until you actually try to use the schema.

We make an exception for `.pk()` because PK errors are common and obvious enough to deserve early feedback.

### What `FinalizedContractImpl` carries

`FinalizedContractImpl` carries everything needed to instantiate a model.

The field descriptors.

The factory defaults.

The SID root.

The PK signature.

The strategy implementation.

A small handful of helpers.

It does not carry any effector units; those still belong to the runtime.

Two `createModel` calls on the same finalized contract produce two independent models, each with its own `$dataMap`, its own registry, its own event system.

That isolation is intentional. It lets you stand up multiple parallel models from one schema (test fixtures, multi-tenant scenarios) without worrying about cross-contamination.

## The handoff

The most important moment in the contract-to-runtime pipeline is the call to `createModel({ contract })`.

This is when the descriptors become live units.

It is also when the type system collapses. Up to that point, the chain has been carrying a rich phantom-key structure; from this point on, it is the model's type that matters, and the contract's type fades into the background.

### Why a config object

The handoff has a particular shape worth noting.

`createModel` takes a config object — `{ contract, fn?, name?, strategies? }` — not just the contract.

We could have made it a method on the contract itself: `bookContract.createModel(opts)`.

We considered that.

The reason we did not is that the config object lets us add new options to `createModel` without widening the chain class's API.

If `createModel` ever grows a new option (it has, several times), we update the function signature.

We do not have to add a new method to every chain class that supports it.

The chain class stays narrow, and the runtime side stays composable.

### The same applies to view models

The same reasoning applies to `createViewModel({ contract, props?, fn? })`.

View models also take a config object, and the contract is just one field in it.

The config-object pattern is consistent across the library because it scales better than method chaining for orthogonal options.

### Pre-built contracts only

One subtle consequence of the handoff: `createViewModel` requires a pre-built contract.

If you pass a chain that has not been finalized appropriately, the library throws a `TentaclesError`.

This is enforced because partial contracts can lose information silently — the type system might happily accept a chain that is missing fields the runtime needs.

By throwing early, we make the omission obvious.

## Why you cannot just `createModel(chain)`

A reasonable question: why does the contract need to be passed inside an object?

Why not `createModel(bookContract)`?

The answer is twofold.

### Vocabulary

First, the config object enforces a vocabulary.

When you read `createModel({ contract: bookContract, fn: builder })`, the names `contract` and `fn` tell you what each argument is for.

With positional arguments, you would have to remember the order, and the order would have to be stable across versions.

The config object is more verbose but more readable, and adding a new optional argument does not break existing code.

### Extension points

Second, the config object is where extension points live.

`strategies` is one.

`name` is another (used for debugging output and SID generation).

A future option might be `eager` or `cleanup` or `serializer`.

Each one fits naturally into the config object without requiring a new function signature.

### Spreading configs

A small convenience this gives you: if you ever want to share a config across models (test setup, for instance), you can build a base config object and spread it into each `createModel` call.

With positional arguments that would not work cleanly.

## What contracts cannot do

Contracts are descriptive, not prescriptive about runtime behavior.

A contract cannot define a side effect.

It cannot wire up event handlers.

It cannot create derived stores that reference other models.

It cannot fire effects on `created`.

All of that lives in `fn`, the runtime builder you pass to `createModel`.

### What `fn` is for

`fn` runs once per model, at model creation time.

It receives the model's units — events, stores, refs — and can wire them together using effector primitives.

It can call `.on()` on stores to register event handlers (which the library routes through the shared on-registry).

It can `sample` between events.

It can declare extra units that should appear on every instance (returned from `fn` as an object).

### Why split contract from `fn`

The split between contract and `fn` is the same split as between declaration and runtime, repeated one level deeper.

The contract says what a field is; `fn` says what happens when you fire its events.

Keeping them separate means the contract stays portable — you can pass it to `pick`, to `partial`, to `merge`, without losing meaning — while the runtime stays expressive.

The trade-off is that a contract by itself does not tell you everything about how a model behaves.

You have to also read the `fn`.

For most fields this is fine; for behavior-heavy models, you end up reading two pieces.

### Why we did not fuse them

A library that fused the two would let you read one.

The reason we did not is that we wanted contracts to be cheap to define, and `fn` would have made them expensive — every contract would carry a closure even if you never instantiated it.

The cost would be hidden but real. A library full of unused contracts (a common pattern in test code, for instance, or in shared schema modules) would carry the closures of every contract it imported, even ones that were never used.

By splitting `fn` into the runtime side, we keep contracts truly cheap.

## Why the seam matters

The seam between declaration and runtime is where the most important guarantees of the library live.

Declaration is cheap. You can build, transform, and combine contracts without paying for runtime nodes.

Runtime is expensive but isolated. Each model has its own units, its own state, its own teardown, and you only pay when you actually instantiate.

The pipeline lets you reason about cost by where you are. Above the seam, you are negotiating shape; below it, you are running effector.

## What changes for the user

Most users do not have to think about the seam consciously.

They write a contract, they call `createModel`, they use the model.

The seam shows up when you start doing things like deriving a partial contract for a form, or sharing a contract across two parallel models, or generating a contract from external metadata.

In all of those cases, the rule is the same: keep declaration on one side of the seam, keep runtime on the other, and use the explicit handoff (`createModel`, `createViewModel`) to cross it deliberately.

## Why the chain and the artifact are different types

The library could have used the same class for both the chain and the artifact, with a `finalized: boolean` flag.

The state would carry through, the methods would behave differently based on the flag, and the call sites would look the same.

We chose against this for a reason that is partly aesthetic and partly practical.

### The aesthetic argument

Aesthetically, a class that has two modes is harder to reason about than two classes with one mode each.

When you read code that operates on a `ModelContractChain`, you know it is a builder — there are methods to add fields, methods to inspect the partial state, methods to finalize.

When you read code that operates on a `FinalizedContractImpl`, you know it is an artifact — there are methods to extract descriptors, methods to construct strategies, methods to provide to `createModel`.

The two roles are different enough that giving them separate types is honest.

### The practical argument

Practically, the type system can enforce more invariants when the two are different types.

A function that takes `FinalizedContractImpl` does not have to handle the case where the contract has not been finalized.

A function that takes `ModelContractChain` does not have to handle the case where someone has called `.pk()` already.

Both cases are eliminated at compile time, not at runtime.

This is a small win on each individual function, but it adds up. The library's internal code is simpler because the types do more work.

## Multiple models from one contract

A finalized contract can be reused.

You can call `createModel({ contract })` twice on the same contract and get two independent models.

Their `$dataMap` stores are separate. Their registries are separate. Their effects are separate.

This is the kind of thing that matters for testing — you can build one contract for a `userModel` model and use it to construct fresh models in each test fixture.

It also matters for multi-tenant code, where you might want one model per tenant and a single contract describing them all.

### Cost considerations

Reusing a contract does not save runtime cost. Each model still creates its own machinery.

What you save is the cost of declaring the contract twice, and the risk of the two declarations drifting apart.

A single contract is the source of truth; each model is a runtime instance of it.

## What the seam buys you in tooling

The seam between declaration and runtime is also a useful place for tooling.

A linter can analyze contracts statically without running them.

A schema generator can read the descriptors and produce documentation, OpenAPI specs, GraphQL types, or whatever target you want.

A migration tool can compare two contracts and produce a diff.

None of these tools need to instantiate a model. They operate on the contract's pure structure.

That separation makes them composable. You can build new tooling on top of contracts without coupling it to the runtime.

## Summary

The contract-runtime split is the library's most important architectural choice.

Contracts are declarative descriptors with type information carried in phantom keys.

Models are runtime instances that own real effector state.

The handoff is explicit, through `createModel({ contract })`, and the new artifact (`FinalizedContractImpl`) makes the boundary visible in the type system.

The split lets contracts be cheap, transformable, and portable. It lets models be efficient, isolated, and well-typed.

It is the seam that the rest of the library is built around.
