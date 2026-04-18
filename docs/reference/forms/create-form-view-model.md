# createFormViewModel

Turn a finalized form contract into a `ViewModelDefinition` that can be mounted with the framework adapters — primarily `<View>`, with `useView` as a single-component alternative.

```ts
function createFormViewModel<FC, R = InferFormShape<FC>>(
  config: FormViewModelConfig<FC, R>,
): ViewModelDefinition<R>
```

## Config object

```ts
interface FormViewModelConfig<FC, R> {
  readonly name?: string
  readonly contract: FC
  readonly props?: PropsContractChainImpl<any>
  readonly validate?: {
    mode?: ValidationMode         // default "submit"
    reValidate?: ReValidationMode // default "change"
    criteriaMode?: "firstError" | "all"
    delayError?: number
  }
  readonly resetOptions?: KeepStateOptions
  readonly preventDoubleSubmit?: boolean  // default true
  readonly initialValues?: Record<string, unknown>
  readonly fn?: (form: InferFormShape<FC>, ctx: Record<string, unknown>) => R
}
```

| Field | Role |
|---|---|
| `name` | Debug label used in dev tools and region names |
| `contract` | Required — a `FormContract<V>` from `createFormContract()` |
| `props` | Optional props contract for external inputs (same shape as view-model props) |
| `validate.mode` | When errors first become visible (see [validation modes](/reference/forms/validation-modes)) |
| `validate.reValidate` | Trigger for re-validation once a field has shown an error |
| `validate.criteriaMode` | `"firstError"` short-circuits on the first failing validator; `"all"` collects every error per field |
| `validate.delayError` | Milliseconds to delay error visibility after it's computed — reduces flicker on fast validators |
| `resetOptions` | Default `KeepStateOptions` applied to every `reset()` / `resetTo()` call |
| `preventDoubleSubmit` | Guards against re-entrant `submit()` while one is in flight |
| `initialValues` | Override contract defaults per field; sets `$initial` for each |
| `fn` | Customize the exposed shape — receives the full form + ctx, returns what users see |

## Return value

A `ViewModelDefinition<R>` from `@kbml-tentacles/core`. Mount it the same way as any other view model — `<View>` is the primary pattern:

```tsx
import { View, useModel } from "@kbml-tentacles/react"

function SignupFormBody() {
  const form = useModel(signupFormViewModel)
  // ...
}

function SignupScreen() {
  return (
    <View model={signupFormViewModel}>
      <SignupFormBody />
    </View>
  )
}
```

`useView(signupFormViewModel)` is an equivalent single-component form for owners with no descendants.

The VM definition exposes:

- `.create(props?)` — instantiate in current scope, returns an instance with `.shape`
- `.instantiate(propUnits)` — low-level, expects pre-wrapped unit props
- `.extend(...)` / `.normalizeProps(...)` — advanced
- Standard lifecycle: `mounted`, `unmounted`, `$mounted`

## `fn` customization

Default `fn` returns the full `FormShape`. Custom `fn` reshapes what the consumer sees:

```ts
export const signupFormViewModel = createFormViewModel({
  contract: signupContract,
  fn: (form, ctx) => {
    // Expose only a subset
    return {
      email: form.email,
      password: form.password,
      submit: form.submit,
      $isSubmitting: form.$isSubmitting,
      submitted: form.submitted,
    }
  },
})
```

Anything you return becomes the public shape; anything you omit is no longer accessible through the VM.

## `initialValues`

Per-field defaults on the contract get overridden by `initialValues`:

```ts
createFormContract()
  .field("role", (f) => f<string>().default("viewer"))

// Contract default is "viewer"; overridden here
createFormViewModel({
  contract,
  initialValues: { role: "admin" },
})
```

Both `$initial` and `$value` start at `"admin"`. `reset()` returns to `"admin"` because `$initial` wins over the contract's `$default` for reset targeting (the `$default` store still holds `"viewer"` and is what the chain declared).

## Props

Forms can have external props just like plain view models. Declare via `createPropsContract()`:

```ts
const editFormProps = createPropsContract()
  .store("user", (s) => s<UserInstance>())
  .event("onSave", (e) => e<UserInstance>())

createFormViewModel({
  contract: userFormContract,
  props: editFormProps,
  fn: (form, { props }) => {
    // Load from prop; resetTo when prop changes
    sample({
      clock: props.$user,
      target: form.resetTo,
    })
    sample({
      clock: form.submitted,
      target: props.onSave,
    })
    return form
  },
})
```

## `preventDoubleSubmit`

When `true` (default), an in-flight submit blocks further `submit()` calls until the current one resolves or rejects. Set to `false` if you want the caller to handle this manually.

The guard is inside `SubmitOrchestrator`, so third-party code that triggers the `submit` event directly is also gated.

## Throws

- If `contract` is not a finalized `FormContractChainImpl`, a `TentaclesError` throws at creation.
- If `initialValues` contain keys not declared in the contract, the extras are silently dropped (not thrown).

## See also

| Topic | Link |
|---|---|
| The chain builder | [createFormContract](/reference/forms/create-form-contract) |
| Mounting in React (primary) | [Reference: View (React)](/reference/react/view) |
| Mounting in React (single-component) | [Reference: useView (React)](/reference/react/use-view) |
| Validation triggers | [Validation modes](/reference/forms/validation-modes) |
| Reset behavior | [How-to: Reset and keep state](/how-to/reset-and-keep-state) |
