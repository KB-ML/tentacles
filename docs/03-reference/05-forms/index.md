---
description: "Reference for @kbml-tentacles/forms: form contracts, runtime shape, validation, submission, and arrays."
---

# `@kbml-tentacles/forms`

Contract-driven form management for Tentacles. Declare a form schema with a fluent builder, then materialize it into a `ViewModelDefinition` whose shape exposes reactive fields, aggregates, submit/reset orchestration, and model-backed arrays. Built on top of [`@kbml-tentacles/core`](/reference/core/) and [effector](https://effector.dev); peer dependency `effector ^23.0.0`.

> Bundle: ESM + CJS + `.d.ts`. `sideEffects: false`. A form is, at runtime, a view model — every export from `@kbml-tentacles/core` that accepts a `ViewModelDefinition` (primarily `<View>`, with `useView` as a single-component alternative) accepts a form as-is.

## Install

```bash
npm install @kbml-tentacles/forms @kbml-tentacles/core effector
```

```bash
yarn add @kbml-tentacles/forms @kbml-tentacles/core effector
```

```bash
pnpm add @kbml-tentacles/forms @kbml-tentacles/core effector
```

Both `@kbml-tentacles/core` and `effector ^23.0.0` are peer dependencies.

## Exports

### Contract layer

| Export | Kind | Description |
|---|---|---|
| [`createFormContract`](/reference/forms/create-form-contract) | function | Start a new form contract chain. |
| [`FormContractChainImpl`](/reference/forms/form-contract-chain) | class | Type returned by `createFormContract()`. |
| [`FormContractError`](/reference/forms/create-form-contract) | class | Thrown on contract construction errors. |
| `FormArrayOptions` | interface | Options for `.array()` — `min`, `max`. |
| `InferFieldsFromChain` | type | Extract the `Fields` accumulator from a chain. |
| `ExtractValues` | type | Alias for `InferFieldsFromChain`. |
| [`FormContract`](/reference/forms/types) | type | Branded alias for annotating recursive contracts. |

### Validator types

| Export | Kind | Description |
|---|---|---|
| [`SyncFieldValidator`](/reference/forms/validators) | type | `(value, ctx) => ValidationResult`. |
| [`AsyncFieldValidator`](/reference/forms/validators) | type | `(value, ctx) => Promise<ValidationResult>`. |
| [`FieldValidator`](/reference/forms/validators) | type | `SyncFieldValidator \| AsyncFieldValidator`. |
| [`CustomValidator`](/reference/forms/validators) | interface | Branded sync validator object. |
| [`CustomAsyncValidator`](/reference/forms/validators) | interface | Branded async validator object. |
| [`CrossFieldValidator`](/reference/forms/validators) | type | Validator that receives all form values. |
| [`ValidatorCtx`](/reference/forms/validators) | interface | Context passed to every validator. |
| [`ValidationIssue`](/reference/forms/validators) | interface | Explicit path-qualified issue. |
| [`ValidationResult`](/reference/forms/validators) | type | `null \| string \| string[] \| ValidationIssue[]`. |
| [`ValidationMode`](/reference/forms/validation-modes) | type | `"submit" \| "blur" \| "change" \| "touched" \| "all"`. |
| [`ReValidationMode`](/reference/forms/validation-modes) | type | `"change" \| "blur" \| "submit"`. |

### Runtime

| Export | Kind | Description |
|---|---|---|
| [`createFormViewModel`](/reference/forms/create-form-view-model) | function | Materialize a contract into a `ViewModelDefinition`. |

### Runtime types

| Export | Kind | Description |
|---|---|---|
| [`FormShape`](/reference/forms/form-shape) | interface | Universal form surface (aggregates + controls + lifecycle). |
| [`Field`](/reference/forms/field) | interface | Leaf field surface (stores + events + metadata). |
| [`FormArrayShape`](/reference/forms/form-array-shape) | interface | Array form backed by a `@kbml-tentacles/core` Model. |
| [`FormRowShape`](/reference/forms/form-row-shape) | interface | Extends `FormShape` with `key`, `index`, `arrayRef`, `remove`. |
| [`SetFieldValuePayload`](/reference/forms/field) | type | Payload accepted by `Field.setValue`. |
| [`SetValuePayload`](/reference/forms/types) | interface | Payload accepted by `FormShape.setValue`. |
| [`SetErrorPayload`](/reference/forms/types) | interface | Payload accepted by `FormShape.setError`. |
| [`ResetPayload`](/reference/forms/types) | type | Payload accepted by `FormShape.reset`. |
| [`KeepStateOptions`](/reference/forms/types) | interface | Flags controlling what reset preserves. |
| [`DeepPartial`](/reference/forms/types) | type | Recursive partial of a values shape. |
| [`DeepErrors`](/reference/forms/types) | type | Recursive mirror of values with `string \| null` leaves. |

## Pipeline

A form flows **contract -> runtime** in the same way core does:

1. Declare the schema with [`createFormContract()`](/reference/forms/create-form-contract) and chain [`.field()` / `.sub()` / `.array()` / `.validate()` / `.merge()`](/reference/forms/form-contract-chain) until every entity is in place.
2. Pass the finalized chain to [`createFormViewModel({ contract, ... })`](/reference/forms/create-form-view-model), which returns a `ViewModelDefinition<FormShape>` from [`@kbml-tentacles/core`](/reference/core/view-model-definition).
3. Instantiate via `.create(props?)` (or render with framework adapters) to obtain the [`FormShape`](/reference/forms/form-shape) — the surface every consumer binds to.

Every level of a form is a `FormShape`: the root, every sub-form declared with `.sub()`, and every row inside an array. Leaf fields are [`Field<T>`](/reference/forms/field); arrays are [`FormArrayShape<Row>`](/reference/forms/form-array-shape) (hybrid: also a core `Model`).

## Validation

Field validation is driven by validator functions attached in the contract (`.validate()`, `.required()`, `.custom()`, `.warn()`, `.validateAsync()`). Cross-field validation is attached on the chain itself via `.validate(validator)`. Triggers are controlled by [validation modes](/reference/forms/validation-modes). Async validators support per-validator debounce and cancellation via `ctx.signal`.

Adapter packages that translate popular schema libraries into `CustomValidator` / `CustomAsyncValidator` are documented under `/reference/validators/` (e.g. [`zod`](/reference/validators/zod), [`yup`](/reference/validators/yup), [`valibot`](/reference/validators/valibot)).

## Framework adapters

Framework hooks for consuming forms are documented under `/reference/forms-react/` (see [`useField`](/reference/forms-react/use-field)) and the Vue and Solid equivalents ([`useField` — Vue](/reference/forms-vue/use-field), [`useField` — Solid](/reference/forms-solid/use-field)). Because a form is a plain `ViewModelDefinition`, the core framework adapters ([`<View>`](/reference/react/view), [`<Each>`](/reference/react/each), [`useModel`](/reference/react/use-model), [`useView`](/reference/react/use-view)) also work unchanged.

## SSR

Forms inherit SID deduplication, scope isolation, and serializable stores from the core view-model pipeline. `createFormViewModel` captures the calling `sidRoot` via `detectSidRoot()` before any inner factory calls so that all materialized stores get deterministic SIDs under `fork()`.
