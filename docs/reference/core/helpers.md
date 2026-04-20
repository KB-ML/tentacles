# Helpers

Niche utilities exported from `@kbml-tentacles/core` for implementers of custom chain types, custom framework adapters, and `<Each>`-like iteration components. Most users never touch these — the main API calls them internally. They are documented here for plugin authors and advanced integrations.

> Every helper in this file is a pure function or a small class. None of them touch the effector graph on their own; they operate on values the caller already has.

## `detectSidRoot()`

```ts
function detectSidRoot(): string | undefined
```

Probes the effector SID context to extract a namespace prefix for SSR-safe store identification. Creates a temporary store with SID `"_tentacles_probe_"`, reads the resulting full SID, and returns the substring before the last `|` separator — the root injected by `effector/babel-plugin` or the equivalent SWC transform.

```ts
import { detectSidRoot } from "@kbml-tentacles/core"

const root = detectSidRoot()
// On a configured build: "my-app/src/model.ts"
// Without a transform:   undefined
```

**Return value**

| Situation | Returns |
|---|---|
| The build pipeline is configured (babel or SWC plugin active). | A non-empty string — the file-path-based SID namespace. |
| No plugin is configured, or the probe's SID has no `|` separator. | `undefined`. |

`detectSidRoot()` is called automatically by `createContract()`, `createViewContract()`, and `createModel()` at chain/model construction time. Users do not normally call it. It is exported because third-party chain implementations (for example `FormContractChainImpl` in `@kbml-tentacles/forms`) need to capture the same root when their chain constructors run.

**Side effects**: creates and immediately disposes a throwaway effector store (`clearNode(probe, { deep: true })`). The probe has `serialize: "ignore"` so it never appears in a serialized scope.

## `TentaclesError`

```ts
class TentaclesError extends Error {
  constructor(message: string)
  readonly name: "TentaclesError"
}
```

Custom error class used throughout the library for runtime errors. The thrown message is prefixed with `[tentacles/core]:` to make the source obvious in logs and stack traces.

```ts
import { TentaclesError } from "@kbml-tentacles/core"

throw new TentaclesError("Invalid instance id")
// Error message: "[tentacles/core]: Invalid instance id"
```

All library-thrown errors are `TentaclesError` instances. Check `err instanceof TentaclesError` to distinguish library errors from user-code errors in an outer `catch`.

**Notes**

- The `.name` property is set to `"TentaclesError"` so it survives JSON serialization and appears in stack traces.
- A companion `tentaclesWarn(message)` is used internally for non-fatal warnings (prefix `[tentacles/core]:` sent to `console.warn`). It is not part of the public export surface.

## `resolveFrom(stack, fieldName, targetModel)`

```ts
interface ScopeEntry {
  model: {
    getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined
  }
  instance: Record<string, unknown>
}

interface ResolvedRef {
  cardinality: "one" | "many"
  store: Store<ModelInstanceId[]> | Store<ModelInstanceId | null>
}

function resolveFrom(
  stack: readonly ScopeEntry[],
  fieldName: string,
  targetModel: unknown,
): ResolvedRef
```

Walks up a scope stack (topmost entry last) looking for the nearest ancestor whose ref named `fieldName` targets `targetModel`. Returns a `ResolvedRef` describing how to read the ref's ID store.

| Field | Meaning |
|---|---|
| `stack` | An array of `ScopeEntry` items, one per `<Map>`/`<Each>` ancestor. The parent instances are looked up via `entry.instance[fieldName]`. |
| `fieldName` | The ref name to look for. |
| `targetModel` | The model the resolved ref should point to (identity comparison). |

```ts
import { resolveFrom } from "@kbml-tentacles/core"

const resolved = resolveFrom(scopeStack, "posts", PostModel)
// { cardinality: "many", store: Store<ModelInstanceId[]> }
```

The walk is top-down (from the deepest `<Each>` ancestor upwards) — the first matching ref wins. Self-refs (a ref pointing to the same model as the parent instance) are matched.

**Throws** `TentaclesError` if no matching ref is found anywhere in the stack. The error names the `fieldName` and the target model (by its `name` property, or `"unknown"` if absent).

**Use case**: `<Each from="posts">` inside a framework adapter. The adapter collects `ScopeEntry` entries as it descends through `<Each>` / `<View>` components and calls `resolveFrom` to translate `from="<refName>"` into an ID store it can iterate.

## `validateEachProps(props)`

```ts
function validateEachProps(props: {
  source?: unknown
  id?: unknown
  from?: unknown
}): void
```

Asserts that exactly one of `source`, `id`, or `from` is provided on an `<Each>` component. Used by framework adapters to surface configuration errors early.

```ts
import { validateEachProps } from "@kbml-tentacles/core"

validateEachProps({ source: idsStore })        // ok
validateEachProps({ id: someId })              // ok
validateEachProps({ from: "posts" })           // ok
validateEachProps({ source: idsStore, id: 1 }) // throws — mutually exclusive
validateEachProps({})                          // throws — nothing provided
```

**Throws** `TentaclesError` with a descriptive message when:

- All three of `source`, `id`, `from` are `null`/`undefined`. The message reads `<Each> requires one of: source, id, or from prop`.
- Two or more of them are non-`null`. The message reads `<Each> source, id, and from props are mutually exclusive`.

The helper tests with `!= null`, so `source: undefined` and `source: null` are both treated as "not provided."

**Use case**: `<Each>` components in every framework package call `validateEachProps({ source, id, from })` at render time so authoring mistakes produce an immediate stack trace rather than a silent no-op or a cryptic later failure.

## `tentaclesWarn(message)` (not exported)

```ts
function tentaclesWarn(message: string): void
```

Internal counterpart to `TentaclesError` — writes a formatted warning to `console.warn` with the `[tentacles/core]:` prefix. Not part of the public API, but useful to know about because library-emitted warnings in the console originate here.

```
[tentacles/core]: ref "posts" has no target — pass `refs: { posts: () => postModel }` to createModel()
```

Do not rely on this helper in user code; the library reserves the right to change, remove, or rename it between versions.

## When to use these helpers

| Helper | Primary consumer |
|---|---|
| `detectSidRoot` | Authors of custom chain classes that need SSR-safe SIDs matching the rest of the app. |
| `TentaclesError` | Authors of extensions that want to throw errors distinguishable from user bugs. |
| `resolveFrom` | Authors of framework-adapter `<Each>` / `<Map>` components translating `from="refName"` to an ID store. |
| `validateEachProps` | Authors of framework-adapter `<Each>` components doing prop validation. |

If you are writing ordinary application code, you probably do not need any of these. They are documented for plugin and adapter authors, and because having a canonical home for them avoids the "stringly typed" problem of people re-implementing the same probe/validation in their own codebases.

## Notes

- These helpers are stable but low-level. Their signatures are unlikely to change, but their use cases are narrow: custom chain plugins, framework adapters for unsupported renderers, or diagnostic tooling.
- `detectSidRoot` relies on the presence of an effector SID transform. If the transform is absent, SSR scope isolation still works, but stores get generated-at-runtime SIDs which are not stable across server/client.
- `TentaclesError` is the only error type the library throws. The library never re-throws third-party errors from user code (for example factory defaults); those propagate unchanged.

## Related

- [Types](/reference/core/types) — `ScopeEntry`, `ResolvedRef`, and other exported types.
- [Contract utilities](/reference/core/contract-utilities) — `registerChainOps`, which pairs with `detectSidRoot` for custom chains.
- [SSR and SIDs](/explanation/ssr-and-sids) — background on SID generation and effector's scope model.
