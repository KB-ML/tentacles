# @kbml-tentacles/forms

Contract-driven reactive forms for [effector](https://effector.dev). Same fluent-chain design as `@kbml-tentacles/core` — fields, sub-forms, arrays, sync + async validation, and a full submission orchestrator.

```sh
npm install effector @kbml-tentacles/core @kbml-tentacles/forms
```

## Quick start

```ts
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";

const loginContract = createFormContract()
  .field("email", (f) => f<string>().default("").required("Required"))
  .field("password", (f) =>
    f<string>().default("").custom((v) => (v.length < 8 ? "Too short" : null)),
  );

export const loginForm = createFormViewModel({
  contract: loginContract,
  validate: { mode: "submit" },
});
```

The returned definition is a `ViewModelDefinition<FormShape>` from
`@kbml-tentacles/core`, so you mount it like any other view-model
(`<View model={loginForm}>` in React, etc.).

## Highlights

- **Field builder** — `.default()`, `.optional()`, `.disabled()`, `.required()`, `.validate()`, `.validateAsync()`, `.dependsOn()`, `.transform()`, `.resetOn()`.
- **Composition** — `.sub(name, contract)` for nested forms, `.array(name, contract)` for repeating rows backed by a real `@kbml-tentacles/core` model.
- **Validation modes** — `submit` (default) | `blur` | `change` | `touched` | `all`, with separate `reValidateOn` once a field has been visited.
- **Async validators** — per-validator debounce, `AbortController` cancellation, SSR `flushAll`.
- **Aggregates** — `$values`, `$errors`, `$isValid`, `$isDirty`, `$isTouched`, `$isValidating`, `$isSubmitting`, `$submitCount`.
- **Lifecycle events** — `submitted`, `rejected`, `resetCompleted`.
- **Cross-field rules** — `.validate(({ values }) => ...)` for whole-form invariants (e.g. password match).

## Schema validators

Drop in your favorite schema library via the dedicated adapters:

| Library | Package |
|---|---|
| Zod | [`@kbml-tentacles/forms-zod`](../forms-zod) |
| Yup | [`@kbml-tentacles/forms-yup`](../forms-yup) |
| Valibot | [`@kbml-tentacles/forms-valibot`](../forms-valibot) |
| ArkType | [`@kbml-tentacles/forms-arktype`](../forms-arktype) |
| Joi | [`@kbml-tentacles/forms-joi`](../forms-joi) |

## Framework bindings

| Framework | Package |
|---|---|
| React | [`@kbml-tentacles/forms-react`](../forms-react) |
| Vue | [`@kbml-tentacles/forms-vue`](../forms-vue) |
| Solid | [`@kbml-tentacles/forms-solid`](../forms-solid) |

## Documentation

- Tutorials: [your first form](../../docs/tutorials/your-first-form.md)
- How-to: [define a form contract](../../docs/how-to/define-a-form-contract.md), [add sync validation](../../docs/how-to/add-sync-validation.md), [add async validation](../../docs/how-to/add-async-validation.md), [cross-field validation](../../docs/how-to/cross-field-validation.md), [work with form arrays](../../docs/how-to/work-with-form-arrays.md), [handle submission](../../docs/how-to/handle-submission.md), [reset and keep state](../../docs/how-to/reset-and-keep-state.md), [use a schema validator](../../docs/how-to/use-schema-validator.md)
- Reference: [`docs/reference/forms`](../../docs/reference/forms)

## Peer dependencies

- `effector ^23.0.0`
- `@kbml-tentacles/core ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
