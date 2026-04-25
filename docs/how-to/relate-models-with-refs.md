# Relate models with refs

Relationships between models are declared with `.ref(name, cardinality, options?)` and `.inverse(name, refField)` on a contract chain. At runtime each ref becomes a per-instance API with reactive stores and event callables.

| Declaration | Cardinality | Per-instance API |
|---|---|---|
| `.ref(name, "one")` | Zero or one target | `{ $id, set, clear }` |
| `.ref(name, "many")` | Zero or more targets | `{ $ids, add, remove }` |
| `.inverse(name, refField)` | Reactive reverse lookup | `Store<ModelInstanceId[]>` |

Refs are resolved at model construction time — the referenced model does not need to exist yet when the contract is declared. Pass `refs: { refName: () => TargetModel }` to `createModel` to wire the relationship. Because each target is a lazy thunk, bidirectional and circular models can forward-reference one another.

## One-to-one

Use `.ref(name, "one", options?)` for a zero-or-one relationship. The per-instance API exposes `$id`, `set`, and `clear`:

```ts
import { createContract, createModel } from "@kbml-tentacles/core"

const avatarContract = createContract()
  .store("id",  (s) => s<number>())
  .store("src", (s) => s<string>())
  .pk("id")

const userContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .ref("avatar", "one")
  .pk("id")

const avatarModel = createModel({ contract: avatarContract })
const userModel   = createModel({
  contract: userContract,
  refs: { avatar: () => avatarModel },
})
```

Each `userModel` instance gets an `avatar` field that is a `RefOneApi`:

```ts
const user = userModel.create({ id: 1, name: "Alice" })

user.avatar.$id         // Store<ID | null> — current target id
user.avatar.set(42)     // link to avatar with id=42
user.avatar.clear()     // unlink

// Resolve to the full target instance when you need it:
const $avatar = user.avatar.$id.map((id) =>
  id != null ? (avatarModel.get(id) ?? null) : null,
)
```

`set` accepts a target id. To also create the target in one step, pass the ref data to `Model.create`:

```ts
userModel.create({
  id: 2,
  name: "Bob",
  avatar: { create: { id: 99, src: "/bob.png" } },
})
```

When the target is deleted, the ref's `$id` is nullified automatically (unless `onDelete: "cascade"` or `"restrict"` is set), so any manual `model.get($id)` resolution falls back to `null` on the next update.

## One-to-many

Use `.ref(name, "many")` for zero-or-more targets. The per-instance API exposes `$ids`, `add`, and `remove`:

```ts
const postContract = createContract()
  .store("id",    (s) => s<string>())
  .store("title", (s) => s<string>())
  .pk("id")

const userContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .ref("posts",  "many")
  .pk("id")

const postModel = createModel({ contract: postContract })
const userModel = createModel({
  contract: userContract,
  refs: { posts: () => postModel },
})

const user = userModel.create({ id: 1, name: "Alice" })

user.posts.$ids        // Store<ID[]>
user.posts.add("p1")   // link to post "p1"
user.posts.add("p2")
user.posts.remove("p1")

// Resolve to full target instances when you need them:
const $posts = user.posts.$ids.map((ids) =>
  ids
    .map((id) => postModel.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null),
)
```

`add` and `remove` both accept a single id. Deduplication is automatic — calling `add("p1")` twice does not add it twice.

To link many posts at once, or to create posts inline, do it through `Model.create` or `Model.update`:

```ts
// Inline create + connect during user creation
userModel.create({
  id: 2,
  name: "Bob",
  posts: [
    "existing-post-id",                   // scalar → connect
    { id: "new-post-id", title: "New" },  // object → connectOrCreate
  ],
})

// Or via explicit operations
userModel.update(2, {
  posts: { add: [{ connect: "p5" }, { create: { id: "p6", title: "Fresh" } }] },
})

userModel.update(2, { posts: { disconnect: ["p1"] } })
userModel.update(2, { posts: { set: ["p2", "p3"] } })  // replace the list entirely
```

## Foreign key option

Pass `{ fk: "fieldName" }` to expose the ref under an additional flat input field. This is useful when the data source is a REST/JSON API that delivers raw id lists:

```ts
createContract()
  .store("id",      (s) => s<string>())
  .store("body",    (s) => s<string>())
  .store("tagIds",  (s) => s<string[]>().default(() => []))
  .ref("tags",      "many", { fk: "tagIds" })
  .pk("id")
```

