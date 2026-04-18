# Compose contracts

Contract utilities let you reuse, narrow, relax, and combine chains without rewriting them. They work on every chain type — model, view, props, and forms — through the `CONTRACT_CHAIN_STRATEGY` symbol, so the same function call behaves correctly regardless of which chain you pass.

## Why compose

Four recurring situations:

- **Shared audit fields.** `createdAt`, `updatedAt`, `createdBy` belong on most persistent models. Declare them once and `merge` them in.
- **Layered models.** A `userModel` contract is authored top-down: base identity, permissions, preferences. Each layer stays focused.
- **Update payloads.** A `partial` copy of a model contract produces the shape you accept in an update form.
- **Shared props.** Several view models need `userId` and `onClose`. Declare a props fragment once and merge it where needed.

All utilities return a new chain (except the `.merge(other)` method, which mutates the receiver and returns it with a widened type for chaining). The original chain is never modified by `pick`, `omit`, `partial`, `required`, or the functional `merge`.

## `merge(a, b)` — union two chains

`merge(a, b)` produces a new chain containing every field from both inputs. Duplicate field names throw `TentaclesError` at call time — resolve collisions with `omit` or `pick` before merging.

```ts
import { createContract, merge } from "@kbml-tentacles/core"

const auditFields = createContract()
  .store("createdAt", (s) => s<Date>().default(() => new Date()))
  .store("updatedAt", (s) => s<Date>().default(() => new Date()))

const userCore = createContract()
  .pk("id")
  .store("id", (s) => s<string>())
  .store("email", (s) => s<string>())
  .store("name", (s) => s<string>())

const userContract = merge(userCore, auditFields)
// userContract has: id, email, name, createdAt, updatedAt
```

The functional form is preferred because it keeps both inputs intact. If `userCore` and `auditFields` share a `id` field, the call throws:

```
TentaclesError: merge: field "id" already exists on the left chain
```

### `.merge(other)` method

Every chain class also exposes `.merge(other)`. This form **mutates the receiver** and returns it, which is useful when you build a chain incrementally but still want to widen its type:

```ts
const userContract = createContract()
  .pk("id")
  .store("id", (s) => s<string>())
  .store("email", (s) => s<string>())
  .merge(auditFields)    // mutates, returns `this` with widened type
  .store("lastLogin", (s) => s<Date>().optional())
```

Use the functional `merge` when composing shared fragments; use the method when you want to keep the builder chain going. Collision semantics are identical.

## `pick(contract, ...keys)` — keep specific fields

`pick` returns a new chain containing only the named fields. Field metadata (defaults, indexes, validators on forms) is copied across.

```ts
import { omit, pick } from "@kbml-tentacles/core"

const userSummary = pick(userContract, "id", "name", "email")
// userSummary has id, name, email — nothing else.
```

`pick` also copies the primary key if every PK field is included. Drop a PK field and the resulting chain has no PK.

### `dropDangling`

If the contract has refs pointing at a field you are dropping, `pick` throws by default:

```
TentaclesError: pick: field "organisationId" is referenced by ref "organisation"
```

Pass `{ dropDangling: true }` as the last argument to drop those refs automatically:

```ts
const trimmed = pick(userContract, "id", "name", { dropDangling: true })
// Any ref whose FK fields aren't in {id, name} is removed silently.
```

Use `dropDangling` when building read-only projections. Keep it off in domain code so dangling refs surface as errors.

## `omit(contract, ...keys)` — drop specific fields

`omit` is the inverse of `pick`. It returns a new chain without the named fields.

```ts
const publicUser = omit(userContract, "password", "passwordResetToken")
```

Like `pick`, `omit` accepts `{ dropDangling: true }`:

```ts
const publicUser = omit(userContract, "organisationId", { dropDangling: true })
// The `organisation` ref is removed with its FK.
```

Pick and omit pair well for projections:

```ts
// "everything except sensitive fields"
const safeUser = omit(userContract, "password", "twoFactorSecret")

// "everything in updatePayload except server-managed fields"
const updatePayload = omit(userContract, "id", "createdAt", "updatedAt")
```

## `partial(contract)` — make every field optional

`partial` copies a contract with all store fields marked optional. Events, derived fields, and refs are preserved as-is.

