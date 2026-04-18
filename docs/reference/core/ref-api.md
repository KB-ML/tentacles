# Ref APIs

Refs turn a field name on one model into a reactive link to another. `.ref("author", "one")` gives each instance a `RefOneApi<UserInstance>`; `.ref("tags", "many")` gives each instance a `RefManyApi<TagInstance>`. Both APIs are stores + events backed by the source model's `$dataMap`, so reads, writes, and deletion cascades flow through the reactive graph without manual wiring. This page covers the full surface of both APIs plus the semantics of inline creation and deletion policies.

## RefManyApi

Produced by `.ref(name, "many")`. Every instance exposes one `RefManyApi` per many-ref field.

```ts
interface RefManyApi<T> {
  $ids:      Store<ID[]>
  $resolved: Store<T[]>
  add(idOrData: ID | CreateInput<T>): void
  remove(id: ID): void
  clear(): void
}
```

### `$ids`

```ts
$ids: Store<ID[]>
```

Reactive list of target ids currently linked through this ref. Stored inside the source instance's `$dataMap` entry as a single array, so SSR serialization works automatically.

```ts
user.tags.$ids       // Store<string[]>
user.tags.$ids.getState() // ["1", "2"]
```

### `$resolved`

```ts
$resolved: Store<T[]>
```

Lazy-materialised store that maps each id to the full target instance via the target model's cache. Subscribing to `$resolved` reactively re-resolves on every structural change (ids added/removed) and on every target field mutation.

```ts
user.tags.$resolved // Store<TagInstance[]>
```

Access this only when you actually render the resolved objects — the resolver runs over the full id array on every update. For read-only "does this ref contain x?" checks, prefer `$ids`.

### `add`

```ts
add(id: ID): void
add(data: CreateInput<T>): void
```

Append an id. Duplicates are ignored — the underlying reducer deduplicates. Passing a **data object** instead of an id triggers inline creation of the referenced instance before linking:

```ts
user.tags.add("tag-1")                   // link existing
user.tags.add({ id: "tag-2", name: "Urgent" }) // create-then-link
```

Inline creation walks through the target model's `Model.create`, so defaults, unique constraints, and ref cascades all apply. If a record with the same PK already exists, the `connect` path is used — no duplicate is created.

### `remove`

```ts
remove(id: ID): void
```

Unlink an id. Does **not** delete the referenced instance — it only removes the id from this ref's list. To delete the target, call `TargetModel.delete(id)`.

### `clear`

```ts
clear(): void
```

Remove all ids from this ref. Same no-delete semantics as `remove`.

## RefOneApi

Produced by `.ref(name, "one")`. Every instance exposes one `RefOneApi` per one-ref field.

```ts
interface RefOneApi<T> {
  $id:       Store<ID | null>
  $resolved: Store<T | null>
  set(idOrData: ID | CreateInput<T>): void
  clear(): void
}
```

### `$id`

```ts
$id: Store<ID | null>
```

Reactive id of the linked target, or `null` when unlinked. Backed by `$dataMap`.

```ts
post.author.$id        // Store<string | null>
```

### `$resolved`

```ts
$resolved: Store<T | null>
```

Lazy-materialised. Resolves `$id` through the target model's cache. Emits `null` when the id is `null` or when the target has been deleted.

```ts
post.author.$resolved  // Store<UserInstance | null>
```

### `set`

```ts
set(id: ID): void
set(data: CreateInput<T>): void
```

Assign a target. Passing a data object triggers inline creation — identical semantics to `RefManyApi.add`.

```ts
post.author.set("u-1")
post.author.set({ id: "u-2", name: "Bea" }) // create-then-link
```

### `clear`

```ts
clear(): void
```

Set `$id` back to `null`. Does not delete the target.

## Inline creation (`connect` / `create` / `connectOrCreate`)

Any `add` / `set` call that receives a data object instead of a raw id dispatches to the target model's resolution pipeline:

| Input | Path |
|---|---|
| `add("id-1")` | `connect` — just link the existing id |
| `add({ id: "id-1", ... })` with that id already in cache | `connect` — ignore new data |
| `add({ id: "id-2", ... })` with that id missing | `create` — run through `Model.create` |
| `add({ id: "id-1", ... })` with `connectOrCreate` option at contract level | `connectOrCreate` — upsert |

The exact variant is determined by the contract's `onConflict` setting (default `connect`). See the `.ref()` builder reference for configuring the policy.

## Deletion policies

When the **target** of a ref is deleted, Tentacles applies the ref's `onDelete` policy to every source pointing at it. Policies are declared on the ref descriptor — `.ref("author", "one", { onDelete: "cascade" })`. Valid values:

| Policy | Behaviour |
|---|---|
| `"nullify"` *(default)* | Set `$id` to `null` (one) or `remove(id)` from `$ids` (many). |
| `"cascade"` | Delete the source instance as well. |
| `"restrict"` | Throw `TentaclesError` — prevent the target from being deleted. |

Cascade runs through the source model's `deleteFx`, so onDelete policies chain through multiple models (e.g. deleting a User cascades to Posts and then to Comments).

```ts
// Contract: post.ref("author", "one", { onDelete: "cascade" })
userModel.delete("u-1")
// → every post with author = "u-1" is also deleted
// → every comment on those posts cascades further
```

Restricted deletes surface the error from `delete` synchronously (or as a rejected promise under a scope):

```ts
try {
  userModel.delete("u-1")
} catch (e) {
  // TentaclesError: "Cannot delete userModel:u-1 — 3 Posts reference it (restrict)"
}
```

## Scope handling

Both ref APIs honour `Model.create(data, { scope })`, `Model.delete(id, scope)`, etc. Every internal event is scope-aware through `allSettled`, so cascades, nullifies, and inline creates run in the scope you pass without leaking into global state.

```ts
await postModel.create({ id: "p1", author: { id: "u1", name: "Alex" } }, { scope })
// user u1 was created in `scope` only
```

## Inverses

The reverse of a ref is an inverse, declared on the **target** side:

```ts
userContract.inverse("posts", "author")
```

`user.$posts` is a `Store<PostInstance[]>` derived from the shared `InverseIndex` — no per-instance storage. Refs and inverses stay in sync automatically: `post.author.set(user.id)` adds `post` to `user.$posts`.

Inverses are **read-only**. To link a post to a user, mutate the post's ref, not the user's inverse.

## See also

- [`createContract` — refs](./create-contract.md#refs) — ref declaration syntax.
- [`Model.bind`](./model.md#bind) — late-binding circular refs.
- [`Model.delete`](./model.md#delete) — where cascade / nullify / restrict execute.
