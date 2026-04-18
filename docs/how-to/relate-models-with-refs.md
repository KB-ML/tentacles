# Relate models with refs

Relationships between models are declared with `.ref(name, cardinality, options?)` and `.inverse(name, refField)` on a contract chain. At runtime each ref becomes a per-instance API with reactive stores and event callables.

| Declaration | Cardinality | Per-instance API |
|---|---|---|
| `.ref(name, "one")` | Zero or one target | `{ $id, $resolved, set, clear }` |
| `.ref(name, "many")` | Zero or more targets | `{ $ids, $resolved, add, remove }` |
| `.inverse(name, refField)` | Reactive reverse lookup | `Store<Instance[]>` (or single instance) |

Refs are resolved at model bind time — the referenced model does not need to exist yet when the contract is declared. Call `.bind({ refName: () => TargetModel })` on the source model to wire the relationship.

## One-to-one

Use `.ref(name, "one", options?)` for a zero-or-one relationship. The per-instance API exposes `$id`, `$resolved`, `set`, and `clear`:

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
const userModel   = createModel({ contract: userContract }).bind({ avatar: () => avatarModel })
```

Each `userModel` instance gets an `avatar` field that is a `RefOneApi`:

```ts
const user = userModel.create({ id: 1, name: "Alice" })

user.avatar.$id         // Store<ID | null> — current target id
user.avatar.$resolved   // Store<Instance | null> — the resolved instance, or null
user.avatar.set(42)     // link to avatar with id=42
user.avatar.clear()     // unlink
```

`set` accepts a target id. To also create the target in one step, pass the ref data to `Model.create`:

```ts
userModel.create({
  id: 2,
  name: "Bob",
  avatar: { create: { id: 99, src: "/bob.png" } },
})
```

`$resolved` stays `null` until the target id resolves to an actual instance. If the target is deleted, `$resolved` falls to `null` on the next scope update.

## One-to-many

Use `.ref(name, "many")` for zero-or-more targets. The per-instance API exposes `$ids`, `$resolved`, `add`, and `remove`:

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
const userModel = createModel({ contract: userContract }).bind({ posts: () => postModel })

const user = userModel.create({ id: 1, name: "Alice" })

user.posts.$ids        // Store<ID[]>
user.posts.$resolved   // Store<Instance[]> — reactive instances
user.posts.add("p1")   // link to post "p1"
user.posts.add("p2")
user.posts.remove("p1")
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
const userModel = createModel({ contract: userContract })
  .bind({ posts: () => postModel })
```

On a `userModel` instance, `user.$posts` is a `Store<Instance[]>` reflecting every post whose `author` ref currently points to this user. It updates reactively — setting a `post.author.set(...)` triggers a re-read.

Inverse refs are read-only. To change the relationship, modify the ref on the owning side (`post.author.set(userId)`). The inverse updates automatically.

The inverse lookup is powered by `InverseIndex`, an imperative `Map<targetId, Set<sourceIds>>` maintained per model. Lookup cost is O(1) in the source count regardless of how many total instances exist.

## Cascade options

The `onDelete` option on a `.ref()` controls what happens to the ref when the **target** instance is deleted:

```ts
.ref("author", "one", { onDelete: "cascade" })    // delete this instance too
.ref("author", "one", { onDelete: "nullify" })    // clear the ref, keep this instance
.ref("author", "one", { onDelete: "restrict" })   // throw if target is referenced
```

The default is `"nullify"`.

- `"cascade"` — if the target is deleted, every instance that references it is also deleted. Use for dependent child entities (e.g. `Comment.post` where a comment cannot exist without its post).
- `"nullify"` — the ref is cleared on both sides: `$id` / `$ids` is pruned. The owning instance survives. Use when the relationship is optional.
- `"restrict"` — attempting to delete the target throws a `TentaclesError` while any instance references it. Use to prevent accidental deletions of shared resources.

Cascade runs transitively. Deleting a user with `onDelete: "cascade"` on `posts` and `"cascade"` on `postModel.comments` removes the user, all their posts, and all their comments in one pass.

```ts
const commentContract = createContract()
  .store("id",     (s) => s<string>())
  .store("body",   (s) => s<string>())
  .ref("post",     "one", { onDelete: "cascade" })
  .pk("id")

const postContract = createContract()
  .store("id",    (s) => s<string>())
  .store("title", (s) => s<string>())
  .ref("comments", "many", { onDelete: "cascade" })
  .pk("id")
```

Deleting a post removes all its comments.

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

Bind everything:

```ts
const studentModel   = createModel({ contract: studentContract })
const courseModel    = createModel({ contract: courseContract })
const enrolmentModel = createModel({ contract: enrolmentContract })
  .bind({ student: () => studentModel, course: () => courseModel })
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

A ref whose target is the same model is declared by binding the ref to the model itself:

```ts
const categoryContract = createContract()
  .store("id",       (s) => s<number>())
  .store("name",     (s) => s<string>())
  .ref("parent",     "one",  { onDelete: "nullify" })
  .ref("children",   "many", { onDelete: "cascade" })
  .pk("id")

const categoryModel = createModel({ contract: categoryContract })
categoryModel.bind({ parent: () => categoryModel, children: () => categoryModel })
```

Now each category can point to its parent and list its children. Because `.bind` accepts thunks (`() => categoryModel`), the self-reference does not create a bootstrap problem.

Inverse refs also work on self-referenced models:

```ts
const categoryContract = createContract()
  .store("id",   (s) => s<number>())
  .store("name", (s) => s<string>())
  .ref("parent", "one", { onDelete: "nullify" })
  .inverse("children", "parent")
  .pk("id")
```

`category.$children` now returns every category whose `parent` ref points to this one — no manual bookkeeping required.

For tree-shaped data, combine self-references with cascade policies to match the semantics you want:

- `parent: "nullify"` / `children: "cascade"` → deleting a node removes its subtree, orphans become roots if deleted as roots.
- `parent: "restrict"` → a node cannot be deleted while it has children.
- `parent: "cascade"` — rarely useful; deleting a parent removes the whole subtree, but children can also be deleted independently.

Pick the policy to match the invariants your data requires.
