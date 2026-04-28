---
description: "How queries update efficiently when individual model fields change."
---

# Incremental queries

A query is a live filter over a model.

When data changes, the query's outputs — `$ids`, `$list`, `$first`, `$count` — should update to reflect the new world.

The naive way to do this is to re-run the whole query whenever anything changes.

That works at small scale and falls over at large scale.

Tentacles has two update paths, and the difference between them is the difference between a query that scales and a query that does not.

This page is about those two paths. When each runs, why they coexist, and the handful of optimizations that make the fast path actually fast.

## The shape of a query

Every query has the same pipeline.

The filter stage holds the IDs that match the `.where(...)` clauses.

The sort stage reorders those IDs per `.orderBy(...)`.

The pagination stage slices by `.limit/.offset` and produces `$ids` — the paginated IDs in display order.

`$list` projects each ID into a plain row by looking it up in `$dataMap`. `$first` is the first row or `null`.

There are a few secondary stores — `$count`, `$totalCount` — but they all derive from the pipeline's id stream. The pipeline is an **id pipeline**: stages manipulate `ModelInstanceId[]`, and rows get materialized only at the very end, only for the paginated slice.

### How queries are built

The pipeline is built once per query.

When you call `Model.query().where(...).orderBy(...).limit(...)`, the chain produces an immutable `QueryDescriptor`, and `QueryRegistry` either returns a cached `CollectionQuery` for that descriptor or builds a new one.

Two chains that produce the same descriptor share the same `CollectionQuery`.

This is important for re-renders: a component calling `Model.query().where("x", eq(1))` on every render does not create a new query each time; it looks up the same one.

### What stays after building

Given the pipeline and the fact that queries are cached, the remaining question is how to keep the stores up to date as data changes.

That is where the two update paths come in.

## The full scan

The full-scan path is conceptually simple.

The filter stage is a `.map` over `combine([$ids, $dataMap, ...operands])`.

Whenever any of the sources changes, the combine emits a new value, and the map runs: walk `$ids`, look each one up in `$dataMap`, evaluate the `where` predicates, emit the subset that matches.

### What triggers the full scan

The sources that drive the full scan are clear.

`$ids` changes when an instance is created, deleted, or reordered. The set of candidate instances has changed, so every prior filter result is suspect.

`$dataMap` changes when any instance's data changes. The data of any candidate instance may have affected whether it matches.

The reactive operands are the stores the user passed into operators. If you wrote `.where("pages", gte($threshold))`, then `$threshold` is an operand. Its change means the predicate itself has changed, so every instance has to be re-evaluated.

### The cost

The full scan is O(N) in the number of IDs for each update.

If you have a thousand instances and you add one, the full scan runs on all one thousand — not just the one you added.

That is the right behavior when the operand changed, because the predicate is different now.

It is wasteful when a single instance's title changed and the filter is on `pages`, because no other instance's data affects the answer.

### Always correct, sometimes wasteful

The full scan is always correct, always simple, and always expensive at scale.

The incremental path is the mitigation.

## The incremental path

When a single instance mutates a field, the library fires an event called `$fieldUpdated` carrying `{ id, field, value }`.

This event is not exposed publicly — it is an internal signal the query layer listens for.

### How the sample works

The query layer registers a `sample` from `$fieldUpdated` into the filter-stage store.

The sample's logic is, roughly: look at the updated instance, evaluate the `where` predicates against it, and either add it to the filtered set, remove it, or leave it untouched.

### The performance

This path is O(1) in the instance count.

It only evaluates the predicates for the one instance that changed.

For a thousand-instance collection, one field change costs the same work as it would for a ten-instance collection.

### What the path does not handle

The incremental path is not always available.

It only handles field mutations on existing instances.

When `$ids` itself changes (an instance is created or deleted), the full scan runs.

When an operand changes (the `$threshold` store emits), the full scan runs.

Those cases are genuinely structural — the predicate's truth depends on values outside the single-instance check — and no amount of incremental cleverness escapes them.

### Why the trick works

The trick is that field mutations are the common case.

Most updates in a running application are "user edited a record's field" or "background job updated one field on one row."

`$ids` changes less often than `$dataMap` does, and operand changes are rarer still.

By making the common case fast, the library handles realistic workloads without ever hitting the O(N) wall.

## Why `$fieldUpdated` is its own event

You might expect that `$dataMap.updates` would be enough — the library could listen to `$dataMap` and figure out what changed by diffing.

It chooses not to.

Instead, every write to `$dataMap` goes through internal `updateFx` effects that fire `$fieldUpdated` alongside the write.

### The cost of diffing after the fact

The reason is that diffing a store update after the fact is expensive.

The library would have to compare the previous `$dataMap` state with the new state, identify which instance changed and which fields within it, and package that into an event.

That comparison is itself O(N) in the worst case, which defeats the point.

By firing `$fieldUpdated` at the site of the write, the library knows the details without computing them.

### A secondary benefit

A secondary benefit is that the event carries the instance id and the new value, which lets the incremental path evaluate only the affected predicate.