Now the create payload accepts either the ref API shape or the raw `tagIds` array:

```ts
postModel.create({ id: "p1", body: "hi", tags: ["t1", "t2"] })
postModel.create({ id: "p2", body: "hi", tagIds: ["t3", "t4"] })  // same effect
```

The `fk` option only affects the input shape — the underlying `$ids` store and ref API are identical.

## Inverse refs

An inverse ref has no storage of its own — it is a reactive reverse lookup. Declare it with `.inverse(name, refField)` where `refField` is the name of the ref on the target model that points back:

```ts
const postContract = createContract()
  .store("id",       (s) => s<string>())
  .store("title",    (s) => s<string>())
  .store("authorId", (s) => s<number>())
  .ref("author",     "one", { fk: "authorId" })
  .pk("id")

const userContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .inverse("posts", "author")      // all posts whose `author` ref points to this user
  .pk("id")

const postModel = createModel({ contract: postContract })
const userModel = createModel({
  contract: userContract,
  refs: { posts: () => postModel },
})
```

On a `userModel` instance, `user.$posts` is a `Store<ModelInstanceId[]>` reflecting every post-id whose `author` ref currently points to this user. It updates reactively — setting `post.author.set(...)` triggers a re-read. Resolve ids through the target model when you need the instance:

```ts
user.$posts.watch((ids) => {
  for (const id of ids) {
    const post = postModel.get(id);
    if (post) console.log(post.$title.getState());
  }
});
```

Inverse refs are read-only. To change the relationship, modify the ref on the owning side (`post.author.set(userId)`). The inverse updates automatically.

The inverse lookup is powered by `InverseIndex`, an imperative `Map<targetId, Set<sourceIds>>` maintained per model. Lookup cost is O(1) in the source count regardless of how many total instances exist.

## Cascade options

The `onDelete` option triggers different directions depending on the ref's cardinality. `"one"` refs follow SQL semantics (the policy sits on the FK-holder and fires when the **target** is deleted). `"many"` refs have no SQL analog — the policy sits on the owner and fires when the **owner** is deleted.

| Cardinality | Fires when &nbsp; | Applied to |
|---|---|---|
| `.ref(name, "one", { fk, onDelete })` | the **target** is deleted | the owner (the FK-holder) |
| `.ref(name, "many", { onDelete })`     | the **owner** is deleted  | every target id in the array |

Pick the side that actually owns the FK column. If you want "parent delete → children delete", put the policy on the child's `.ref("parent", "one", { fk, onDelete })`. If you want "container delete → members delete" and members are stored as an id list on the container, put the policy on the container's `.ref("members", "many", { onDelete })`.

The default policy is `"nullify"`.

### `cascade`

Recursively deletes the referring side.

```ts
// SQL direction: delete a post → its comments cascade-delete.
const commentContract = createContract()
  .store("id",       (s) => s<string>())
  .store("body",     (s) => s<string>())
  .store("postId",   (s) => s<string>())
  .ref("post", "one", { fk: "postId", onDelete: "cascade" })
  .pk("id")

// Owner direction: delete a post → every comment listed on post.comments cascade-deletes.
const postContract = createContract()
  .store("id",       (s) => s<string>())
  .store("title",    (s) => s<string>())
  .ref("comments", "many", { onDelete: "cascade" })
  .pk("id")
```

Either shape produces the same end state ("delete post → comments gone"). Pick whichever side holds the FK in your data model.

Cascade runs transitively: a delete can fire cascade on multiple ref declarations at once, and each cascade-deleted instance can itself trigger more cascades.

### `nullify` (default)

Keeps the referring instance alive and clears the link.

- `"one"` — on target deletion, both the ref field and the paired `fk` column on the owner become `null`. Queries like `where("parentId", eq(null))` immediately see orphans as roots.
- `"many"` — on owner deletion, targets are untouched; the owner-side array disappears along with the owner. (The cross-model cleanup still nulls any paired back-FK columns on targets — nothing is left dangling.)

### `restrict`

Refuses the delete (throws `TentaclesError`) while the ref still links anything.

- `"one"` — deleting the **target** throws if any source still points at it. Deleting the owner is always allowed.
- `"many"` — deleting the **owner** throws if the array is non-empty. Deleting individual targets is unaffected.

Use `restrict` to guard shared resources whose accidental removal would corrupt dependent data.

## Inline create

Refs accept either an id (connect) or a target payload (create) when a ref is written through `Model.create` / `Model.update`:

