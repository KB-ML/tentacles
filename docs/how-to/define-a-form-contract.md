# Define a form contract

Declare the shape of a form — its fields, nested groups, arrays, and defaults — through the `createFormContract()` chain builder, then hand the result to `createFormViewModel`.

| If you want to… | Use |
|---|---|
| Add a scalar input (string, number, enum) | `.field(name, f => f<T>().default(...))` |
| Group fields into a nested sub-form | `.sub(name, subContract)` |
| Let users add and remove rows | `.array(name, rowContract, { min, max })` |
| Share fields between two contracts | `.merge(other)` or `merge(a, b)` |
| Derive a read-only form from a larger one | `pick`, `omit`, `partial`, `required` |
| Define a tree that references itself | Pass a thunk `() => contract` to `.sub()` |

The form contract chain is independent from the model contract chain, but every contract utility exported from `@kbml-tentacles/core` works on it — this is the strategy pattern described in `packages/core/layers/contract/contract-chain.ts`. A `FormContractChainImpl` exposes a `[CONTRACT_CHAIN_STRATEGY]` that teaches `pick` and friends how to read and rebuild form descriptors.

## Declare a flat form

Start with `createFormContract()` and chain `.field()` once per input. The callback receives a field builder `f`; invoke `f<T>()` with the value type and layer modifiers on top.

```ts
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms"

const SignupContract = createFormContract()
  .field("email",    (f) => f<string>().default("").required("Email is required"))
  .field("password", (f) => f<string>().default("").required())
  .field("age",      (f) => f<number>().default(0))
  .field("terms",    (f) => f<boolean>().default(false))

export const signupFormViewModel = createFormViewModel({
  contract: SignupContract,
})
```

The callable form `f<string>()` is deliberate — it mirrors `s<T>()` on model contracts and lets TypeScript infer the payload type while still returning a fluent builder. Do not reach for `f.type<T>()` — that method does not exist.

Three field modifiers cover the flat cases:

- `.default(value | ctx => value)` — initial value the form starts with and `reset()` restores to.
- `.required(message?)` — shorthand for an "empty" check; also narrows the type out of `undefined` in most inference paths.
- `.optional()` — marks the field as `T | undefined` so downstream types treat the value as nullable.

A defaulted-but-optional field keeps its default at creation time but can be cleared to `undefined` later:

```ts
createFormContract()
  .field("middleName", (f) => f<string>().optional().default(""))
```

## Nest forms with `.sub()`

`.sub(name, contract)` embeds another `createFormContract()` chain under a named key. Sub-forms have their own validation, their own aggregates (`$isValid`, `$isDirty`, …), and their own reset semantics — they behave exactly like the root form, just scoped.

```ts
const AddressContract = createFormContract()
  .field("line1", (f) => f<string>().default("").required())
  .field("city",  (f) => f<string>().default("").required())
  .field("zip",   (f) => f<string>().default(""))

const ProfileContract = createFormContract()
  .field("displayName", (f) => f<string>().default(""))
  .sub("home",    AddressContract)
  .sub("billing", AddressContract)
```

At runtime the shape looks like `form.home.city` and `form.billing.zip`. Each sub-form exposes the full `FormShape` surface, so `form.home.reset()` clears only the home address while the rest of the form is untouched.

### Recursive and thunked contracts

If two contracts reference each other — a comment contract that contains replies of the same type — pass a thunk:

```ts
import { createFormContract } from "@kbml-tentacles/forms"

const CommentContract = createFormContract()
  .field("body", (f) => f<string>().default("").required())
  .array("replies", () => CommentContract)
```

The thunk is evaluated lazily on first materialization, which breaks the cycle at declaration time. Materialization stays cheap because sub-forms and array rows are built on access — an unused branch never spawns effector units.

## Array forms with `.array()`

`.array(name, rowContract, opts?)` declares a repeating section. Each row is a `FormRowShape<Row>` — a `FormShape` with an extra `key`, `index`, `arrayRef`, and `remove` event. The array itself is backed by a `@kbml-tentacles/core` Model, so `$ids`, `get(id)`, `instances()`, and `query()` are available at runtime.

```ts
const ContactContract = createFormContract()
  .field("name",  (f) => f<string>().default(""))
  .field("phone", (f) => f<string>().default(""))

const DirectoryContract = createFormContract()
  .field("label", (f) => f<string>().default(""))
  .array("contacts", ContactContract, {
    min: 1,
    max: 20,
    key: (row) => row.phone,
  })
```

The `opts` bag accepts:

| Option | Meaning |
|---|---|
| `min` | Minimum row count; violated counts populate `$arrayError` |
| `max` | Maximum row count; `append`/`insert` beyond this is ignored |
| `key` | Stable row identity — a field name (`"id"`) or a function `(row) => string` |

