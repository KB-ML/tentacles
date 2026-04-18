# Contract utilities

Standalone helpers exported from `@kbml-tentacles/core` for deriving new contract chains from existing ones. `pick`, `omit`, `partial`, `required`, and `merge` all work across every chain type — model, view, props, and any third-party chain that registers with the strategy registry via `registerChainOps`. They dispatch through a hidden `CONTRACT_CHAIN_STRATEGY` symbol rather than `instanceof` checks.

> Every utility returns a new chain with the same class as the first argument. The original chain is not mutated. Calling `pick(modelContract, ...)` returns a `ModelContractChain`; calling it on a view contract returns a `ViewContractChain`; on a props contract, a `PropsContractChainImpl`.

## `pick(chain, ...args)`

```ts
// Model chain
pick<C extends ModelContractChain<any, any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C

// View chain
pick<C extends ViewContractChain<any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C

// Props chain (no dropDangling — props have no refs)
pick<C extends PropsContractChainImpl<any>>(
  chain: C,
  ...keys: string[]
): C
```

Creates a new chain of the same type containing only the fields whose names are in `args`. Unknown names are silently ignored — they simply do not copy over. Fields not in `args` are dropped. Options objects may appear alongside string names; they configure reference-handling:

- `{ dropDangling: true }` — after copying, drop any ref whose target field was not copied. Without this flag, a ref pointing to a missing field remains in the new chain, and validation fires at model-creation time.

```ts
import { pick, createContract } from "@kbml-tentacles/core"

const full = createContract()
  .store("id",    (s) => s<number>())
  .store("name",  (s) => s<string>())
  .store("email", (s) => s<string>())
  .store("phone", (s) => s<string>())
  .pk("id")

const login = pick(full, "id", "email")
// login has two stores and no PK — must add .pk() before passing to createModel.
```

For chains with refs, `dropDangling` only matters when an `fk`-aliased ref points to a store field that got excluded.

**Throws** if the chain is not registered in the strategy registry.

## `omit(chain, ...args)`

```ts
omit<C extends ModelContractChain<any, any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C

omit<C extends ViewContractChain<any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C

omit<C extends PropsContractChainImpl<any>>(
  chain: C,
  ...keys: string[]
): C
```

Inverse of `pick`. Creates a new chain containing every field *except* those named in `args`. Unknown names are ignored — omitting a non-existent field is a no-op.

```ts
import { omit, createPropsContract } from "@kbml-tentacles/core"

const full = createPropsContract()
  .store("title",    (s) => s<string>())
  .store("subtitle", (s) => s<string>().optional())
  .event("onClose",  (e) => e<void>())

const titleOnly = omit(full, "subtitle", "onClose")
// titleOnly only has the "title" prop.
```

`dropDangling` behaves the same as in `pick` — remove refs whose targets were dropped.

**Throws** if the chain is not registered in the strategy registry.

## `partial(chain)`

```ts
partial<C extends ModelContractChain<any, any, any, any>>(chain: C): C
partial<C extends ViewContractChain<any, any, any>>(chain: C): C
partial<C extends PropsContractChainImpl<any>>(chain: C): C
```

Creates a new chain where every field is optional.

| Chain type | What "optional" means |
|---|---|
| Model / view | Every store field has `hasDefault: true`. At `Model.create`/`viewModel.create` time, omitting the field leaves it `undefined`. |
| Props | Every prop descriptor has `isOptional: true`. `CreateInput` keys become optional. |

```ts
import { partial, createPropsContract } from "@kbml-tentacles/core"

const baseProps = createPropsContract()
  .store("query", (s) => s<string>())
  .store("page",  (s) => s<number>())

const maybeProps = partial(baseProps)
// maybeProps.create({}) typechecks — both keys are optional.
```

The original chain is not mutated; `partial(chain)` returns a fresh chain.

**Throws** if the chain's strategy does not implement `applyPartial`. All built-in chain types do.

## `required(chain)`

```ts
required<C extends ModelContractChain<any, any, any, any>>(chain: C): C
required<C extends ViewContractChain<any, any, any>>(chain: C): C
required<C extends PropsContractChainImpl<any>>(chain: C): C
```

