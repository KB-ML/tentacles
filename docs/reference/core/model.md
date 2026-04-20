# Model

`Model` is the runtime object returned by `createModel`. It owns the single `$dataMap` that backs every instance, exposes reactive membership stores (`$ids`, `$idSet`, `$count`, `$pkeys`), provides sync instance access (`get(id)`, `instances()`), wraps CRUD as effects with scope-aware variants, and produces `CollectionQuery` objects on demand. This page is a complete reference for every member on the public surface.

## Built-in stores

Every `Model` exposes these getters. They are lazy — the underlying effector store is materialised on first read.

### `Model.$ids`

```ts
Model.$ids: Store<ID[]>
```

Insertion-ordered list of instance IDs. Updated by `create`, `createMany`, `delete`, `clear`, and `reorder`. Order is preserved — equivalent to the cache's `InstanceCache` key sequence.

### `Model.$pkeys`

```ts
Model.$pkeys: Store<string[] | number[] | CompoundKey[]>
```

Alias for `$ids` under primary-key semantics. For compound PKs the element is a `CompoundKey` (tuple). For single PKs it is a string or number matching the PK field's type.

### `Model.$count`

```ts
Model.$count: Store<number>
```

Length of `$ids`. Derived; cheap to subscribe to.

### `Model.instances()`

```ts
Model.instances(): Instance[]
```

Synchronous snapshot of all live Instance proxies in global scope, in insertion order. For large collections or reactive contexts prefer `$ids` + `Model.get(id)` so you only touch the records you render. For scoped reads, use `scope.getState(Model.$ids)` followed by `Model.get(id)`.

## Built-in effects

Every mutation method has a matching `*Fx` effect. Effects are scope-aware — `fork`/`allSettled` honour them automatically.

### `Model.createFx`

```ts
Model.createFx: Effect<CreateData, Instance>
```

Effect form of `Model.create`. Accepts the same payload as the create data object.

### `Model.createManyFx`

```ts
Model.createManyFx: Effect<CreateData[], Instance[]>
```

Batch create. Single `$dataMap` update, single `$ids` update — O(N) instead of O(N²).

### `Model.deleteFx`

```ts
Model.deleteFx: Effect<ID, void>
```

Effect form of `Model.delete`. Applies cascade/nullify/restrict policies on referenced fields.

### `Model.clearFx`

```ts
Model.clearFx: Effect<void, void>
```

Wipe all instances. Cascade rules apply to each deletion.

### `Model.updateFx`

```ts
Model.updateFx: Effect<{ id: ID; data: Partial<Fields> }, Instance | null>
```

Apply a partial patch to an instance. Returns `null` if the id is not present.

## Built-in events

### `Model.created`

```ts
Model.created: Event<Instance>
```

Fires after a successful `create`. The payload is the full instance object — safe to subscribe to.

### `Model.deleted`

```ts
Model.deleted: Event<ID>
```

Fires after a successful `delete`. The payload is the deleted id.

### `Model.cleared`

```ts
Model.cleared: Event<void>
```

Fires after `clear` completes.

### `Model.updated`

```ts
Model.updated: Event<{ id: ID; field: string; value: unknown }>
```

Fires after any field mutation. **Lazy**: first read wires every cached instance retroactively. Use sparingly — subscribing drives the event end to end across all future updates.

## Lifecycle methods

### `Model.reorder`

```ts
Model.reorder(ids: ID[]): void
```

Replace `$ids` with a permutation of the current ids. Does **not** delete; throws if the input adds or removes any id.

```ts
todoModel.reorder([3, 1, 2])
```

### `Model.create`

```ts
create(data: CreateData): Instance
create(data: CreateData, options: { scope: Scope }): Promise<Instance>
```

Without a scope this is fully synchronous — mutations to `$dataMap`, `$ids`, indexes, and refs happen before the returned instance is observed. With `{ scope }` it is asynchronous: the scoped `allSettled` chain drives every dependent update, and the promise resolves once they have all completed.

```ts
const todo = todoModel.create({ id: 1, title: "Ship" })
const scoped = await todoModel.create({ id: 2, title: "Fork" }, { scope })
```

### `Model.createMany`

```ts
createMany(rows: CreateData[]): Instance[]
createMany(rows: CreateData[], options: { scope: Scope }): Promise<Instance[]>
```

Batch variant. Same sync/Promise split. Internally skips per-row `$ids` updates and uses a single batched `$dataMap.on(_dataMapSetMany)` reducer.

### `Model.update`

```ts
update(id: ID, data: Partial<Fields>): Instance | null
update(id: ID, data: Partial<Fields>, options: { scope: Scope }): Promise<Instance | null>
```

