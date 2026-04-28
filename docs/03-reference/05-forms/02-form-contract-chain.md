---
description: "Reference for FormContractChainImpl: field/sub/array descriptors, validators, and composition."
---

# `FormContractChainImpl`

Class returned by [`createFormContract()`](/reference/forms/create-form-contract). Accumulates field, sub-form, and array descriptors plus cross-field validators via a fluent chain. Every method returns `this` with a widened phantom `Fields` and (for `.validate()`) `CrossValidators` accumulator.

```ts
class FormContractChainImpl<
  Fields extends Record<string, unknown> = {},
  CrossValidators extends unknown[] = [],
> {
  field<K extends string, T, HD extends boolean, R extends boolean, W extends boolean>(
    name: FreshFieldName<K, Fields>,
    builder: (f: FormFieldBuilder<Fields>) => FormFieldTypedImpl<T, HD, R, W, Fields>,
  ): FormContractChainImpl<Fields & Record<K, T>, CrossValidators>

  sub<K extends string, C extends FormContractChainImpl<any, any>>(
    name: FreshFieldName<K, Fields>,
    contract: C | (() => C),
  ): FormContractChainImpl<Fields & Record<K, InferFieldsFromChain<C>>, CrossValidators>

  array<K extends string, C extends FormContractChainImpl<any, any>>(
    name: FreshFieldName<K, Fields>,
    contract: C | (() => C),
    opts?: FormArrayOptions,
  ): FormContractChainImpl<Fields & Record<K, InferFieldsFromChain<C>[]>, CrossValidators>

  validate(
    validator: CrossFieldValidator<Fields>,
  ): FormContractChainImpl<Fields, [...CrossValidators, CrossFieldValidator<Fields>]>

  merge<Other extends FormContractChainImpl<any, any>>(
    other: Other,
  ): FormContractChainImpl<Fields & InferFieldsFromChain<Other>, CrossValidators>
}
```

