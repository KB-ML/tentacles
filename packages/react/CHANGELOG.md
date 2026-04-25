# @kbml-tentacles/react

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

- Updated dependencies [[`637a457`](https://github.com/KB-ML/tentacles/commit/637a457c9f84940dfb592a8651aa8a12166a3882)]:
  - @kbml-tentacles/core@2.0.1

## 2.0.0

### Major Changes

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

- Updated dependencies [[`b724dac`](https://github.com/KB-ML/tentacles/commit/b724dace85288e8562d2e28300106b18d9ff911a), [`b724dac`](https://github.com/KB-ML/tentacles/commit/b724dace85288e8562d2e28300106b18d9ff911a), [`b724dac`](https://github.com/KB-ML/tentacles/commit/b724dace85288e8562d2e28300106b18d9ff911a), [`cd4a500`](https://github.com/KB-ML/tentacles/commit/cd4a50047cb473b085393073f61ec613d14c3e69), [`cd4a500`](https://github.com/KB-ML/tentacles/commit/cd4a50047cb473b085393073f61ec613d14c3e69)]:
  - @kbml-tentacles/core@2.0.0
