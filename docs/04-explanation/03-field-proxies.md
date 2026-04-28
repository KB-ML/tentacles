---
description: "How instance field proxies work and when Tentacles materializes real Effector stores."
---

# Field proxies

When you write `instance.$title.getState()`, your intuition is probably that `$title` is an effector store and `.getState()` is the same call you would make on any other store.

The first half of that intuition is wrong, and the second half is right by accident.

`$title` is not a store. It is a Proxy object that pretends to be a store, well enough that almost no caller can tell the difference.

This page is about why we made that choice, what it costs, and where the abstraction starts to leak.

## The problem with per-instance stores

The straightforward way to give every instance its own fields is to give every instance its own stores.

Each `bookModel` has a `$title` store, a `$pages` store, a `$readingTime` store.

When the user calls `book.$title.getState()`, effector returns the value.

When the user wires `book.$title.on(setTitle, ...)`, effector creates a new edge in the graph.

Everything just works.

### The wall

Everything just works at small scale.

The problem is that effector stores are not free.

Each store is a node in the effector graph, with its own subscriber list, its own value cache, its own SID, and its own role in the scope/fork machinery.

Creating one is cheap; creating ten thousand is not.

A list of ten thousand books with five fields each would be fifty thousand stores.

With derived fields and refs added in, easily two hundred thousand.

Each one a node, each one with a watcher slot, each one a thing the scope has to track.

### What we measured

We measured this.

The library's predecessors did exactly the per-instance store layout, and it ran into a wall around five thousand instances.

The wall was not a hard cap — performance degraded smoothly — but the slope was wrong.

Renderings that should have been milliseconds turned into hundreds.

Garbage collection paused noticeably after large data loads.

SSR serialization was slow because every store contributed to the dump.

### Why a structural fix

The fix had to be structural, not algorithmic.

As long as each instance owned its own stores, no amount of micro-optimization would catch up.

We needed instances that did not own stores at all.

## The shared `$dataMap`

The model layer keeps one store per model: `$dataMap`, a `StoreWritable<Record<id, Record>>`.

Every instance's data lives inside it.

When you create a `bookModel` with id `42`, the model writes `42 -> { title: "...", pages: ..., ... }` into `$dataMap`.

When you delete the book, the model removes the entry.

When you mutate a field, the model updates the entry in place.

This is the structural foundation. Every read, every write, every subscription that touches instance data ultimately routes through `$dataMap`.

There is exactly one such store per model.

It is the source of truth, and nothing else holds a copy.

### Instances are wrappers

The instance object you get back from `bookModel.create()` is not a stand-alone bag of stores.

It is a wrapper around an ID.

The wrapper is a Proxy that, when you ask for `$title`, returns a small object — a field proxy — that knows how to read `title` from `$dataMap[id]`.

The field proxy is not a store. It is a façade.

## What a field proxy actually is

A field proxy is a tiny object that exposes the methods you expect from a store.

`.getState()`, `.set()` if the field is writable, `.on()` for registering handlers, and a few effector internals like `.graphite` and `.kind`.

Most of the methods do not call into effector at all.

### The read path

`.getState()` reads `$dataMap.getState()[id][field]` and returns the value.

No subscription, no graph traversal, no scope lookup.

Just a dictionary read.

### The write path

`.set(value)` fires a model-level event with `{ id, value }` as its payload.

The first time `.set` is called on a particular field, the proxy lazily creates a prepended event that flattens the payload into the model's update event.

After the first call, subsequent calls go directly through the prepended event with no allocation.

The model has a single `updateFx` that writes the new value into `$dataMap`.

### The subscribe path

`.on(event, reducer)` is more interesting.

When a user writes `$pages.on(addPages, (prev, n) => prev + n)` inside the model's `fn`, the proxy does not create an edge from `addPages` to `$pages`.

Instead, it registers the reducer in a model-level data structure called `SharedOnRegistry`.

The registry maps `event → field → reducer`.

When the model is set up, it wires exactly one `$dataMap.on(modelEvent, handler)` per event.

The handler walks the registry and applies the reducer for the right field on the right instance, inferred from the event payload.

The result is that ten thousand instances calling `.on` on the same event create exactly one effector edge — the one in the registry — not ten thousand.

The handler dispatches to the right instance based on the payload, but the wiring itself is shared.

### Effector internals

`.graphite` and the other effector internals are exposed because some effector operators (`combine`, `sample`, `scope.getState`) call into them directly to participate in the reactive graph.

When the proxy's `.graphite` is accessed, the proxy lazily materializes a real store — see the next section.

