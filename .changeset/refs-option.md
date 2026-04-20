---
"@kbml-tentacles/core": major
---

Replace `model.bind({ ... })` with a `refs` option on `createModel`, and
stop resolving ref / inverse ids into instances at the library boundary.

Three related breaking changes ship together because they share a single
design rationale: **contracts are pure schema**, and **cross-model links
are ids, not instances**.

---

## 1. `.bind()` removed — pass `refs` to `createModel`

The post-hoc `.bind()` method is gone. Ref and inverse targets are now
configured at construction time via the `refs` option on `createModel`:

```ts
// Before
const todoModel = createModel({ contract: todoContract });
const categoryModel = createModel({ contract: categoryContract });
todoModel.bind({ category: categoryModel });
categoryModel.bind({ todos: todoModel });

// After
const todoModel = createModel({
  contract: todoContract,
  refs: { category: () => categoryModel },
});
const categoryModel = createModel({
  contract: categoryContract,
  refs: { todos: () => todoModel },
});
```

`refs` values are **thunks** (`() => Model`) so bidirectional
relationships work via lazy forward references — `A.refs.b = () => B`
reads `B` on first resolution, not at construction. Self-refs don't
require an entry. Missing or unbound targets throw clear runtime errors
on first resolution.

**Why.** `.bind()` was post-construction mutation that made it possible
to use a model before its relations were wired up — surfacing as `undefined`
targets deep inside `sample()` handlers. `refs` moves the wiring to the
constructor so a model is either fully configured or it fails to build.
It also keeps contracts pure schema: no model references leak into the
builder, which is what makes `pick`/`omit`/`merge`/`partial` work
uniformly across model, view, props, and form chains.

Queries, cascading deletes, and SSR isolation are unchanged.

---

## 2. Inverse fields now expose ids, not resolved instances

Previously `$logs` (declared via `.inverse("logs", "workflow")`) was
typed `Store<any[]>` and held resolved source instances at runtime. It
is now `Store<ModelInstanceId[]>` containing just the source ids.
Resolve manually when needed:

```ts
// Before
const logs = workflow.$logs.getState();       // any[]
logs[0].$message.getState();

// After
const ids = workflow.$logs.getState();        // ModelInstanceId[]
const log = logModel.get(ids[0]);
log?.$message.getState();
```

**Why.** The `Store<any[]>` typing was a symptom of a cross-model
inference cycle: refining `$logs` to `Store<LogInstance[]>` required
threading `typeof logModel` into `workflowModel`'s type, and vice-versa,
which TypeScript cannot resolve. Exposing ids avoids the cycle entirely
and gives proper `Store<ModelInstanceId[]>` typing. The runtime change
also drops a perpetual `.map()` node per inverse field that most
consumers never subscribed to.

---

## 3. `$resolved` removed from `RefOneApi` and `RefManyApi`

For symmetry with inverses, both `RefManyApi` and `RefOneApi` drop the
`$resolved` store. Callers resolve ids to instances themselves:

```ts
// Before
const tags = user.tags.$resolved.getState();    // Store<TagInstance[]>
const avatar = user.avatar.$resolved.getState(); // Store<TagInstance | null>

// After — resolve ids on demand
const $tags = user.tags.$ids.map((ids) =>
  ids
    .map((id) => tagModel.get(id))
    .filter((t): t is NonNullable<typeof t> => t != null),
);
const $avatar = user.avatar.$id.map((id) =>
  id != null ? (avatarModel.get(id) ?? null) : null,
);
```

`RefManyApi` is now `{ $ids, add, remove }`. `RefOneApi` is now
`{ $id, set, clear }`.

**Why.** Ref APIs describe *links* (ids), not materialised instances.
Skipping `$resolved` keeps the effector graph lean by default — you
only pay for a mapper when you subscribe to one. This also mirrors the
inverse change so the whole cross-model surface is uniform: ids in, ids
out, resolution at the callsite.

---

## Summary of removed APIs

- `model.bind(...)` — use `refs` on `createModel`
- `RefManyApi.$resolved` — resolve ids via `targetModel.get(id)`
- `RefOneApi.$resolved` — resolve id via `targetModel.get(id)`
- Inverse fields no longer expose resolved instances — only ids