```ts
import { partial } from "@kbml-tentacles/core"

const userUpdate = partial(omit(userContract, "id", "createdAt", "updatedAt"))
// Every remaining store is optional — ideal for PATCH endpoints or forms.
```

Typical use cases:

- Update forms built with `@kbml-tentacles/forms`.
- Optional prop groups wrapped by `createPropsContract`.
- Relaxed view contracts where every value has a sensible default.

`partial` respects existing `.optional()` markers — calling it twice is a no-op for already-optional fields.

## `required(contract)` — make every field required

`required` is the reverse: it strips `.optional()` from every field.

```ts
import { required } from "@kbml-tentacles/core"

const fullUser = required(partial(userContract))
// Cancels the earlier partial. Nothing is optional now.
```

Use it when narrowing an external contract (for example a shared props fragment where half the fields are optional) down to a strict variant consumed by a specific component.

## Cross-chain composition

Every chain class implements `ContractChainStrategy<C>` and registers itself under the `Symbol.for("tentacles:contractChainStrategy")` key. Utilities dispatch through that strategy, so the same function handles every chain type.

```ts
import {
  createContract,
  createPropsContract,
  createViewContract,
  omit,
  partial,
  pick,
} from "@kbml-tentacles/core"

// Model contract
const model = createContract()
  .pk("id")
  .store("id", (s) => s<string>())
  .store("title", (s) => s<string>())

const modelLite = pick(model, "title")

// View contract
const view = createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page", (s) => s<number>().default(1))

const viewJustQuery = omit(view, "page")

// Props contract
const props = createPropsContract()
  .store("userId", (s) => s<number>())
  .store("title", (s) => s<string>().optional())

const relaxedProps = partial(props)   // still a PropsContractChain
```

Forms' `FormContractChainImpl` (from `@kbml-tentacles/forms`) participates in the same protocol. Picking a subset of a form contract yields another form contract whose validators and transforms are copied for the selected fields. You do not need a separate helper for each chain type.

### Type-level behaviour

The return type of each utility matches the input type:

- `pick(model, ...)` → `ModelContractChain<...>`
- `omit(view, ...)` → `ViewContractChain<...>`
- `partial(props)` → `PropsContractChainImpl<...>`
- `merge(form, form)` → `FormContractChainImpl<...>`

This makes utility composition safe: you can chain `pick` → `merge` → `partial` without losing chain-specific methods.

## Practical example: audit fields across multiple models

Declare the audit fragment once:

```ts
// contracts/audit.ts
import { createContract } from "@kbml-tentacles/core"

export const auditFields = createContract()
  .store("createdAt", (s) => s<Date>().default(() => new Date()))
  .store("updatedAt", (s) => s<Date>().default(() => new Date()))
  .store("createdBy", (s) => s<string>().optional())
  .store("updatedBy", (s) => s<string>().optional())
```

Merge it into models that need it:

```ts
// contracts/user.ts
import { createContract, merge } from "@kbml-tentacles/core"
import { auditFields } from "./audit"

const base = createContract()
  .pk("id")
  .store("id", (s) => s<string>())
  .store("email", (s) => s<string>())
  .store("name", (s) => s<string>())

export const userContract = merge(base, auditFields)
```

```ts
// contracts/invoice.ts
import { createContract, merge } from "@kbml-tentacles/core"
import { auditFields } from "./audit"

const base = createContract()
  .pk("id")
  .store("id", (s) => s<string>())
  .store("number", (s) => s<string>())
  .store("total", (s) => s<number>())

export const invoiceContract = merge(base, auditFields)
```

Derive update payloads from the same source of truth:

```ts
// contracts/user-update.ts
import { omit, partial } from "@kbml-tentacles/core"
import { userContract } from "./user"

export const userUpdateContract = partial(
  omit(userContract, "id", "createdAt", "updatedAt", "createdBy"),
)
```

And a public read view that never leaks internal metadata:

```ts
// contracts/user-public.ts
import { pick } from "@kbml-tentacles/core"
import { userContract } from "./user"

export const publicUserContract = pick(userContract, "id", "name")
```

All four contracts stay in sync with a single edit to `userContract` or `auditFields`. The strategy-dispatched utilities keep the code noise-free regardless of chain type.
