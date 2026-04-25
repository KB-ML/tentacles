# Ref APIs

Refs turn a field name on one model into a reactive link to another. `.ref("author", "one")` gives each instance a `RefOneApi<UserInstance>`; `.ref("tags", "many")` gives each instance a `RefManyApi<TagInstance>`. Both APIs are stores + events backed by the source model's `$dataMap`, so reads, writes, and deletion cascades flow through the reactive graph without manual wiring. This page covers the full surface of both APIs plus the semantics of inline creation and deletion policies.

## RefManyApi

Produced by `.ref(name, "many")`. Every instance exposes one `RefManyApi` per many-ref field.

```ts
interface RefManyApi {
  $ids:   Store<ID[]>
  add(idOrData: ID | CreateInput<T>): void
  remove(id: ID): void
  clear(): void
}
```

Resolve ids to full target instances yourself via `targetModel.get(id)` — one `.map()` per caller keeps the graph lean.

### `$ids`

```ts
$ids: Store<ID[]>
```

Reactive list of target ids currently linked through this ref. Stored inside the source instance's `$dataMap` entry as a single array, so SSR serialization works automatically.

```ts
user.tags.$ids       // Store<string[]>
user.tags.$ids.getState() // ["1", "2"]
```

### Resolving ids

There is no `$resolved` helper — callers resolve ids through `targetModel.get(id)` themselves:

```ts
const $resolved = user.tags.$ids.map((ids) =>
  ids
    .map((id) => tagModel.get(id))
    .filter((tag): tag is NonNullable<typeof tag> => tag != null),
)
```

Resolve only where you actually render the instances; for "does this ref contain x?" checks, stick with `$ids`.

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
interface RefOneApi {
  $id:    Store<ID | null>
  set(idOrData: ID | CreateInput<T>): void
  clear(): void
}
```

Resolve `$id` to the full target via `targetModel.get(id)` when you need the instance.

### `$id`

```ts
$id: Store<ID | null>
```

Reactive id of the linked target, or `null` when unlinked. Backed by `$dataMap`.

```ts
post.author.$id        // Store<string | null>
```

### Resolving the id

No built-in `$resolved`. When you need the linked instance, derive it yourself:

```ts
const $resolved = post.author.$id.map((id) =>
  id != null ? (userModel.get(id) ?? null) : null,
)
```

Emits `null` when `$id` is `null` or when the target has been deleted (nullify cascades clear `$id` automatically).

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

`onDelete` fires in one of two directions depending on cardinality:

| Cardinality | Fires when &nbsp; | Applied to |
|---|---|---|
| `.ref(name, "one", { fk, onDelete })` | the **target** is deleted | the owner (the FK-holder) — SQL semantics |
| `.ref(name, "many", { onDelete })` | the **owner** is deleted | every target id in the array |

Policies are declared on the ref descriptor — e.g. `.ref("author", "one", { fk: "authorId", onDelete: "cascade" })`. Valid values:

| Policy | `one` (fires on target delete) | `many` (fires on owner delete) |
|---|---|---|
| `"nullify"` *(default)* | Null the ref field and paired FK column on every source. Source instance survives. | Owner is deleted; targets untouched; any paired back-FK on targets is nulled. |
| `"cascade"` | Delete every source pointing at the deleted target. | Delete every target id currently in the array. |
| `"restrict"` | Throw `TentaclesError` on the target delete if any source still references it. | Throw `TentaclesError` on the owner delete if the array is non-empty. |

Cascade runs transitively — a deleted instance can itself trigger more cascades through either direction.

```ts
// SQL direction (one): delete a user → every post with authorId = u-1 cascade-deletes.
// post.ref("author", "one", { fk: "authorId", onDelete: "cascade" })
userModel.delete("u-1")

// Owner direction (many): delete a post → every id in post.comments cascade-deletes.
// post.ref("comments", "many", { onDelete: "cascade" })
postModel.delete("p-1")
```

Restricted deletes surface the error from `delete` synchronously (or as a rejected promise under a scope):

```ts
try {
  // one-ref restrict: throws because posts still reference u-1.
  userModel.delete("u-1")
} catch (e) {
  // TentaclesError: restrict policy …
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

`user.$posts` is a `Store<ModelInstanceId[]>` derived from the shared `InverseIndex` — no per-instance storage. Resolve ids to instances with `postModel.get(id)`. Refs and inverses stay in sync automatically: `post.author.set(user.id)` adds the post's id to `user.$posts`.

Inverses are **read-only**. To link a post to a user, mutate the post's ref, not the user's inverse.

## See also

- [`createContract` — refs](./create-contract.md#refs) — ref declaration syntax.
- [`createModel` — `refs` option](./create-model.md) — wiring ref / inverse targets.
- [`Model.delete`](./model.md#delete) — where cascade / nullify / restrict execute.