The `FreshFieldName<K, Fields>` constraint is `K extends keyof Fields ? never : K` — already-declared names fail at the type level before they ever reach the runtime check. Runtime validation still rejects [reserved names](/reference/forms/create-form-contract#reserved-entity-names), `.`, `:`, and empty strings.

## `.field(name, builder)`

```ts
.field<K extends string, T, HD extends boolean, R extends boolean, W extends boolean>(
  name: FreshFieldName<K, Fields>,
  builder: (f: FormFieldBuilder<Fields>) => FormFieldTypedImpl<T, HD, R, W, Fields>,
): FormContractChainImpl<Fields & Record<K, T>, CrossValidators>
```

Declares a leaf field. `builder` receives a callable [`FormFieldBuilder<Fields>`](/reference/forms/field-builder); invoke it as `f<T>()` to set the value type, then chain modifiers (`.default()`, `.required()`, `.validate()`, ...) to return a `FormFieldTypedImpl<T, HD, R, W, Fields>`.

| Parameter | Type | Description |
|---|---|---|
| `name` | `FreshFieldName<K, Fields>` | Entity name. Must be unique on this chain and not [reserved](/reference/forms/create-form-contract#reserved-entity-names). |
| `builder` | `(f) => FormFieldTypedImpl<T, ...>` | Callback that receives `f<T>()` and returns a typed field descriptor. |

**Returns** the chain widened with `Record<K, T>` in `Fields`.

```ts
import { createFormContract } from "@kbml-tentacles/forms"

const contract = createFormContract()
  .field("email", (f) => f<string>().required("Email is required"))
  .field("age", (f) => f<number>().default(18))
  .field("nickname", (f) => f<string>().optional())
```

**Throws** `FormContractError` if `name` is duplicate, reserved, empty, or contains `.` / `:`. The phantom `FreshFieldName` constraint catches duplicates at compile time as well.

See [Field builder](/reference/forms/field-builder) for the complete builder API.

## `.sub(name, contract)`

```ts
.sub<K extends string, C extends FormContractChainImpl<any, any>>(
  name: FreshFieldName<K, Fields>,
  contract: C | (() => C),
): FormContractChainImpl<Fields & Record<K, InferFieldsFromChain<C>>, CrossValidators>
```

Embeds another `FormContractChainImpl` as a nested sub-form. The sub-form is materialized lazily — its descriptors are not consulted until the sub-form is first accessed on the runtime [`FormShape`](/reference/forms/form-shape).

| Parameter | Type | Description |
|---|---|---|
| `name` | `FreshFieldName<K, Fields>` | Entity name for the sub-form on the parent shape. |
| `contract` | `C \| (() => C)` | A `FormContractChainImpl` or a thunk returning one. The thunk form supports recursion. |

**Returns** the chain widened with `Record<K, InferFieldsFromChain<C>>` in `Fields`.

The sub-form appears on the parent runtime shape as a full nested `FormShape` with its own aggregates (`$values`, `$isValid`, etc.) and control events. Aggregates of the parent recursively combine over all descendants.

```ts
const addressContract = createFormContract()
  .field("street", (f) => f<string>().required())
  .field("city", (f) => f<string>().required())

const userContract = createFormContract()
  .field("name", (f) => f<string>().required())
  .sub("address", addressContract)
```

The thunk form is required when the contract reference would not yet be initialized in source order (recursive contracts):

```ts
const c: FormContract<C> = createFormContract<C>()
  .field("name", (f) => f<string>())
  .sub("parent", () => c)
```

A thunk is detected by `typeof contract === "function" && !(contract instanceof FormContractChainImpl)`.

**Throws** `FormContractError` if `name` is duplicate, reserved, empty, or contains `.` / `:`.

## `.array(name, contract, opts?)`

```ts
.array<K extends string, C extends FormContractChainImpl<any, any>>(
  name: FreshFieldName<K, Fields>,
  contract: C | (() => C),
  opts?: FormArrayOptions,
): FormContractChainImpl<Fields & Record<K, InferFieldsFromChain<C>[]>, CrossValidators>
```

Embeds an array of rows. Each row is materialized as an instance of a `@kbml-tentacles/core` Model whose `fn` builds a [`FormRowShape<Row>`](/reference/forms/form-row-shape) (a full `FormShape` plus row-specific metadata). The array itself is a [`FormArrayShape<Row>`](/reference/forms/form-array-shape) — hybrid between a form aggregate surface and a core model.

| Parameter | Type | Description |
|---|---|---|
| `name` | `FreshFieldName<K, Fields>` | Entity name for the array on the parent shape. |
| `contract` | `C \| (() => C)` | Row contract, or a thunk for recursion. |
| `opts` | `FormArrayOptions` _(optional)_ | `min` / `max` constraints on row count. |

**Returns** the chain widened with `Record<K, InferFieldsFromChain<C>[]>` in `Fields`.

```ts
const todoContract = createFormContract()
  .field("title", (f) => f<string>().required())
  .field("done", (f) => f<boolean>().default(false))

const listContract = createFormContract()
  .field("name", (f) => f<string>().required())
  .array("todos", todoContract, { min: 1, max: 50 })
```

### `FormArrayOptions`

```ts
interface FormArrayOptions {
  min?: number | { value: number; message: string }
  max?: number | { value: number; message: string }
}
```

| Field | Type | Description |
|---|---|---|
| `min` | `number \| { value, message }` _(optional)_ | Minimum row count. Use the object form to attach a custom message. |
| `max` | `number \| { value, message }` _(optional)_ | Maximum row count. Use the object form to attach a custom message. |

When constraints fail, the violation is reported on the array's `$arrayError` store (see [`FormArrayShape`](/reference/forms/form-array-shape#arrayerror)).

**Throws** `FormContractError` if `name` is duplicate, reserved, empty, or contains `.` / `:`.

## `.validate(validator)`

```ts
.validate(
  validator: CrossFieldValidator<Fields>,
): FormContractChainImpl<Fields, [...CrossValidators, CrossFieldValidator<Fields>]>
```

Attaches a [`CrossFieldValidator`](/reference/forms/validators#crossfieldvalidator-v) that receives the entire form's resolved values and may return errors at any path via [`ValidationIssue[]`](/reference/forms/validators#validationissue). Multiple `.validate()` calls are accumulated; all run on submit and on cross-field re-validation triggers.

| Parameter | Type | Description |
|---|---|---|
| `validator` | `CrossFieldValidator<Fields>` | `(values, ctx) => ValidationResult \| Promise<ValidationResult>`. Use `ValidationIssue[]` for path-qualified errors. |

**Returns** the chain with the validator appended to the `CrossValidators` tuple.

```ts
createFormContract()
  .field("password", (f) => f<string>().required())
  .field("confirm", (f) => f<string>().required())
  .validate((values) =>
    values.password !== values.confirm
      ? [{ path: ["confirm"], message: "Passwords do not match" }]
      : null,
  )
```

Cross-field validators are evaluated by the validation runner alongside per-field validators. Their issues populate the same `$errors` aggregate.

## `.merge(other)`

```ts
.merge<Other extends FormContractChainImpl<any, any>>(
  other: Other,
): FormContractChainImpl<Fields & InferFieldsFromChain<Other>, CrossValidators>
```

Copies all field, sub-form, and array descriptors plus cross-field validators from `other` onto this chain. The original `other` chain is left untouched.

| Parameter | Type | Description |
|---|---|---|
| `other` | `FormContractChainImpl<any, any>` | Source chain. Its declared entity names must not collide with this chain's. |

**Returns** the chain widened with `InferFieldsFromChain<Other>` in `Fields`.

```ts
const addressMixin = createFormContract()
  .field("street", (f) => f<string>().required())
  .field("city", (f) => f<string>().required())

const userContract = createFormContract()
  .field("name", (f) => f<string>().required())
  .merge(addressMixin)
// userContract has: name, street, city
```

**Throws** `FormContractError` on the first colliding name (`merge collision: "<name>" already exists`).

The same dispatch is used by the generic [`merge`](/reference/core/contract-utilities) utility from core, which routes through the chain's `CONTRACT_CHAIN_STRATEGY`. Other utilities (`pick`, `omit`, `partial`, `required`) also work on form contracts via that strategy.

## Internal accessors (advanced)

These methods are part of the public surface so the runtime and contract utilities can introspect a chain. Application code rarely needs them.

### `.getFieldDescriptors()`

```ts
.getFieldDescriptors(): Record<string, FormFieldDescriptor>
```

Returns the internal `name -> FormFieldDescriptor` map for `.field()` declarations. The descriptor object is the same one captured by the [field builder](/reference/forms/field-builder)'s `.toDescriptor()`.

### `.getSubDescriptors()`

```ts
.getSubDescriptors(): Record<string, FormSubDescriptor>
```

Returns the internal `name -> FormSubDescriptor` map for `.sub()` declarations. Each descriptor carries the contract or thunk and an `isThunk` flag.

### `.getArrayDescriptors()`

```ts
.getArrayDescriptors(): Record<string, FormArrayDescriptor>
```

Returns the internal `name -> FormArrayDescriptor` map for `.array()` declarations. Each descriptor carries the row contract (or thunk), `isThunk`, and the resolved `min` / `max` constraints (or `null`).

### `.getCrossValidators()`

```ts
.getCrossValidators(): CrossValidatorDescriptor[]
```

Returns the array of cross-field validator descriptors, in the order they were attached. Each descriptor is `{ validator: CrossFieldValidator }`.

### `.hasEntity(name)`

```ts
.hasEntity(name: string): boolean
```

Returns `true` if `name` has been declared via `.field()`, `.sub()`, or `.array()`. Used by `.merge()` and the contract-utility strategy for collision checks.

### `.entityNames()`

```ts
.entityNames(): string[]
```

Returns all declared entity names (field + sub + array) in declaration order.

### `.getEntity(name)`

```ts
.getEntity(name: string): FormEntityDescriptor | undefined
```

Returns the descriptor for `name`, regardless of kind, or `undefined` if not declared. The returned union is `FormFieldDescriptor | FormSubDescriptor | FormArrayDescriptor`; discriminate via `kind`.

## Type helpers

### `FreshFieldName<K, Fields>`

```ts
type FreshFieldName<K extends string, Fields> = K extends keyof Fields ? never : K
```

Compile-time guard that resolves to `never` when `K` is already declared. Used as the `name` parameter type on `.field()`, `.sub()`, and `.array()` to surface duplicates as type errors.

### `InferFieldsFromChain<C>`

```ts
type InferFieldsFromChain<C> = C extends { readonly [_fcFields]: infer F } ? F : never
```

Extracts the accumulated `Fields` shape from a chain via its phantom key.

### `ExtractValues<C>`

```ts
type ExtractValues<C> = InferFieldsFromChain<C>
```

Alias for `InferFieldsFromChain<C>`. Use whichever name reads better at the call site.

## See also

- [`createFormContract`](/reference/forms/create-form-contract) — factory that returns this chain.
- [`FormFieldBuilder`](/reference/forms/field-builder) — inner builder passed to `.field()`.
- [`createFormViewModel`](/reference/forms/create-form-view-model) — runtime materialization.
- [Contract utilities](/reference/core/contract-utilities) — `pick`, `omit`, `partial`, `required`, `merge` work on form contracts via strategy dispatch.
- [`createContract`](/reference/core/create-contract) — the analogous core chain.
