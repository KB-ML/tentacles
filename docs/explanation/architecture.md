# Architecture

Tentacles is organized as five layers, each with a narrow responsibility and a clean boundary against the next.

You can describe each layer in a single sentence: contract declares, model stores, query filters, view-model assembles, shared supports. The interesting part is not the sentence but the edges — what each layer deliberately does not know about the others, and why the seams are where they are.

The five layers live in `packages/core/layers/<name>/`. Reading them in dependency order — contract first, then model, then query, then view-model, with shared threaded throughout — gives you a tour of the library from the surface down to the runtime.

This page is that tour. It will not teach you how to call any of the APIs; that is the tutorials' job. It will tell you what each layer is for, what invariants it maintains, and how the layers fit together.

## The contract-to-runtime pipeline

Everything Tentacles does flows through the same shape.

You declare a schema as a chain of method calls, and somewhere along the way that schema gets materialized into running effector units.

The declaration side is cheap, compile-time-only where it can be, and carries almost no runtime cost.

The runtime side is where stores, events, and reactive wiring come to life.

The seam between them is the moment you call `createModel({ contract })` — or, for ephemeral state, `createViewModel({ contract })`.

Keeping declaration and runtime separate is not a stylistic preference. It lets the library reason about the shape of your data statically, which is how we get the type inference you see at the call site.

It also lets us defer work. A contract that is declared but never instantiated costs nothing. You could `createContract().store("x", ...).pk("x")` a hundred times at module load, and so long as nothing calls `createModel` or `createViewModel`, no effector unit is born.

That matters for libraries that define optional features, for test utilities that construct disposable schemas, and for any codebase that imports more than it uses.

The contract layer is strictly declarative. It produces descriptors — plain objects that name fields, their types, their defaults, their unique-or-indexed flags, their foreign key targets.

The runtime layers never mutate a contract. When they need a runtime unit, they read the descriptor and build the unit fresh.

This one-way flow keeps the types honest. If you can see it at compile time, it is there at runtime, and nothing else is.

## The contract layer

The contract layer is a set of fluent builders that accumulate field descriptors.

The public entry points are `createContract()` for persistent models, `createViewContract()` for ephemeral component state, and `createPropsContract()` for external inputs to view models.

Each returns a chain object whose methods add a field and return a new chain with a narrowed type.

### `createContract()` and `ModelContractChain`

`createContract()` returns a `ModelContractChain`. It exposes `.store()`, `.event()`, `.derived()`, `.ref()`, `.inverse()`, and — once you are done — `.pk()`.

The `.pk()` call is the contract's finalizer. It verifies that every field you named as a primary key actually exists, computes a PK signature, and returns a `FinalizedContractImpl` — a different class, not just a differently-typed version of the chain.

The reason for the class change is symmetry. Once a contract is finalized, it cannot be extended, and the type system mirrors that by removing the builder methods. If you try to call `.store()` on a finalized contract, it does not compile.

The distinction between builder and artifact is something the library makes explicit. The chain is alive as long as you are adding to it; once you call `.pk()`, it is frozen.

### `createViewContract()` and `ViewContractChain`

`createViewContract()` is narrower.

View contracts have `.store()`, `.event()`, and `.derived()` — no refs, no primary key, no inverse, because view models do not persist.

Refs and inverses are relationship machinery, and relationships only make sense for data that sits in the shared `$dataMap`.

View models are short-lived per-instance state. They do not participate in the model registry. They have no primary key because there is nothing to key on; each instance is disposable and tied to a specific component mount.

### `createPropsContract()` and `PropsContractChainImpl`

`createPropsContract()` is narrower still.

A props contract describes the external inputs a view model accepts from its consumer — stores that can be provided from the outside, events the parent can fire.

Each field can be `.optional()`.

The props contract is not used on its own. It is passed to `createViewModel` alongside the view contract, and the view model normalizes whatever the consumer passes (a raw value, a store, a callback) into a uniform internal representation.

### The shared base

Underneath these three entry points is a shared base class, `BaseContractChain`, which holds the `fields` array, the `factoryDefaults`, and the `sidRoot`.

