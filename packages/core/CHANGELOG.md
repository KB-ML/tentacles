# @kbml-tentacles/core

## 2.0.1

### Patch Changes

- [`637a457`](https://github.com/KB-ML/tentacles/commit/637a457c9f84940dfb592a8651aa8a12166a3882) Thanks [@NLumpov](https://github.com/NLumpov)! - Replace the placeholder package READMEs with proper, package-specific
  documentation. Every package now ships with:

  - a one-line summary of what it provides,
  - a copy-pasteable install command including peer dependencies,
  - a quick-start example using the **current** API (the previous READMEs
    were stubs in Russian referencing an old `createContract((builder) => ...)`
    signature that no longer exists),
  - a short API rundown of the public exports,
  - cross-links to the relevant tutorial / how-to / reference pages in the
    monorepo's `docs/` site.

  No code changes — this is purely the package-page content npm and the
  GitHub package directory listings render. Bumped as patch so the next
  publish refreshes the npm landing page for each package.

## 2.0.0

### Major Changes

- [`b724dac`](https://github.com/KB-ML/tentacles/commit/b724dace85288e8562d2e28300106b18d9ff911a) Thanks [@NLumpov](https://github.com/NLumpov)! - Move one-to-many cascade semantics from `inverse()` (owner-direction)
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

  | Action                                                                        | Before                                 | After                                                                                                            |
  | ----------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | Delete the owner of a `one` ref with `onDelete: "cascade"`                    | Target was also deleted                | **No-op for the target** — owner just goes; target survives because the cascade is on the FK, not the ref holder |
  | Delete the target a `one` ref points at, with `onDelete: "cascade"`           | No automatic owner deletion            | **Owner is cascade-deleted** (SQL `ON DELETE CASCADE`)                                                           |
  | Delete the target a `one` ref points at, with `onDelete: "restrict"`          | Was a no-op (deleting the owner threw) | **Throws** — target cannot be deleted while a source still references it                                         |
  | Delete the target a `one` ref points at, with `onDelete: "nullify"` (default) | N/A                                    | Source's `$ref.$id` is cleared **and** the paired FK column (when `fk` is set) is reset to `null`                |

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
  the way it does in a database schema — _what happens to me when the row I
  point at is deleted_.

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

- [`cd4a500`](https://github.com/KB-ML/tentacles/commit/cd4a50047cb473b085393073f61ec613d14c3e69) Thanks [@NLumpov](https://github.com/NLumpov)! - Replace `model.bind({ ... })` with a `refs` option on `createModel`, and
  stop resolving ref / inverse ids into instances at the library boundary.

  Three related breaking changes ship together because they share a single
  design rationale: **contracts are pure schema**, and **cross-model links
  are ids, not instances**.

  ***

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

  ***

  ## 2. Inverse fields now expose ids, not resolved instances

  Previously `$logs` (declared via `.inverse("logs", "workflow")`) was
  typed `Store<any[]>` and held resolved source instances at runtime. It
  is now `Store<ModelInstanceId[]>` containing just the source ids.
  Resolve manually when needed:

  ```ts
  // Before
  const logs = workflow.$logs.getState(); // any[]
  logs[0].$message.getState();

  // After
  const ids = workflow.$logs.getState(); // ModelInstanceId[]
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

  ***

  ## 3. `$resolved` removed from `RefOneApi` and `RefManyApi`

  For symmetry with inverses, both `RefManyApi` and `RefOneApi` drop the
  `$resolved` store. Callers resolve ids to instances themselves:

  ```ts
  // Before
  const tags = user.tags.$resolved.getState(); // Store<TagInstance[]>
  const avatar = user.avatar.$resolved.getState(); // Store<TagInstance | null>

  // After — resolve ids on demand
  const $tags = user.tags.$ids.map((ids) =>
    ids
      .map((id) => tagModel.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null)
  );
  const $avatar = user.avatar.$id.map((id) =>
    id != null ? avatarModel.get(id) ?? null : null
  );
  ```

  `RefManyApi` is now `{ $ids, add, remove }`. `RefOneApi` is now
  `{ $id, set, clear }`.

  **Why.** Ref APIs describe _links_ (ids), not materialised instances.
  Skipping `$resolved` keeps the effector graph lean by default — you
  only pay for a mapper when you subscribe to one. This also mirrors the
  inverse change so the whole cross-model surface is uniform: ids in, ids
  out, resolution at the callsite.

  ***

  ## Summary of removed APIs

  - `model.bind(...)` — use `refs` on `createModel`
  - `RefManyApi.$resolved` — resolve ids via `targetModel.get(id)`
  - `RefOneApi.$resolved` — resolve id via `targetModel.get(id)`
  - Inverse fields no longer expose resolved instances — only ids

- [`cd4a500`](https://github.com/KB-ML/tentacles/commit/cd4a50047cb473b085393073f61ec613d14c3e69) Thanks [@NLumpov](https://github.com/NLumpov)! - Consolidate synchronous instance access into a single `model.get(...)`.

  **Why.** The previous surface leaked four near-duplicate methods —
  `get`, `getSync`, `getByKeySync`, `instances` — with mismatched return
  types (`null` vs `undefined`) and scope handling spread across
  variadic overloads. All four are synchronous; the only real axis of
  variation is "do I have a `Scope`?". One method covers both cases.

  ### Removed

  | Removed                                                                       | Replacement                                         |
  | ----------------------------------------------------------------------------- | --------------------------------------------------- |
  | `model.instance(id)` / `model.instance(...parts)` (`Store<Instance \| null>`) | `model.get(id)` / `model.get([...parts])` — sync    |
  | `model.$instances` (`Store<Instance[]>`)                                      | `model.$ids.getState().map((id) => model.get(id)!)` |
  | `model.byPartialKey(...parts)` (`Store<Instance[]>`)                          | filter `model.$pkeys` manually                      |
  | `model.getSync(id, scope?)`                                                   | `model.get(id, scope?)`                             |
  | `model.getByKeySync(...parts, scope?)`                                        | `model.get([...parts], scope?)`                     |
  | `model.instances()`                                                           | `model.$ids.getState().map((id) => model.get(id)!)` |
  | `QueryContext.$instances` (internal)                                          | query context exposes `$ids` + `$dataMap`           |

  ### Added

  - **`model.get(id, scope?): Instance | null`** — scalar lookup. Without
    a scope, O(1) global-cache hit; with a scope, reads through
    `scope.getState($dataMap)` and lazily reconstructs the proxy when the
    global cache is empty (the `fork({ values })` hydration case).
  - **`model.get([...parts], scope?): Instance | null`** — compound-key
    lookup as an array. Dispatch is unambiguous because ids are always
    `string | number`, never arrays.

  The proxy itself is scope-independent — its `$field` stores read from
  the (scope-aware) `$dataMap`, so one proxy serves all scopes.

  ### Migration

  ```ts
  // Before
  const inst = model.getSync("t1");
  const scoped = model.getSync("t1", clientScope);
  const row = model.getByKeySync("acme", "u1");
  const scopedRow = model.getByKeySync("acme", "u1", clientScope);
  const all = model.instances();

  // After
  const inst = model.get("t1");
  const scoped = model.get("t1", clientScope);
  const row = model.get(["acme", "u1"]);
  const scopedRow = model.get(["acme", "u1"], clientScope);
  const all = model.$ids.getState().map((id) => model.get(id)!);
  ```

  Return type is `Instance | null` everywhere — previous `getSync` /
  `getByKeySync` returned `undefined`; callers with `.toBeUndefined()`
  assertions should switch to `.toBeNull()`.

  ### Framework bindings

  `@kbml-tentacles/{react,vue,solid}` were rewired internally to the new
  signature. Public hooks (`useModel`, `<Each>`) are unchanged.
  `ModelLike` in each adapter now exposes only `get(id | [parts], scope?)`.

### Patch Changes

- [`b724dac`](https://github.com/KB-ML/tentacles/commit/b724dace85288e8562d2e28300106b18d9ff911a) Thanks [@NLumpov](https://github.com/NLumpov)! - Fix `autoincrement()` colliding with server-seeded ids on the client
  under SSR.

  `createFx` / `createManyFx` now read the autoincrement counter store via
  `attach({ source })` so effector hands the **scope-current** snapshot to
  the handler. Previously the handler closed over the default-store
  counter (which always starts at `0` on the client), so the first
  client-side `model.create(...)` after hydration would issue id `1` —
  already taken by a server-seeded row — and the new instance would
  overwrite the existing one in `$dataMap`.

  With the fix, the client scope sees the hydrated counter (e.g. `5` if
  the server seeded ids `1..5`) and the next id allocated client-side is
  `6`. No API change; existing SSR apps just stop producing ghost rows
  after the first post-hydration `create`.

- [`b724dac`](https://github.com/KB-ML/tentacles/commit/b724dace85288e8562d2e28300106b18d9ff911a) Thanks [@NLumpov](https://github.com/NLumpov)! - Anchor query-derived stores in the **model's** region instead of
  inheriting whatever region was active on first access. Cached
  `CollectionQuery` instances no longer get torn down when an unrelated
  `<View>` (whose region happened to be active when the query first
  materialised) unmounts.

  `QueryContext` gains a `region: Node` field that lazy `$filtered` /
  `$sorted` / `$list` / `$count` / `QueryField` builders wrap with
  `withRegion(...)`. Functionally this matches what `model.$ids` /
  `$dataMap` already do — query outputs share the lifetime of the model
  they query, not the lifetime of the first subscriber.

  No public API change; this is purely a fix for a teardown bug that
  showed up when a query was created inside a view-model `fn` and then
  read from a different view's render scope.