Inverse of `partial`. Creates a new chain where every field is required (`hasDefault: false` / `isOptional: false`). Useful for reversing a prior `partial(...)` or for re-hardening a chain composed from multiple optional pieces.

```ts
import { partial, required, createPropsContract } from "@kbml-tentacles/core"

const softened = partial(somePropsChain)
const hardened = required(softened)
// hardened requires every prop again, even those originally marked optional.
```

**Throws** if the chain's strategy does not implement `applyRequired`.

## `merge(a, b)`

```ts
merge<
  A extends ModelContractChain<any, any, any, any>,
  B extends ModelContractChain<any, any, any, any>,
>(a: A, b: B): A

merge<
  A extends ViewContractChain<any, any, any>,
  B extends ViewContractChain<any, any, any>,
>(a: A, b: B): A

merge<
  A extends PropsContractChainImpl<any>,
  B extends PropsContractChainImpl<any>,
>(a: A, b: B): A
```

Combines two chains into a new chain of the same type as `a`. Every field from `a` is copied first, then every field from `b`. The result is a fresh chain — neither input is mutated.

```ts
import { merge, createContract } from "@kbml-tentacles/core"

const audit = createContract()
  .store("createdAt", (s) => s<number>())
  .store("updatedAt", (s) => s<number>())

const post = createContract()
  .store("id",    (s) => s<string>())
  .store("title", (s) => s<string>())

const postWithAudit = merge(post, audit).pk("id")
```

`merge(a, b)` differs from `a.merge(b)` (the chain method) only in being a standalone function call — semantically they are identical, and both throw on collisions.

**Throws** if any field name exists in both `a` and `b`. The error message names the colliding field.

## `registerChainOps(chain, ops)`

```ts
function registerChainOps(chain: object, ops: ChainOps): void
```

Registers a chain instance with the strategy registry so that `pick`, `omit`, `partial`, `required`, and `merge` can operate on it. Called automatically by the constructors of `ModelContractChain`, `ViewContractChain`, and `PropsContractChainImpl`. Third-party chains — for example `FormContractChainImpl` from `@kbml-tentacles/forms` — call it in their own constructors to join the ecosystem.

```ts
interface ChainOps {
  entityNames(): string[]
  createEmpty(): object
  copyEntities(source: object, names: Set<string>): void
  copyAll(source: object): void
  applyPartial?(source: object): void
  applyRequired?(source: object): void
  validateRefs(dropDangling: boolean): void
}
```

| Method | Purpose |
|---|---|
| `entityNames()` | Return the names of all fields currently in the chain. |
| `createEmpty()` | Return a fresh empty chain of the same type. |
| `copyEntities(source, names)` | Copy the named entities from `source` into this chain. |
| `copyAll(source)` | Copy every entity from `source` into this chain. |
| `applyPartial(source)` | Copy entities with `isOptional` set to `true`. |
| `applyRequired(source)` | Copy entities with `isOptional` set to `false`. |
| `validateRefs(dropDangling)` | Drop (if `true`) or accept refs whose target field is missing. |

```ts
class MyChain {
  constructor() {
    registerChainOps(this, {
      entityNames: () => [...],
      createEmpty: () => new MyChain(),
      copyEntities: (src, names) => { ... },
      copyAll: (src) => { ... },
      validateRefs: () => {},
    })
  }
}
```

The registry uses a `WeakMap`, so a chain instance is garbage-collected as soon as no one references it.

## Notes

- Every utility returns a new chain; originals are never mutated.
- `pick` and `omit` accept the same varargs — string names and an options object in any order.
- `pick` on an empty key set returns an empty chain, not a copy.
- `partial` and `required` do not affect refs or inverses — only the optionality of stores or props.
- `merge(a, b)` produces an unfinalized chain. For model chains, call `.pk(...)` on the result to produce a `FinalizedContractImpl`.
- All utilities are pure — they do not touch effector at all.

## Related

- [createContract](/reference/core/create-contract) — build the chains these utilities operate on.
- [createViewContract](/reference/core/create-view-contract) — view chains behave identically.
- [createPropsContract](/reference/core/create-props-contract) — prop chains behave identically.
- [Strategy pattern](/explanation/strategy-pattern) — design background and why the symbol exists.