The shared fields are the bones of every contract. The specific subclasses layer on methods that only make sense for their kind.

### The strategy hook

All chain classes also expose a `[CONTRACT_CHAIN_STRATEGY]` property.

This is how `pick`, `omit`, `partial`, `required`, and `merge` work across chain types without caring whether they are looking at a `ModelContractChain`, a `ViewContractChain`, a `FormContractChainImpl` from `@kbml-tentacles/forms`, or a chain type that does not exist yet.

The strategy pattern is important enough to have its own page. See [Strategy pattern](/explanation/strategy-pattern).

## The model layer

The model layer is where declaration meets runtime.

`createModel({ contract })` takes a finalized contract and returns a `Model` — a persistent instance manager that owns the `$dataMap`, the `$ids` registry, the event system, the query-friendly projections, and the instance lifecycle.

### The single source of truth: `$dataMap`

The heart of the model layer is one store: `$dataMap`, a `StoreWritable<Record<id, Record>>`.

Every instance you create writes into this single store. Every query reads from it. Every field proxy reads from it.

There is one `$dataMap` per model, never per instance.

When you write `bookModel.create({ id: 1, title: "Hobbit" })`, no new effector store is born; we simply update the entry for `1` inside `$dataMap`.

When you write `hobbit.$title.getState()`, we do not read from a `$title` store — we read directly from `$dataMap[1].title` through a proxy.

That single-store architecture is the foundation of the cost estimates in the [field proxies](/explanation/field-proxies) page.

It is what makes ten thousand instances cheap. It is also the reason the model layer needs so many helpers: a single writable store is a powerful primitive, but a lot of infrastructure has to sit around it to give you the ergonomics of "each instance has its own fields and events."

### `ModelRegistry`

`ModelRegistry` owns several stores.

`$ids` is an array of IDs in insertion order.

`$idSet` is a `Set` derived from `$ids` for O(1) membership checks.

`$count` is derived from `$ids.length`.

`$pkeys` keys each instance by the PK signature for compound keys.

`$instances` is a lazy store that materializes the proxy-wrapped instance objects only when someone subscribes to it.

The `.instance(id)` and `.byPartialKey(partial)` methods are memoized, so repeated lookups return the same proxy object — critical for React-style reference equality checks.

The registry is the public-facing half of the model. Users who want to observe the population of a model subscribe to `$ids` or `$count`; users who want to iterate subscribe to `$instances`; users who want to find a specific instance call `.instance(id)`.

### `ModelIndexes`

`ModelIndexes` is where unique constraints and non-unique indexes live.

An index is a bookkeeping structure: a map from a field value (or a composite of several field values) to the set of IDs that share it.

Indexes bump a `$version` store when their contents change, so queries can invalidate themselves without re-scanning the full `$dataMap`.

A unique index rejects duplicates at write time. A non-unique index allows them but still supports `byIndex` lookups.

The separation between `ModelRegistry` and `ModelIndexes` keeps the index machinery optional. Models without indexes do not pay for the bookkeeping; the indexes class is lazy and only materializes when the contract declares at least one index.

### `InverseIndex`

`InverseIndex` is the imperative sibling of `ModelIndexes`.

Refs set up directional relationships. A `Comment` belongs to a `postModel`.

The inverse goes the other way: given a `postModel`, find all `Comment`s.

Because that question is asked a lot during rendering, we maintain a `Map<targetId, Set<sourceIds>>` and bump an event when it changes.

Consumers subscribe to the bump event and re-read the map.

We do not wrap the map in a store because stores do not handle mutable object identity cleanly. You would either have to clone the whole map on every change (expensive) or accept that `===` comparisons would not behave the way effector expects.

The bump-and-read pattern is a common one in the library. Anywhere we have an imperative data structure that needs to signal changes without forcing a full clone, we use an event to say "something changed, go look." Consumers who need to react to the change subscribe to the event.

### `RefApiFactory`

`RefApiFactory` is the thing that makes `instance.posts` and `instance.author` feel like normal APIs even though they are reactive.