Sync-without-scope, Promise-with-scope. Returns `null` when the id is not present.

### `Model.delete`

```ts
delete(id: ID): void
delete(id: ID, scope: Scope): Promise<void>
```

Applies cascade/nullify/restrict policies on all refs pointing to this instance. With a scope, all cascades run through `allSettled` on the supplied scope.

### `Model.clear`

```ts
clear(): void
clear(scope: Scope): Promise<void>
```

Remove every instance. Without a scope, wipes global state. With a scope, reverts scope-local `$ids` and re-seeds `$dataMap` from current global values — **not** the same as a global clear.

## Access methods

### `Model.getSync`

```ts
getSync(id: ID): Instance | undefined
getSync(id: ID, scope: Scope): Instance | undefined
```

O(1) cache lookup without scope. With scope, reads the scoped `$dataMap` snapshot; if the global cache is empty but the scope has data (e.g. two-process SSR), the instance is reconstructed on demand.

### `Model.getByKeySync`

```ts
getByKeySync(...parts: (string | number)[]): Instance | undefined
getByKeySync(...parts: (string | number)[], scope: Scope): Instance | undefined
```

Compound-PK variant. Accepts the key parts in contract order. The final argument may be a `Scope` — detected by the presence of a `getState` method.

### `Model.get`

```ts
get(id: ID): Instance | null
get(...compoundKey: (string | number)[]): Instance | null
```

Synchronous lookup. Returns the stable Instance proxy or `null` when the id is absent. An O(1) global-cache hit; falls back to lazy proxy reconstruction when `$dataMap` has the data but the cache is empty (typical after `fork({ values })` hydration). The reconstructed proxy is scope-independent — its `$field` stores stay scope-aware because they read from `$dataMap`.

For a reactive "does this id exist?" subscription use `Model.$idSet`:

```ts
const $selected = combine(
  model.$idSet,
  $selectedId,
  (idSet, id) => (id != null && idSet.has(id) ? model.get(id) : null),
)
```

For scoped imperative reads use `Model.getSync(id, scope)` / `Model.getByKeySync(...parts, scope)`.

### `Model.query`

```ts
query(): CollectionQuery<Contract, Generics, Ext, Instance>
```

Start a new reactive query. Every subsequent `.where`/`.orderBy`/`.limit` call returns a new `CollectionQuery` memoised by descriptor, so structurally identical chains share the same nodes. See [`CollectionQuery`](./collection-query.md).

## Metadata

### `Model.name`

```ts
Model.name: string
```

Read-only. Matches the `name` passed to `createModel` (or `"unnamed"`). Used inside SIDs.

### Ref targets — the `refs` option

Ref and inverse targets are wired at construction time through the `refs` option on `createModel`. Each value is a thunk so bidirectional and circular references can forward-declare each other safely:

```ts
const userModel = createModel({
  contract: userContract,
  refs: { posts: () => postModel, comments: () => commentModel },
})

const postModel = createModel({
  contract: postContract,
  refs: { author: () => userModel },
})
```

Self-refs don't require an entry — a ref that targets its own model falls back to `this` automatically. Missing/unbound targets raise a `TentaclesError` on first resolution with the exact field name to fix.

### `Model.getRefMeta`

```ts
Model.getRefMeta(field: string):
  | { cardinality: "one" | "many"; target: Model<any, any> }
  | undefined
```

Returns the ref descriptor for a field, or `undefined` if the field does not exist or is not a ref. Useful for tools that need to reflect on a model's relationships.

```ts
const meta = postModel.getRefMeta("author")
// { cardinality: "one", target: userModel }
```

## Sync vs Promise return

Every mutation method has two signatures: one that returns synchronously and one that accepts `{ scope }` and returns a `Promise`.

| Call | Return |
|---|---|
| `Model.create(data)` | `Instance` |
| `Model.create(data, { scope })` | `Promise<Instance>` |
| `Model.update(id, patch)` | `Instance \| null` |
| `Model.update(id, patch, { scope })` | `Promise<Instance \| null>` |
| `Model.delete(id)` | `void` |
| `Model.delete(id, scope)` | `Promise<void>` |
| `Model.clear()` | `void` |
| `Model.clear(scope)` | `Promise<void>` |

For SSR, always use the scope-bearing form inside `allSettled`-driven pipelines. Mixing sync calls with a scope leaks global mutations into every fork.

## See also

- [`createModel`](./create-model.md) — factory function.
- [`ModelInstance`](./model-instance.md) — returned instance surface.
- [`Ref APIs`](./ref-api.md) — field types for `author`, `tags`, etc.
- [`CollectionQuery`](./collection-query.md) — output of `Model.query()`.