## The lazy materialization path

The proxy is a façade, but sometimes you actually need a real store.

`combine($title, $author, ...)` needs a real store on each side.

`sample({ source: $pages, ... })` needs one too.

Anything that wants to subscribe to the field as if it were a normal effector unit needs a real store.

### When it materializes

When that happens, the proxy materializes one.

The materialization is lazy: the first access to `.graphite`, `.map(fn)`, `.updates`, or anything else that would require a node triggers the creation of a per-instance store backed by `$dataMap`.

We call this `$instanceSlice` — a standalone `createStore` that subscribes to `$dataMap`, slices out the entry for this instance's ID, and exposes that slice.

The store is the same identity for every materialization on the same instance, so multiple `combine` calls share the same node.

### Per-instance, not per-field

The materialization is per-instance, not per-field.

If you materialize `$title` for instance `42`, you get a store of the whole entry for `42`, and `$title` is a `.map(s => s.title)` on top of it.

If you materialize `$author` for the same instance afterward, you get another `.map` from the same `$instanceSlice`.

The slice itself is created once per instance.

### What it costs

The cost of materialization is real but bounded.

Each materialized field adds one `.map` store.

Each materialized instance adds one `$instanceSlice` store.

For most use cases — bulk rendering of a list, occasional single-instance focus — almost no materialization happens, because the typical access pattern is `.getState()` or `useUnit($field)` (which goes through the proxy, not through the graph).

### Why lazy

The reason this path is lazy and not eager is the same reason the rest of the library is lazy.

Most applications do not pay this cost most of the time, and we did not want to make them pay it just because some applications would.

If you need many materialized fields, you pay for many materialized fields.

If you do not, you do not.

## What `useUnit` and friends actually do

The framework bindings (`@kbml-tentacles/react`, `@kbml-tentacles/vue`, `@kbml-tentacles/solid`) are aware of the proxy design.

When you write `useUnit(book.$title)` in React, the binding does not subscribe to `book.$title` as if it were a normal store.

It recognizes that `book.$title` is a field proxy, looks up the model, and subscribes to a slice of `$dataMap` filtered to the instance's entry.

The subscription only fires when that one entry changes.

### The list-rendering optimization

This is the path that makes large lists fast.

A thousand `<BookRow>` components each use `useUnit(book.$title)`.

None of them subscribe to thousand-element stores.

Each subscribes to a slice of `$dataMap`, narrowed to its own entry.

Updates to one entry fire only that entry's subscribers, not the others.

### The trick has limits

The trick has limits.

`combine($title, otherStore)` cannot use the slice path; it has to materialize a real store.

The framework bindings know this and fall back to the materialized path when they see a non-proxy unit.

The user does not have to think about it.

## The leaks

The proxy abstraction is not perfect. There are a few places where it shows.

### Debug tooling

The first is debug tooling.

If you log `book.$title` to the console, you see a Proxy with a strange shape, not the friendly `Store<string>` you might expect.

The library exposes a `[Symbol.toStringTag]` to make this less confusing, but if you reach into the object you can tell something is up.

### Type checking

The second is type checking.

The proxy's TypeScript type is `Store<T>`, because that is what callers want to see.

If you check `instance.$title instanceof Store`, the answer is `false`.

The library does not encourage runtime `instanceof` checks against effector internals, but if you do them, they will not match the way they would for a real store.

### `getState` semantics

The third is `getState()` semantics.

A real store's `.getState()` returns the value at the time of the call.

A proxy's `.getState()` reads from `$dataMap` at the time of the call, which is the same in practice but differs subtly under fork.

The proxy needs to know the scope, and the framework bindings handle this by pre-binding the scope.

If you call `.getState()` directly without a scope, you get the global scope's value.

This matches effector's normal behavior, but it is worth knowing.

### `.map` materialization

The fourth is `.map(fn)` materialization.

Calling `.map(fn)` triggers materialization.

If you call it inside a hot loop, you create a store per call.

The library does not memoize across `.map` calls because effector does not.

If you find yourself doing this, hoist the `.map` outside the loop.

## Why this is dramatically cheaper

The numerical estimate goes like this.

A model with no `fn` and no refs is essentially zero effector nodes per instance — the proxy objects themselves are small JavaScript objects with three or four properties.

Memory is dominated by the entry in `$dataMap`, which is a plain object the size of the data itself.

Realistic per-instance overhead is about 100 bytes for the proxy plus the bytes of the data.

### Adding `.on()` wiring

