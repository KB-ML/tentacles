# Form arrays as models

`FormArrayShape` isn't a special-case collection. It's a `@kbml-tentacles/core` Model instance, and every row is a real model record with a synthetic primary key. Understanding this unlocks why `$ids` / `$at(i)` / `query()` all work — and explains why form arrays have better reordering, keying, and subscription behavior than most form libraries.

## The sleight of hand

When you write:

```ts
const contactContract = createFormContract()
  .field("name", (f) => f<string>().default(""))
  .field("phone", (f) => f<string>().default(""))

createFormContract()
  .array("contacts", contactContract, { min: 1, max: 5 })
```

The runtime converts `contactContract` into a `core` model contract. It generates a synthetic PK field called `__rowId` with `.autoincrement()`, attaches the user's fields as additional descriptors, and calls `createModel(...)`. The result is a Model. Every `append(...)` call does a `model.create({ __rowId, ...defaults })`. Every `remove(...)` does `model.deleteFx`. The `FormArrayShape` object you interact with is that Model with a sugar layer on top.

This is why `$ids: Store<number[]>` and `$count: Store<number>` exist on the array — they come from Model, not the forms layer.

## What synthetic `__rowId` buys you

Most form libraries index rows by position. If you have three rows `[A, B, C]` at indices `[0, 1, 2]` and remove `B`, the remaining rows now live at `[0, 1]`. Any React key that was `index` causes the wrong component to unmount.

With `__rowId`:

- Every row has a stable identifier the moment it's added — an autoincrement integer.
- Reordering, removing, and inserting don't renumber existing rows.
- React/Vue/Solid list keys can use `row.key` safely. The component for row `__rowId=5` stays mounted regardless of position.
- Focus preservation, input selection state, and per-row animations all just work.

Users can also opt into a semantic key via `FormArrayOptions.key`:

```ts
.array("contacts", contactContract, {
  key: (row) => row.email,  // or a string: "email"
})
```

When `key` is provided, the row's `key` property exposes that instead of `__rowId`. Useful when you're syncing against a server list and want stable IDs tied to domain data.

## Rows are real FormShapes

Each row is a `FormRowShape<Row>`, which extends `FormShape<Row>`. That means a row has:

- Its own `$values`, `$errors`, `$isDirty`, `$isValid`, and every other aggregate.
- Its own `submit`, `reset`, `resetTo`, `setValue`, `setError`, etc.
- Its own validation lifecycle — sync + async validators run per-row, independently.
- Full recursive structure: a row can itself have `.sub()` or nested `.array()` fields.

Because of this recursion, a single form can represent arbitrarily deep hierarchies: an order form with a `lineItems` array, where each line item has an `options` sub-form, where each option has a `tags` array. Every level is a Model, every row is a FormShape, and validators compose predictably.

## Why this isn't overkill

A naive implementation would store rows as `Row[]` in a single `$rows` store and derive everything from there. It's simpler. So why the Model?

**Subscription granularity.** When row 3 updates, a naive `Row[]` store would notify every subscriber of `$rows` — every other row's components re-render. With a Model, `row.$values` is per-row; editing row 3 doesn't touch row 1's subscription graph.

**Queryability.** `array.query().where("status", eq("pending")).$list` is a real, reactive query. Filtering, sorting, grouping across rows uses the same query engine that powers regular models. You don't rebuild the data; you declare a view of it.

**Reorder performance.** `move({ from: 0, to: 4 })` is a single `$ids` permutation. The row data doesn't move — only the order of identifiers. With a plain `Row[]`, you'd splice the array and notify subscribers about every element.

**Per-row reactivity.** `$at(i): Store<FormRowShape | null>` lets one component watch "whichever row is at index 3 right now" reactively. The row object at that position changes after reorders, and subscribers update transparently.

**Lifecycle & effects.** Models have `created`, `deleted`, `cleared` events. You can wire "when a row is added, focus its first input" or "when a row is deleted, fire an analytics event" using the same effector primitives you'd use anywhere else.

## Array aggregates without `getState()`

Form aggregates like `$isDirty`, `$isValid`, `$errors` across an array depend on per-row state. The naive approach — loop through rows and read `$error.getState()` — would violate rule 6 of this project (no `getState` in library code) and would miss reactive updates.

Instead, `buildFormArray()` maintains a `$rowStates` registry: `Store<Map<__rowId, RowStateSnapshot>>`. Each row's state is sampled into that map whenever it changes. The array's aggregates are pure `combine`s over that registry — fully reactive, SSR-safe, and subscription-efficient.

This is why arrays can compute `$isDirty` across 500 rows cheaply: each row publishes its state once into the registry, and the registry combines into one aggregate per array.

## The cost of the abstraction

Using a Model per array has some overhead:

- Creating an array of 10 rows creates 10 Model instances. Each instance has its own field proxies and per-row state.
- For very simple arrays (say, a list of strings), the overhead is higher than a bespoke list.
- Debugging is trickier — the effector graph shows row-level stores as Model instances, which can obscure the form-specific intent.

The payoff:

- Perfect reorder stability.
- Per-row queries.
- Per-row validation that composes with form-level validation.
- Subscription granularity that most form libraries can't match.
- One conceptual model: "an array is a model, rows are instances."

For most forms with 1–100 rows, the overhead is invisible. For extreme cases (1000+ rows), consider whether a form array is the right abstraction at all — it likely isn't; you want a table with a model you manage directly.

## What this means for users

You rarely need to think about `__rowId` directly:

- Use `row.key` as your React/Vue/Solid list key.
- Use `row.remove()` instead of `arrayRef.remove(row.index)` — safer against reorders.
- Use `array.$at(i)` when you need "the row at position i" reactively.
- Use `array.query()` when you need filtering or sorting — it's the Model query API.

The Model-backed design is an implementation choice that surfaces mostly as convenience.

## See also

| Topic | Link |
|---|---|
| The array shape | [FormArrayShape](/reference/forms/form-array-shape) |
| Row shape | [FormRowShape](/reference/forms/form-row-shape) |
| How-to: arrays | [Work with form arrays](/how-to/work-with-form-arrays) |
| Model layer | [createModel](/reference/core/create-model) |
| Why queries are incremental | [Explanation: Incremental queries](/explanation/incremental-queries) |
