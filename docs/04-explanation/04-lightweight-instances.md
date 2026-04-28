---
description: "Lightweight instances: Not every model instance needs the same infrastructure."
---

# Lightweight instances

Not every model instance needs the same infrastructure.

A `tagModel` with a name and a color is not structurally the same as a `Cart` that aggregates line items with computed totals and a cascade delete.

Tentacles tries to recognize this at model creation time and gives the simpler models a simpler runtime — no effector region, no per-instance node, a proxy wrapper and an entry in `$dataMap` and nothing else.

We call this the lightweight path.

This page is about when that path kicks in, what it saves, and when you might want to step out of it on purpose.

## The detection

When you call `createModel({ contract, fn, ... })`, the library inspects the arguments and decides whether the resulting instances can be lightweight.

The decision is a conjunction: all of the following have to be true.

### The five conditions

First, `fn` is absent, or it returns `{}` and does not call `.on()` on anything.

Second, the contract has no ref fields — no `ref("author", Author)` and no `ref("posts", postModel, { many: true })`.

Third, the contract has no derived fields.

Fourth, there are no `resetOn` clauses.

Fifth, there are no indexes, unique constraints, or inverse relationships.

### What happens on the lightweight path

If all five hold, the model enters the lightweight path.

Every instance created from it skips the effector region machinery.

The cache entry's `region` field is `null`, meaning no `withRegion` call happened, meaning no teardown plumbing was set up, meaning the instance is essentially a JavaScript object referencing a row in `$dataMap`.

### What happens on the standard path

If any of the five fails, the model enters the standard path.

Each instance gets its own region, and the region owns whatever nodes the `fn`, refs, or computed fields introduced.

When the instance is destroyed, tearing down the region tears down the nodes along with it.

### Model-level decision

The detection is a pure property of the model, not of the individual instance.

A model either takes the lightweight path for all its instances, or for none of them.

We discussed a per-instance decision — lightweight on creation, upgrade if the user later calls `.on` — but the upgrade path would be complicated enough that we decided against it.

Models are not usually shaped with such a split personality, and when they are, the user is better served by explicitly splitting them into two contracts.

## What you save

The savings are straightforward.

A lightweight instance does not call `withRegion`, which is one of the more expensive effector primitives.

`withRegion` creates a node in the graph to track teardown, registers a disposer, and maintains a parent-child relationship with the enclosing region if there is one.

Skipping it avoids the allocation of the region node, the disposer function, and the bookkeeping they imply.

### The memory numbers

The estimate we quote in the architecture notes is that a lightweight instance is about 0.1KB per instance, dominated by the proxy object and the entry in `$dataMap`.

A standard instance with a region is about 12KB, dominated by the region's overhead, the disposer, and the auxiliary effector nodes the region provides.

The difference is large because region creation involves several allocations, not because the region itself is wasteful — it is simply a lot of machinery for a thing that does not need machinery.

### At scale

At scale, the difference becomes the difference between a browser tab staying responsive and a browser tab stuttering on load.

Ten thousand lightweight instances cost about 1MB above the data itself.

Ten thousand standard instances cost about 120MB on top of the data.

That is not a boundary you cross without noticing.

### Creation time

The savings in creation time are similar.

Creating a region involves calling `withRegion`, which sets up several effector internals.

Skipping it cuts the creation cost by roughly an order of magnitude.

For bulk inserts — loading a thousand records at once — the lightweight path turns a multi-second freeze into a sub-100-millisecond batch.

## The spectrum

There is not one optimization here; there is a spectrum.

### At the cheapest end

At the cheapest end, you have a model with no `fn` and no refs and no computed fields.

Every instance is lightweight.

Zero effector nodes per instance.

This is the case for pure-data models — a lookup table of tags, a cache of API responses, a list of audit log entries.

The model is mostly a typed, queryable container around `$dataMap`.

### `.on()`-only `fn`

A little further along, you have a model with an `fn` that uses only `.on()`.

The `.on` calls register into `SharedOnRegistry` at model level; no per-instance nodes are created.

If that is all `fn` does, the model is still close to lightweight, but because we need to track that `fn` ran, we still set up a region for the instance.

The region is mostly empty.

The cost per instance is the region's overhead (about 12KB), even though nothing inside it is pulling weight.

### Why we keep the region

We debated whether to keep the region in this case.

You could argue it is vestigial — the shared registry does not need a per-instance region to exist, and the `fn` itself only ran once.

The reason we keep the region is consistency.

If the user later calls `combine(book.$title, ...)` or accesses `book.$title.updates` or does any of the other things that trigger materialization, the new store needs a region to live in.