Add an `fn` that uses only `.on()` to wire events. Still zero effector nodes per instance, because the on-registry shares the handler.

The instance gets a region (about 12KB) only because we need to track teardown — see the [lightweight instances](/explanation/lightweight-instances) page for when even that gets skipped.

### Adding explicit stores

Add an `fn` that creates explicit stores or uses `combine`. Now you pay for what you create.

The library does not optimize what the user explicitly asks for; that would be misleading.

### Materializing a field

Materialize a field via `combine($title, ...)` or `scope.getState($title)`. Now the proxy creates a `.map` store and (if not already present) an `$instanceSlice`.

One materialization costs two nodes; subsequent materializations on the same instance cost one each.

### The comparison

Compare to the alternative — a per-instance store layout — and the difference is striking.

Ten thousand instances of a model with five fields would be fifty thousand stores in the alternative; in Tentacles it is zero, plus one shared `$dataMap`.

Even a model with intensive `fn` wiring stays close to the lower bound because `.on` calls share.

The cost only grows when the user explicitly opts into per-instance reactivity, which they do less often than you might think.

## Trade-offs

The proxy design is not free.

It costs us complexity in the model layer: the proxy code, the on-registry, the materialization logic, the cache management.

It costs us TypeScript trickery to make the proxy type behave like a store.

It costs us a slightly leaky abstraction at the edges, as described above.

### What it buys

It buys us a library that scales to data sizes that the per-instance-store design could not handle.

It buys us the ability to load ten thousand records and render them without ceremony.

It buys us SSR scopes that serialize quickly, because there is one store per model, not one per instance.

### Where the break-even is

The break-even is around a few hundred instances per model, on a typical desktop.

Below that, you would not notice the difference between per-instance stores and the proxy design.

Above it, the difference grows roughly linearly until you hit memory pressure or render budgets.

The proxy design holds up because it does not add nodes proportional to instance count; the per-instance design degrades because it does.

### When the design loses

If you have a use case where you want per-instance reactivity for most fields most of the time — say, hundreds of `combine` calls per instance — the proxy design will not save you, and you will end up materializing most of what you would have created eagerly anyway.

For that case, the cost is roughly the same as the per-instance design plus the proxy overhead, which is a small loss.

We accept that loss because it is rare and because the gain in the common case is so large.

### SSR consistency

The other thing the proxy design buys us is consistency under SSR.

Because there is one store per model and per-instance state lives in one big map, the serialization picks up everything in a single pass.

With per-instance stores you would need to walk the registry, serialize each store, and rehydrate them in order.

Tentacles serializes the model state by serializing one store.

That alone is worth a lot of the complexity.

## A mental model that holds

The mental model that serves you best, when reasoning about field proxies, is this.

Think of `$dataMap` as the database table.

Think of each instance as a row in that table.

Think of `instance.$title` as a typed accessor that knows how to read or write `title` on its row.

The accessor is reactive — it can be subscribed to, mapped over, combined with other accessors — and the reactivity routes through `$dataMap`.

Most of the time you do not need to materialize anything. You just call `.getState()` or use `useUnit`, and the framework binding does the right thing.

When you do need to materialize, the library handles it transparently. The first `.map` or `combine` triggers the materialization, and subsequent uses share the materialized store.

The only thing you really need to remember is that the proxy is not literally a store, so reflective tricks (`instanceof`, identity checks against the effector class) will not work the way you expect.

If you stay within the API, the abstraction is invisible.

If you reach for reflection, it shows.

## Why we did not document this earlier

A reasonable question: if the proxy is so important, why is it not in the first tutorial?

The answer is that it does not need to be.

The first tutorial introduces models, instances, and queries. Every example works exactly as a user would expect, regardless of whether the underlying mechanism is per-instance stores or proxy-backed accessors.

The proxy design is invisible to the user who is just using the library.

It becomes visible to the user who is trying to understand the library, or who is doing something unusual that bumps against one of the abstraction's leaky edges.

That user reads this page, gets the explanation, and goes back to writing application code with a richer mental model.

The mental model is the gift.

## Final thought

The proxy design is the kind of thing that makes a library feel light or heavy.

A library that creates a thousand stores for a thousand instances feels heavy. You can tell by the way the browser tab gets sluggish, by the way the React DevTools profile turns red, by the way the SSR payload bloats.

A library that treats a thousand instances as a thousand entries in one store feels light. The browser tab stays responsive, the profile stays green, the SSR payload stays small.

Tentacles wants to feel light, even at scale that other libraries treat as a special case.

The proxy design is a big part of how it gets there.