Providing `key` lets you pair rows with DOM nodes across reorders — React, Vue, and Solid each pick up the stable key when you render with `<Each>`. Without it, rows fall back to the synthetic `__rowId` autoincrement primary key declared on the row's backing model, which is stable but not meaningful to your UI.

See [Work with form arrays](/how-to/work-with-form-arrays) for the full catalogue of array operations.

## Reuse contracts with `.merge()` and friends

Both the method `.merge(other)` and the functional `merge(a, b)` from `@kbml-tentacles/core` work on form contracts. The method mutates the receiver; the function returns a new chain.

```ts
import { merge, omit, partial } from "@kbml-tentacles/core"
import { createFormContract } from "@kbml-tentacles/forms"

const AuditFields = createFormContract()
  .field("createdBy", (f) => f<string>().default(""))
  .field("note",      (f) => f<string>().default(""))

const UserBase = createFormContract()
  .field("id",    (f) => f<string>().default(""))
  .field("email", (f) => f<string>().default("").required())
  .field("role",  (f) => f<"admin" | "member">().default("member"))

// Compose a write form
const CreateUserForm = merge(UserBase, AuditFields)

// Derive a read-only summary — drop validation by narrowing first
const SummaryForm = omit(UserBase, "role")

// Build an update form where every field is optional
const UpdateUserForm = partial(UserBase)
```

The utilities dispatch through the `CONTRACT_CHAIN_STRATEGY` symbol, so `pick(formContract, ...)` returns a form contract, `pick(modelContract, ...)` returns a model contract, and no user-facing code needs `instanceof`. This matches the behaviour documented in [Compose contracts](/how-to/compose-contracts).

Duplicate field names throw `TentaclesError` at compose time — fix the overlap with `omit` before merging.

## Reserved names

The `FormShape` surface owns a long list of property names. Using any of them as a field, sub-form, or array name throws at schema build time. The full list lives in `packages/forms/src/contract/form-contract-chain.ts`, but the most common footguns are:

| Category | Reserved |
|---|---|
| Aggregate stores | `$values`, `$errors`, `$errorPaths`, `$isValid`, `$isDirty`, `$isTouched`, `$isValidating`, `$isSubmitting`, `$isSubmitted`, `$isSubmitSuccessful`, `$submitCount`, `$dirtyFields`, `$touchedFields`, `$validatingFields`, `$formError`, `$disabled` |
| Control events | `submit`, `reset`, `resetTo`, `setValues`, `setValue`, `setError`, `setErrors`, `clearErrors`, `setFormError`, `validate`, `disable` |
| Lifecycle events | `submitted`, `rejected`, `resetCompleted` |
| Row metadata | `kind`, `key`, `index`, `arrayRef`, `remove` |
| Internal | `__path`, `__debug` |

Field names also cannot contain `.` or `:` (both are reserved for path notation in `setValue({ path, value })`) and cannot be empty strings. Prefer lowerCamelCase — the rest of the Tentacles toolchain assumes identifier-safe names.

## Putting it together

A realistic sign-up form composes flat fields, a nested address, and a dynamic list:

```ts
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms"

const AddressContract = createFormContract()
  .field("line1", (f) => f<string>().default("").required())
  .field("city",  (f) => f<string>().default("").required())
  .field("zip",   (f) => f<string>().default(""))

const PhoneContract = createFormContract()
  .field("label",  (f) => f<"home" | "work" | "mobile">().default("mobile"))
  .field("number", (f) => f<string>().default("").required())

const SignupContract = createFormContract()
  .field("email",    (f) => f<string>().default("").required("Email is required"))
  .field("password", (f) => f<string>().default("").required())
  .field("terms",    (f) => f<boolean>().default(false))
  .sub("address", AddressContract)
  .array("phones", PhoneContract, { min: 1, max: 5, key: "number" })

export const signupFormViewModel = createFormViewModel({
  contract: SignupContract,
})
```

The resulting `signupFormViewModel.shape` exposes `email`, `password`, `terms`, `address` (a `FormShape`), and `phones` (a `FormArrayShape`). Every aggregate computed by the library — `$isValid`, `$isDirty`, `$errors` — aggregates across every level.

## See also

| Page | What it covers |
|---|---|
| [Add sync validation](/how-to/add-sync-validation) | `.required()`, `.validate()`, `.custom()`, `.warn()` and modes |
| [Work with form arrays](/how-to/work-with-form-arrays) | Row operations, `$at`, model APIs on arrays |
| [Field builder reference](/reference/forms/field-builder) | Every method the `f` builder exposes |
| [Form contract chain reference](/reference/forms/create-form-contract) | Exact signatures of `.field` / `.sub` / `.array` / `.merge` |