```ts
// One ref — three forms accepted
userModel.create({ id: 1, name: "Alice", avatar: 42 })                                // connect by id
userModel.create({ id: 2, name: "Bob",   avatar: { connect: 42 } })                   // explicit connect
userModel.create({ id: 3, name: "Carol", avatar: { create: { id: 99, src: "/c.png" } } })   // inline create
userModel.create({ id: 4, name: "Dana",  avatar: { connectOrCreate: { id: 42, src: "/fallback.png" } } })  // connect if exists, create otherwise

// Many ref — array of mixed elements
userModel.create({
  id: 5,
  name: "Eve",
  posts: [
    "existing-id",                         // connect by id
    { id: "new-id", title: "Fresh post" }, // connectOrCreate
  ],
})
```

Inline creation happens **atomically** — the target model's `create` effect runs as part of the parent's `create` call. If any step fails (unique violation, restrict onDelete elsewhere), the whole operation throws.

The per-instance `.add()` and `.set()` events on the ref API only accept scalar ids. To create a target inline after the parent exists, call the target model directly and then link:

```ts
const user = userModel.create({ id: 1, name: "Alice" })
const post = postModel.create({ id: "p1", title: "Hello" })
user.posts.add(post.__id)
```

Or use `Model.update` with ref operations:

```ts
userModel.update(1, {
  posts: { add: [{ create: { id: "p2", title: "Inline" } }] },
})
```

## Many-to-many via a junction model

Tentacles does not have a built-in many-to-many primitive. Model it with an explicit junction model:

```ts
const studentContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .pk("id")

const courseContract = createContract()
  .store("id",    (s) => s<number>())
  .store("title", (s) => s<string>())
  .pk("id")

const enrolmentContract = createContract()
  .store("studentId", (s) => s<number>())
  .store("courseId",  (s) => s<number>())
  .store("grade",     (s) => s<number | null>().default(null))
  .ref("student", "one", { fk: "studentId", onDelete: "cascade" })
  .ref("course",  "one", { fk: "courseId",  onDelete: "cascade" })
  .pk("studentId", "courseId")
```

Wire the junction model's refs to both endpoints:

```ts
const studentModel   = createModel({ contract: studentContract })
const courseModel    = createModel({ contract: courseContract })
const enrolmentModel = createModel({
  contract: enrolmentContract,
  refs: {
    student: () => studentModel,
    course: () => courseModel,
  },
})
```

Add inverse refs on the endpoints to query in either direction:

```ts
const studentContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .inverse("enrolments", "student")
  .pk("id")

const courseContract = createContract()
  .store("id",    (s) => s<number>())
  .store("title", (s) => s<string>())
  .inverse("enrolments", "course")
  .pk("id")
```

`student.$enrolments` and `course.$enrolments` are reactive lists of `enrolmentModel` instances. The compound PK `("studentId", "courseId")` prevents duplicate enrolments.

This pattern scales — the junction model is a first-class entity and can hold extra attributes (`grade`, timestamps, audit fields) that pure many-to-many tables cannot express.

## Self-reference

A ref whose target is the same model doesn't need an explicit `refs` entry — the runtime falls back to the model itself when no thunk is registered:

```ts
const categoryContract = createContract()
  .store("id",       (s) => s<number>())
  .store("name",     (s) => s<string>())
  .store("parentId", (s) => s<number | null>().default(null))
  .ref("parent",  "one", { fk: "parentId", onDelete: "cascade" })
  .inverse("children", "parent")
  .pk("id")

const categoryModel = createModel({ contract: categoryContract })
```

Now each category points to its parent via `parentId` and `category.$children` is derived automatically from the inverse. No bootstrap problem: the self-reference is resolved the first time a ref API method is used.

For tree-shaped data, the `.ref("parent", "one", ...)` side drives subtree semantics (SQL direction — policy fires on parent deletion):

- `parent: "cascade"` → deleting a node deletes its whole subtree. This is the common tree-delete behavior.
- `parent: "nullify"` → deleting a node promotes its children to roots (`parentId` becomes `null`). Use when children should survive their parent.
- `parent: "restrict"` → deleting a node with children throws. Use to force explicit subtree cleanup before removal.

If you instead store children as an explicit id list on the parent (`.ref("children", "many")`, no `parentId` store, no inverse), the same three policies apply in owner-direction — delete the parent, `cascade` / `nullify` / `restrict` behave against the array. Pick whichever shape matches your data.