We allocate the region up front so that materialization later does not have to grow the instance's shape after the fact.

### Explicit `createStore` in `fn`

Further along still, you have models with `fn` that explicitly creates stores or wires `combine`.

Now per-instance nodes appear, in numbers the user chose.

If the user created five stores in `fn`, there are five per-instance stores.

The region holds them.

The library is honest about this: if you ask for per-instance reactivity, you pay for per-instance reactivity.

### The far end

At the far end, you have models with refs, inverses, computed fields, and indexes.

Each of those adds its own infrastructure.

Refs need `RefManyApi` or `RefOneApi` objects, which themselves create or reuse stores.

Inverses need the inverse index to be consulted.

Computed fields need to materialize.

Indexes need the `ModelIndexes` bookkeeping, and the `$version` store bumps.

These are the models that benefit from the standard path, because they have real work for the region to do.

## The checklist, in practice

The five conditions for lightweight eligibility are not arbitrary.

Each one marks a kind of runtime work that needs a region to live in.

### `fn`

`fn` is the most common gate.

If `fn` is absent, there is no user-supplied wiring to tear down, so there is nothing the region needs to protect.

If `fn` returns `{}` and does not call `.on`, the wiring is trivial and the shared-on-registry handles it.

Anything else is on-region.

### Refs

Refs require a region because they create per-instance API objects that hold references to other models.

Tearing down an instance needs to clean up those objects and any incremental inverse updates that depend on them.

The region is how we track that cleanup.

### Derived fields

Derived fields materialize computed stores per instance.

The stores need a region to teardown into.

### `resetOn`

`resetOn` declarations say "when this event fires, reset the instance's stores to their defaults."

The wiring for that reset lives in the region. Without a region, there is nowhere to put the `sample` that listens for the reset event.

### Indexes

Indexes need per-instance bookkeeping.

When an instance changes a field that is indexed, the index's state has to be updated.

When an instance is deleted, the index has to drop it.

The library could do this without regions, but the code is cleaner if the index's teardown hooks into the same region as everything else.

## When to leave the lightweight path on purpose

Most of the time, lightweight instances are pure win.

Every once in a while, you have a use case that wants region-backed behavior even though it would otherwise qualify for the lightweight path.

Two examples.

### Introducing `.on` from outside

The first is when you want to introduce `.on` from outside the model.

If you write `fn: ({ $count, increment }) => { $count.on(increment, n => n + 1); return {} }`, the library uses the shared-on-registry and can still lightweight.

If you write `bookModel.create({ id: 1 }).$count.on(increment, n => n + 1)` after the fact, you are trying to wire per-instance-after-creation, and the proxy will materialize a store to handle it.

That store needs a region.

We usually recommend moving the wiring into `fn` if you can; putting it outside tends to mean you also create garbage that the library cannot clean up for you.

### Per-instance destruction side effects

The second is when you want per-instance destruction to have side effects — say, log a message when an instance is disposed, or clean up a DOM node.

The region is the natural place to hook disposers, and the lightweight path does not give you one.

If you need that behavior, add an `fn` that returns an object with the disposer wiring.

The model leaves the lightweight path and gains the region.

### Other cases

Beyond those two, we have not found a reason to opt out of the lightweight path.

The savings are large and the behavior is indistinguishable from the region-backed path for everything that does not explicitly depend on a region.

## The detection's edge cases

The detection is conservative. It favors the standard path when it cannot prove eligibility.

The reason is simple. Dropping the region from an instance that needed it would cause memory leaks (the disposers would never fire) and logic bugs (the wiring would not tear down correctly).

Taking the region when the instance did not need it wastes 12KB per instance.

The asymmetric risk points at the conservative answer.

### Gotcha: extension options

If you pass a model-level option that could conceivably introduce wiring — a future `strategies` slot, for example — the library errs toward the standard path.

Rather than trying to prove that `strategies` did not create anything, it assumes they might have.

### Gotcha: post-creation monkey-patching

If you extend the model by subclassing or by monkey-patching methods post-creation, the library has no way to redetect eligibility.

Once the model is constructed, the path is fixed.

This is one reason the library does not encourage subclassing models; the abstraction wants to know everything at construction time.

### Gotcha: dynamic `fn`

`fn` itself is a closure the library runs once.

If your `fn` has dynamic behavior — for example, it conditionally adds `.on` calls based on some environment flag — the library cannot statically tell whether the `fn` will introduce wiring.

It assumes worst-case and uses the standard path.