For a many-ref, you get a `RefManyApi` with `$ids`, `add`, `remove`, and `$resolved` (the actual instance objects).

For a one-ref, you get a `RefOneApi` with `$id`, `set`, `clear`, and `$resolved`.

Both are backed by `$dataMap` and the inverse index. Creating a ref instance does not create new stores, just accessors.

The API shape is symmetric between one-refs and many-refs. `$id` or `$ids` for the key; a setter (`set` or `add`/`remove`); `$resolved` for the other-side instances. Users who learn one learn the other.

### `PrimaryKeyResolver`

`PrimaryKeyResolver` handles the awkward parts of PKs.

Extracting them from arbitrary input data.

Applying autoincrement when you did not provide one.

Remapping foreign keys when a ref's PK changes.

Resolving nested ref data — the `connect`, `create`, and `connectOrCreate` shapes you can nest inside a `create` call.

It is a focused class because PK logic has many edge cases, and colocating them is cheaper than spreading them across the rest of the model layer.

PK resolution happens at the front of every `create` and `update` call, before the data touches `$dataMap`. That ordering matters: by the time the data is inserted, it has already been normalized, validated, and had its foreign keys resolved to real IDs.

### `ModelEffects`

`ModelEffects` defines the effector effects and events the outside world uses to interact with the model.

`createFx`, `deleteFx`, `updateFx` are the effects.

`created`, `deleted`, `cleared` are the lifecycle events.

These are the bridge from "data I have in hand" to "data in the model."

They exist because effects compose cleanly with `sample` and `attach`, so you can build larger workflows — saving to a backend, syncing across tabs — on top of them without reaching into the model's internals.

Everything that mutates `$dataMap` routes through one of the three effects. This centralizes the write path: if you want to audit every write, you only need to hook one side.

### `InstanceCache`

`InstanceCache` is an ordered map.

A hash table with a doubly-linked list laid over it to preserve insertion order with O(1) add and remove.

It stores the entry for each instance, which includes the model proxy, the unit bundle (events, refs, extensions from `fn`), the effector region if one was created, and the list of registered SIDs for that instance.

The ordered-map structure matters because `$ids` needs to preserve insertion order (and `.push`/`.splice` operations), and linear-scan operations like `Array.prototype.find` would be too slow at scale. The doubly-linked list lets us walk in order in O(N) and remove in O(1), which is the right trade-off.

### `SidRegistry`

`SidRegistry` deduplicates SIDs per scope.

Effector uses SIDs to serialize and rehydrate state across server and client. Two stores with the same SID in the same scope collide, so we make sure each store we create gets a unique one.

The registry also tracks which SIDs came from which instance, which is how teardown removes them correctly when an instance is disposed.

### The instance entry

An instance's cache entry has the shape `{ model: FullInstance, units: Record, region: Node | null, registeredSids: string[] }`.

The `model` field is the user-visible proxy.

The `units` field is the bundle of effector units attached to the instance.

The `region` field is the effector region — or `null` if the instance took the lightweight path.

The `registeredSids` field is the list of SIDs to unregister on teardown.

### Creation flow

The path from `create` to a usable instance has several steps.

Validate data.

Resolve PK.

Call `createUnits()` to build the field proxies and lazy event prepends.

Wire the new entry into `$dataMap`.

Run `fn`, the user's per-model builder, on the first instance creation.

Wire inverses and computed fields.

Return the `FullInstance` with `$`-prefixed proxy stores.

Most of these steps happen in sub-millisecond time. The expensive ones are `fn` (runs only once per model, not per instance) and the region allocation (skipped entirely for lightweight models).

### Per-instance cost estimates

No fn, no refs: 0 effector nodes, about 0.1KB (proxy objects + `$dataMap` entry).

fn with `.on()` only: 0 effector nodes (shared model-level handler), about 12KB (region + proxy objects).

fn with `createStore`/`combine`: N extension nodes, where N is what the user created.

Field materialization (rare, on `combine`/`scope.getState`): +1 `.map()` store per materialized field.

