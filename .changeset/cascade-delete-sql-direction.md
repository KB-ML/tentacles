---
"@kbml-tentacles/core": major
---

Move one-to-many cascade semantics from `inverse()` (owner-direction)
to a SQL-style `onDelete` on the `ref(..., "one", { onDelete })`
(target-direction). Cascade and restrict now fire when the **referenced**
row is deleted, not when the **referencing** row is deleted.

```ts
// Tree node child holds the FK pointing at its parent
const treeContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("parentId", (s) => s<number | null>().default(null))
  .ref("parent", "one", { fk: "parentId", onDelete: "cascade" })
  .inverse("children", "parent")
  .pk("id");

// Deleting the parent now cascades through the FK to children:
treeModel.delete(parentId); // children with parentId === parentId are deleted too
```

### Behaviour change

| Action | Before | After |
|---|---|---|
| Delete the owner of a `one` ref with `onDelete: "cascade"` | Target was also deleted | **No-op for the target** — owner just goes; target survives because the cascade is on the FK, not the ref holder |
| Delete the target a `one` ref points at, with `onDelete: "cascade"` | No automatic owner deletion | **Owner is cascade-deleted** (SQL `ON DELETE CASCADE`) |
| Delete the target a `one` ref points at, with `onDelete: "restrict"` | Was a no-op (deleting the owner threw) | **Throws** — target cannot be deleted while a source still references it |
| Delete the target a `one` ref points at, with `onDelete: "nullify"` (default) | N/A | Source's `$ref.$id` is cleared **and** the paired FK column (when `fk` is set) is reset to `null` |

`many`-ref cascade is unchanged: deleting the owner of a `many` ref still
applies the policy to every id in the array. Self-refs (e.g. tree
parent/child) follow the same SQL direction — deleting a parent walks
down the tree.

### Why

The previous direction inverted the SQL convention: cascade fired when
the row holding the FK was deleted, which forced authors to think
"deleting the parent removes the child" but write the policy on the
child's view of the parent. It also made restrict useless for the actual
SQL use case ("don't let me delete a category while products still point
at it"). Aligning with SQL fixes both: `onDelete` on a `one` ref now reads
the way it does in a database schema — *what happens to me when the row I
point at is deleted*.

The companion fix: `nullify` now also resets the paired `fk` store
(declared via `ref("...", "one", { fk: "parentId" })`) so queries like
`where("parentId", eq(null))` no longer see stale ids after the target
is deleted.

### Migration

If you used `onDelete: "cascade"` on a `one` ref expecting "delete the
owner removes the target", invert your model:

```ts
// Before — cascade on the owner side (no longer how it works)
const todoContract = createContract()
  .store("id", (s) => s<string>())
  .ref("category", "one", { onDelete: "cascade" }) // expected: delete todo deletes category
  .pk("id");

// After — express it on the side that should be cascade-deleted
const categoryContract = createContract()
  .store("id", (s) => s<string>())
  .inverse("todos", "category")
  .pk("id");

const todoContract = createContract()
  .store("id", (s) => s<string>())
  .store("categoryId", (s) => s<string | null>().default(null))
  .ref("category", "one", { fk: "categoryId", onDelete: "cascade" })
  .pk("id");

// categoryModel.delete(catId) → cascades to every todo whose categoryId === catId
```

If you previously relied on `onDelete: "restrict"` on a `one` ref to block
deletion of the **owner**, that is no longer the right tool — restrict
now blocks deletion of the **target** while sources still reference it.
For owner-side delete blocking, validate manually before calling
`model.delete(...)`.