Think `.where("active", eq(true))` — the library can check just that field on just that instance and either add or remove it from the filtered set, without re-checking the other fields.

### Implicit batching

The event is debounced implicitly through effector's normal propagation — multiple writes in a single synchronous batch coalesce, so the incremental path does not over-fire.

## The sort stage's optimization

The sort stage depends on the filter stage's output and the chosen order-by fields.

If the filtered set changes, the sort has to re-run.

If the data of an instance that is already in the filtered set changes, and the changed field is one of the sort fields, the sort has to re-run.

But if the changed field is not one of the sort fields, the sort does not need to re-run — the order is the same as it was.

### The `$sortFieldBump` trick

We added a `$sortFieldBump` optimization to take advantage of this.

The query maintains a counter that increments (via the same `$fieldUpdated` event) **only** when the mutated field is one of the sort fields.

When the sort stage is about to re-evaluate, it compares the counter to the value it saw last time. If the counter did not advance and the filtered set did not structurally change, the sort stage short-circuits and keeps its previous value.

Using a monotonic counter instead of a "last field name" store matters: a store deduplicates on equal values, so two consecutive mutations to the *same* sort field would look like no change. The counter emits a distinct value every time, so every real sort-field mutation is observed.

### The performance impact

The savings matter at scale.

A sort is O(N log N), so skipping it when the trigger did not require it is roughly the same savings as skipping `$filtered`'s work for a non-match.

Together, the two optimizations — incremental filter stage and short-circuited sort stage — turn a typical field mutation from "full rescan plus full resort" into "single-instance check and nothing else."

### When the fallback runs

The fallback is conservative.

If the library cannot prove that the change is non-structural, it runs the full resort.

That happens when the field change triggered a change in the filtered set (the instance entered or left the filter).

When the operand itself changed (the predicate is different and the positions may have shifted).

When `$ids` itself changed (an instance was created or deleted, and its position depends on the sort).

In all those cases, the full scan is both necessary and unavoidable.

## Pagination is free

`.limit(n)` and `.offset(n)` apply at the end of the id pipeline — after the sort, before `$list` projects rows.

They slice the sorted IDs to the current page.

### The cost is O(page size)

Because they are O(page size) and not O(total size), they add almost no cost.

The interesting optimization is that they do not trigger re-evaluation of the filter or sort stages.

Changing the limit or the offset only re-slices the existing sorted output; it does not re-run the filter or the sort.

`$list` projects rows from `$ids + $dataMap` and dedups by reference equality — a mutation on a row outside the current page returns the same array, so rendering is skipped entirely. Only pages that actually changed emit.

### Total count

The total count is tracked separately.

`$totalCount` is the size of the filtered set (pre-pagination), not the size of `$list`.

If you want to display "showing 10 of 57", you read `$list` and `$totalCount`.

This is the standard separation that pagination libraries have, but implementing it on top of the pipeline takes a little care: the limit/offset slice must not accidentally feed back into what the filter and sort compute.

## Why `QueryField` is derived from `$ids` and `$dataMap`

`QueryField` is a smaller cousin of `CollectionQuery`.

It represents a single-field projection: `bookModel.query().field("title")` gives you a `QueryField<string>` with `$values`, `.update(value)`, and an `.updated` event.

You reach for it when you want a reactive view of a column without the filter/sort machinery.

### The dependency choice

The implementation detail worth naming here: `QueryField`'s `$values` is derived directly from `$ids` and `$dataMap`.

It walks the IDs, looks up each one's field in `$dataMap`, and returns the values.

This is O(N) for the field projection, but there's no per-row object allocation — just a primitive-array walk — so it's strictly cheaper than deriving from `$list`.

## Operand reactivity is a feature, not an accident

The fact that operators accept `Store<T>` as well as raw values is more than syntactic sugar.

It lets you build queries that respond to UI state without writing any plumbing.

Want a threshold slider that filters your book list? Pass the slider's store as the operand to `gte`.

Want a filter that tracks the currently logged-in user? Pass the auth store.

### The cost

The cost is that reactive operands trigger the full-scan path when they change.

A slider that updates on every drag frame will run full scans on every drag frame.

For small collections this is fine.

For very large collections you may want to debounce the slider's store so the query does not thrash.

### Why we did not optimize this

We considered providing an incremental path for operand changes, but it is not tractable in general.

When `$threshold` changes, the predicate changes, and every candidate instance has to be re-evaluated.

The only optimization available is to prove that the new threshold makes the predicate a superset or subset of the old one, which you can do for specific monotonic operators (`gte`, `lte`) but not in general.

We did not implement that specialization because the common case with reactive operands is a sliding threshold on a modestly-sized collection, which the full scan handles fine.

## Memoization and identity

`QueryRegistry` memoizes `CollectionQuery` instances by descriptor equality.

Two descriptors are equal if they have the same chain: same fields, same operators, same operand identities.

The registry uses structural equality for the descriptor and identity equality for operands (because stores compare by identity).

### Why memoization matters

The memoization matters because framework bindings compare store identities to decide whether to re-subscribe.