The library's cost scales with work the user explicitly asks for, not with instance count alone.

## The query layer

The query layer exists because "give me the subset of instances that match this filter, sorted this way, paginated to this page" is a very common question, and doing it with hand-rolled `combine` calls gets ugly fast.

`CollectionQuery` is a chainable reactive query that produces live results. You declare the shape of the question, and the answer updates whenever the underlying data changes.

### The chain

A query chain starts at `Model.query()` and threads through `.where(field, operator)`, `.when($condition, fn)`, `.orderBy(field, dir)`, `.limit(n)`, `.offset(n)`, `.distinct(field)`, and `.groupBy(field)`.

At the end you have a `CollectionQuery`. Internally it runs an id pipeline — filter → sort → paginate, all as `ModelInstanceId[]`. The public outputs are `$ids` (the paginated ids, the authoritative stream), `$list` (plain data rows projected from `$ids + $dataMap`), `$first` (the first row or `null`), `$count`, and `$totalCount`.

`$list` emits **plain rows** — field snapshots, no stores, no events. For reactive per-row access (e.g. writing to `$field`, listening to per-row events), iterate `$ids` and call `Model.instance(id)`.

The chain is immutable. Each builder method returns a new `QueryDescriptor` — a plain object — without modifying the old one.

### Memoization

Descriptors are keys in a `QueryRegistry` cache. `Model.query().where("x", eq(1))` called twice in a row returns the same `CollectionQuery` instance.

That memoization matters because it saves work on re-renders and keeps store identity stable for framework bindings that rely on it.

If the framework binding sees the same query object on two consecutive renders, it does not need to re-subscribe. If it sees different objects each render, it tears down and rebuilds the subscription, which is wasteful.

### The two update paths

The reactive wiring has two update paths.

The first is a full scan. When `$ids` changes (an instance was added or removed) or when a reactive operand changes (the user passed `gte($threshold)` and `$threshold` updated), the filter stage re-evaluates from scratch via `combine([$ids, $dataMap, ...operands]).map(...)`.

The second is an incremental path. When a single instance's field mutates, we do not want to re-scan the whole collection. The `$fieldUpdated` event carries the instance ID and the field name, and the filter stage uses a `sample` to check whether that one instance should enter or leave the result set.

The [incremental queries](/explanation/incremental-queries) page goes into the details. The short version is that it is O(1) per field change instead of O(N).

### Operators

Operators are the glue between fields and values.

There are fifteen of them: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `oneOf`, `contains`, `includes`, `startsWith`, `endsWith`, `matches`, plus variants for negation.

Each one is `Reactive<T>` — it accepts either a raw value or a `Store<T>`.

That uniform interface is the reason `.where("x", eq(1))` and `.where("x", eq($threshold))` are the same call. The operator handles the unwrapping internally.

### `QueryField`

`QueryField` is a smaller but related concept.

If you want a reactive view of just one column — say, all book titles — you call `bookModel.query().field("title")` and get a `QueryField` with a `$values` store, an `.update(value)` method, and an `.updated` event.

`QueryField` is derived from `$ids` and `$dataMap` directly. That keeps one-column reads cheap — you skip the per-row object allocation `$list` does.

## The view-model layer

The view-model layer is where per-component reactive state lives.

Unlike the model layer, which is persistent and shared, view models are ephemeral. They are meant for things like form controllers, search inputs, dropdown state, wizard steps — the reactive bits that live as long as the UI does and die when the component unmounts.

### `createViewModel`

`createViewModel({ contract, props?, fn? })` returns a `ViewModelDefinition`.

A definition is a blueprint, not an instance.

You call `.create(props)` to materialize an instance, or `.instantiate(propUnits)` when you already have effector units on hand and do not want them normalized.

### `ViewModelInstance`

Each instance has a `.shape` (the stores and events the user interacts with), a `.lifecycle` (the `mounted` and `unmounted` events, plus `$mounted`), and an `.id`.

The lifecycle events are the hooks by which framework bindings signal "the component has mounted" and "the component is about to unmount."

### Bare stores, not proxies

