---
"@kbml-tentacles/core": major
"@kbml-tentacles/forms": major
"@kbml-tentacles/react": major
"@kbml-tentacles/vue": major
"@kbml-tentacles/solid": major
---

Replace `Store<Instance>` APIs with synchronous accessors.

**Why.** Instance proxies are stable objects — the reactivity lives in
the per-field `$field` stores and the model-level `$ids` / `$idSet`
membership stores. Wrapping a proxy in `Store<Instance>` layered a
store-of-stores on top without adding any new signal we don't already
get from `$ids` (membership) + the field stores themselves. It also
forced every consumer through a `getState()` / `useUnit()` hop just to
read an object reference that never actually changes. This release
drops the wrapper across `core` and all framework bindings.

### Removed

Each of these previously returned a `Store<...>`; all now have
synchronous replacements:

| Removed | Returned | Replacement |
|---|---|---|
| `model.instance(id)` | `Store<Instance \| null>` | `model.get(id)` — sync |
| `model.instance(...parts)` (compound PK) | `Store<Instance \| null>` | `model.get(...parts)` — sync |
| `model.byPartialKey(...parts)` | `Store<Instance[]>` | filter `model.$pkeys` manually |
| `model.$instances` | `Store<Instance[]>` | `model.instances()` — sync snapshot |
| `QueryContext.$instances` (internal) | `Store<Instance[]>` | removed — query context exposes `$ids` + `$dataMap` |

### Added

- **`model.get(id): Instance | null`** — synchronous O(1) global-cache
  lookup. If the id is present in `$dataMap` but the cache is empty
  (e.g. after `fork({ values })` without imperative creation), the
  proxy is lazily constructed and cached. Field stores remain
  scope-aware because they read through `$dataMap`, which is
  scope-partitioned by effector.
- **`model.get(...parts): Instance | null`** — compound-key overload.
- **`model.instances(): Instance[]`** — synchronous snapshot of all live
  proxies (global scope). For scoped reads, combine `$ids` with
  `model.get(id)` or call `model.getSync(id, scope)`.

### Unchanged (scoped helpers)

`model.getSync(id, scope?)` and `model.getByKeySync(...parts, scope?)`
were already part of the public API and remain the right tool for
scoped imperative reads (e.g. from Next.js server components with a
`fork({ values })` scope):

```ts
// Scoped read in a server component
const todo = todoModel.getSync("t1", scope);
const row = todoModel.getByKeySync("acme", 42, scope);
```

### Migration

#### Imperative reads

```ts
// Before
const inst = model.instance("t1").getState();
const acme = model.byPartialKey("acme").getState();
const all = model.$instances.getState();
const scoped = clientScope.getState(model.instance("t1"));

// After
const inst = model.get("t1");
const acme = model.$pkeys.getState().filter((pk) => pk[0] === "acme");
const all = model.instances();
const scoped = model.getSync("t1", clientScope);
```

#### Reactive subscriptions

If you previously subscribed to `model.$instances` in a `combine`,
switch to the membership store and resolve inside the mapper:

```ts
// Before
const $count = model.$instances.map((xs) => xs.length);

// After
const $count = model.$count; // already exposed
// Or, for a custom reduction:
const $priceSum = combine(model.$ids, model.$dataMap, (ids, map) =>
  ids.reduce((sum, id) => sum + (map[id]?.price ?? 0), 0),
);
```

#### React bindings (`@kbml-tentacles/react`)

Public surface (`useModel`, `<Each>`, `<View>`) is unchanged. Internals
were rewritten to the `useUnit(model.$idSet) + model.get(id)` pattern.
Direct consumers of old internal helpers migrate as:

```tsx
// Before — hand-rolled pattern around the old Store<Instance>
const $inst = model.instance(id);
const inst = useUnit($inst);

// After
const idSet = useUnit(model.$idSet);
const inst = idSet.has(id) ? model.get(id) : null;
```

`<Each model={m} source={$ids}>` continues to work and now iterates
`$ids` directly, calling `model.get(id)` per row synchronously.

#### Vue bindings (`@kbml-tentacles/vue`)

```ts
// Before
const inst = useUnit(model.instance(id));

// After
const idSet = useUnit(model.$idSet);
const inst = computed(() => (idSet.value.has(id) ? model.get(id) : null));
```

`useModel(model, id)` keeps its surface.

#### Solid bindings (`@kbml-tentacles/solid`)

```tsx
// Before
const inst = useUnit(() => model.instance(id));

// After
const idSet = useUnit(() => model.$idSet);
const inst = () => (idSet().has(id) ? model.get(id) : null);
```

`<Each>` and `useModel(model, id)` keep their surface.

### Fork-hydrate guarantee

`model.get(id)` works correctly after `fork({ values: [...] })`:

- If the id was hydrated into `$dataMap` via `fork({ values })`, the
  first `get(id)` call **lazily constructs** the proxy and caches it.
- The proxy's `$field` stores read through `$dataMap`, which effector
  partitions per scope — so the same proxy returns scope-correct
  values whether you read it outside a scope, via `scope.getState($field)`,
  or via `model.getSync(id, scope)`.
- Subsequent `get(id)` calls return the same stable proxy reference.

This means SSR code paths do not need any special "resolve-after-fork"
step; `get` is the single instance-access verb.