In practice, most `fn` closures are static; they always do the same thing.

## Why the lightweight path is not the default thought model

You might ask why we do not document the lightweight path as the default way to think about instances.

If it is so cheap, should it not be the mental model the user starts with?

### The user-facing shape is uniform

The answer is that the lightweight path is an optimization, not an architecture.

The user-facing shape of an instance is identical whether it took the lightweight path or the standard one.

`book.$title.getState()` works the same way.

`book.addPages(50)` works the same way.

Queries work the same way.

SSR serialization works the same way.

The lightweight path is an implementation detail that the user does not need to know about to use the library correctly.

### What users do need to know

What the user does need to know, if they are writing performance-sensitive code, is that the library has a lightweight path and that simple models benefit from it.

The cost estimates in the architecture notes are how the documentation tries to make this visible without overwhelming the mental model of a new user.

### The lightweight path is a cost, not a feature

The other reason it is not the default framing: the lightweight path is not a feature, it is a cost.

The feature is the uniform instance shape — the fact that every instance looks the same to the user regardless of how it was constructed.

The lightweight path is what makes the feature affordable at scale.

Describing the path as the primary mental model would shift attention from "instances look uniform" to "here are the internal branches," and the user would spend cognitive effort on something that does not affect how they write code.

## Trade-offs

The lightweight path adds internal complexity in exchange for better scale.

The detection logic, the conditional region creation, the shared on-registry, and the proxy design that makes all of this possible add up to a non-trivial chunk of the model layer.

Maintaining it means any new feature has to consider whether it participates in the standard path or stays compatible with the lightweight path.

Some features do not; they are standard-path-only, and using them moves the model off the lightweight path.

### The payoff

The payoff is a library that does not apologize for scale.

Models with ten thousand instances are not a special case; they are the same model you would write for ten.

The cost grows with the work the user explicitly asks for, not with the shape the library imposes.

That is the property we were after, and the lightweight path is how we kept it.

## The path in practice

Most users will never notice the lightweight path.

They declare a contract, create a model, use the model. The library chooses the path based on the contract's shape and the user's `fn`. The instances behave the same way regardless.

The path becomes relevant in two situations.

### Performance work

The first is when you are doing performance work on your application and want to understand where memory goes.

If you inspect a running process with a heap profiler, a lightweight model's instances are tiny (you see the proxy and the entry in `$dataMap`, not much else).

A standard model's instances are bigger because of the regions.

Knowing which models take which path helps you interpret the profile.

### Feature decisions

The second is when you are deciding whether to add a feature to a model that would push it off the lightweight path.

A model that currently has no refs and no `fn` is as cheap as it gets.

Adding a `.on` wiring to `fn` keeps it lightweight.

Adding a ref does not.

If you have a million-instance model, this is worth thinking about.

If you have a thousand-instance model, the difference is negligible.

## A mental model

The mental model that serves you best is this.

Think of each instance as a row in a database table.

A lightweight instance is just the row — no triggers, no indexes, no computed columns, no cascading deletes.

A standard instance is the row plus whatever triggers, indexes, and computed columns the contract declared.

Both are rows. Both behave the same way when you read or write them.

The difference is in the machinery behind the scenes.

## The relationship to `$instanceSlice`

The lightweight path interacts with the `$instanceSlice` materialization described in the field proxies essay.

If a model is lightweight and the user then materializes a field on an instance (by calling `combine(instance.$title, otherStore)`, for example), the proxy materializes an `$instanceSlice` store.

That store needs a region. A lightweight instance does not have one.

The library handles this by lazily creating a region for the instance at materialization time, not at construction time.

The lazy region creation moves the instance off the pure lightweight path into a hybrid state: the instance was lightweight at creation, but once you materialized a field, it gained a region and the per-field `.map` store.

This hybrid state is rare in practice. Most users never trigger materialization, because the framework bindings and bulk access patterns go through the proxy's fast paths.

When it does happen, the cost is bounded: a region plus one `.map` per materialized field per instance. The lightweight path was not wasted; it just meant you did not pay the region cost until you needed it.

## Summary

The lightweight path is the library's way of saying "if the model does not need the expensive machinery, do not allocate it."

The detection is at model creation time, based on the contract and the `fn` the user provided.

If the model is eligible, instances skip the effector region and save about 12KB apiece.

If the model is not eligible, instances get the region and everything it costs.

The cost is a little internal complexity in exchange for scale that the standard path could not deliver.

The feature is the same uniform instance shape the user sees in both cases.

Most users never need to think about this.

The ones who do are glad it is there.