Under the hood, view model instances create real effector stores, not proxies.

There is no `$dataMap` for view models — they are not persistent, so there is nothing to share.

Every instance gets its own region (via effector's `withRegion`), which is how destruction works: calling `destroy()` tears down the region and every node inside it goes with it.

The region is nestable, so a view model created inside another view model inherits the parent's region and dies with it.

### Prop normalization

Props are a subtle part of the design.

Store props accept `T | Store<T>` — either a raw value the parent computed, or an already-live store the parent wants to pass through.

Event props accept `EventCallable<T> | (T) => void` — either a real effector event or a plain callback function.

The view model normalizes whatever you pass to a uniform internal representation, so the `userFn` always sees stores and events regardless of what was on the other side.

That normalization is cheap to describe but takes some careful code to get right. It lives in the view model layer and nowhere else.

### `resolveFrom`

`resolveFrom(stack, fieldName, targetModel)` is the utility that makes `<Each>` over a ref work smoothly.

When you render a list of comments under a post, each comment wants access to the post it belongs to — but the post lives in the parent's scope, not the comment's.

`resolveFrom` walks the stack of parent view models looking for a shared store that matches, so the child does not have to prop-drill it manually.

## The shared layer

The shared layer is the smallest.

It contains two things worth mentioning: `detectSidRoot()` and `TentaclesError`.

### `detectSidRoot`

`detectSidRoot` is how Tentacles figures out where to root its SIDs.

When you call `createContract()`, the library creates a throwaway test store inside that call and immediately reads its `sid` property.

That store's SID (injected by the babel plugin, if you have it configured) carries the module path.

The library reads the SID prefix off the test store, stashes it on the contract, and uses it as the root for every SID it generates later.

The [SSR and SIDs](/explanation/ssr-and-sids) page explains why this matters.

The short version is that it makes SIDs stable across server and client without requiring you to name them manually.

### `TentaclesError`

`TentaclesError` is the library's structured error type, and `tentaclesWarn` is its warning counterpart.

They exist for consistency. A library that throws plain `Error` objects is hard to catch selectively.

They give consumers a single place to wire logging or error reporting.

## What the architecture buys you

Five layers sounds like a lot. The pay-off is that the mental model stays small.

When you debug a problem, you can usually name which layer it belongs to within a second.

A typing problem is almost always in the contract layer.

A missing instance is almost always in the model layer.

A stale or jittery result is almost always in the query layer.

A lifecycle issue is almost always in the view-model layer.

And the cross-cutting concerns — SSR, SIDs, errors — are in the shared layer.

## The trade-offs of layering

The cost is that reading the source is not linear.

The contract layer knows nothing about the model layer, but the model layer leans heavily on the contract layer's descriptors.

The query layer leans on the model layer's `$dataMap` and `$ids`.

The view-model layer leans on effector directly and uses the model layer only for form arrays (in `@kbml-tentacles/forms`).

If you try to read the source top-down, you will find yourself jumping between layers often.

Reading bottom-up — shared, then contract, then model, then query, then view-model — is usually clearer.

## The boundaries are pragmatic

The other cost is that sometimes the boundaries feel artificial.

Why is `InverseIndex` in the model layer and not its own layer?

Why is `QueryField` in the query layer and not the model layer?

The answers are practical.

`InverseIndex` is tightly coupled to the ref machinery, which is already in the model layer. Splitting it would mean threading it back through.

`QueryField` is used only by queries and would clutter the model layer if it lived there.

The boundaries are drawn where the natural tension lies, not where a purist diagram would put them.

## What you take away

The architecture is not a cathedral. It is five rooms in a flat, each with a door to the next.

The contract layer takes descriptions and gives you typed chains.

The model layer takes chains and gives you persistent instance management.

The query layer takes models and gives you reactive filters.

The view-model layer takes contracts and gives you per-component state.

The shared layer is the utility closet everything else leans on.

You will interact with these layers as a user whether you know their names or not. When something surprises you, the first move is to name which layer the surprise lives in. That usually narrows down the question enough that the answer follows naturally.