If `Model.query().where("x", eq(1))` returned a new query every call, every render would create a new query, every `useUnit` would re-subscribe, and the UI would thrash.

Memoization ensures that repeat calls return the same query, which keeps subscription identity stable.

### A subtle consequence

A subtle consequence: two semantically equal queries with different operand identities are different queries.

`Model.query().where("x", eq(createStore(1)))` and `Model.query().where("x", eq(createStore(1)))` are not the same, because the two `createStore(1)` calls produce different store identities.

If you want them to be the same, hoist the store out to a shared constant.

This is the standard effector pattern; the library does not try to deduplicate stores for you.

## What the pipeline does not do

The query layer is explicitly in-memory.

It operates on the data already loaded into the model.

It does not know about remote sources, it does not page through lazy cursors, it does not stream.

### When the layer is wrong

If your application has a million records that do not fit in memory, the query layer is the wrong tool.

You should do your filtering and sorting on the server, bring back the page you need, and use Tentacles models for the already-loaded data.

The incremental query logic is meant for the common case of a few thousand records in memory, with frequent field mutations, where re-scanning would be wasteful.

### No cross-model joins

The other thing the layer does not do is cross-model joins in a strict sense.

You can access `book.author.$name` via refs, and you can build queries that filter books by author via a computed field, but the query's filter runs on the book data alone.

The ref resolution happens during instance access, not during filter evaluation.

This is fine for most use cases, but it means "find books whose author is active" requires either a computed field on the book (that mirrors the author's active state) or a manual scan.

We considered adding relational operators to the query layer and decided against it on complexity grounds.

## The sum of the optimizations

Together, the two update paths and the associated optimizations give the query layer its performance profile.

The full scan handles structural changes, which are rare.

The incremental path handles field mutations, which are common.

The sort short-circuits when the changed field is not a sort field.

The pagination is a tail-end slice.

The memoization keeps identities stable.

### What this gives you

The result is that a typical query — "show active users sorted by name, paginated to the first 50" — runs in effectively constant time per update as the data size grows.

Loading a thousand users is about the same cost as loading ten, from the query's perspective.

Editing one user's name triggers a single-instance check and (if the name sorts differently) a single resort.

Changing the pagination slice is a slice copy.

None of the common operations are O(N); most of them are O(page size) or O(1).

### Why it works as the default

That profile is what lets the query layer be the default tool for in-memory collections in Tentacles.

You reach for it without worrying about whether the data is too big, because the incremental path keeps the cost proportional to the change, not to the state.

## A mental model

The mental model that helps when you are debugging a slow query is this.

Ask which path the update took.

If the update was a single field change, ask whether the incremental path applied. (It usually did.)

If the update was a structural change — an instance was created or deleted, or an operand store changed — the full scan ran, and there is nothing the library can do to avoid it.

If you are seeing more re-renders than you expect, look at the operand stores. A reactive operand changing fires the full scan.

If you are seeing slow sorts despite simple field changes, look at whether the changed field is a sort field. If it is, the sort runs. If not, the `$sortFieldBump` optimization should keep it from running.

### When to suspect the library

The library tries to be conservative; it does not optimize aggressively in cases where the optimization might be wrong.

If you see a query running the full scan when you think it should not, it is most likely because the library cannot prove the optimization is safe.

If you can construct a small repro that demonstrates an unnecessary full scan, open an issue. The query layer's optimization rules can be tightened, but only with confidence that the change does not break correctness.

## Where incrementality does not apply

There are a few places in the library where we chose not to build an incremental path even though one might have been possible.

### Distinct

`.distinct(field)` reduces the result set to unique values of a field. Making this incremental would require maintaining a frequency map of the values we have seen. The complexity of updating the map on add, remove, and field-change was not worth the optimization for the scale we target.

### GroupBy

`.groupBy(field)` produces a `GroupedQuery`. The grouping is re-evaluated when the filtered set changes. We considered incremental group updates but decided the full re-group was cheap enough given typical group counts (a few dozen at most).

### Aggregations

Aggregations like `count`, `sum`, `average` over grouped or filtered data are re-evaluated on every trigger. Incremental aggregation is possible but was not worth the implementation cost for the scale users typically apply it to.

If you are running into performance issues with any of these, please open an issue. The incremental paths can be added if the need is real; they were not added because the need did not seem real enough to justify the complexity at design time.

## Summary

The query layer has two update paths because the common case is different from the worst case.

The full scan handles structural and operand changes; the incremental path handles single-field mutations.

The sort short-circuits when the changed field is not a sort field, via `$sortFieldBump`.

`QueryField` derives directly from `$ids` and `$dataMap` — no per-row allocation on column reads.

Memoization through `QueryRegistry` keeps query identity stable across re-renders.

Together, these mechanisms give the query layer its scaling profile. The library handles thousands of instances without breaking sweat. It handles tens of thousands with a little care from the user (reactive operands debounced, contracts kept lean). Above that, the library would rather you reach for a different tool — a server-side filter, a streaming cursor — than try to push the in-memory layer past its design point.
