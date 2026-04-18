# `FormFieldBuilder` and `FormFieldTypedImpl`

The inner builder passed to [`.field(name, builder)`](/reference/forms/form-contract-chain#field-name-builder). `FormFieldBuilder` is callable: invoke `f<T>()` to fix the value type and obtain a `FormFieldTypedImpl<T, HD, R, W, Fields>`. Subsequent chain methods configure validation, defaults, transforms, and lifecycle.

```ts
type FormFieldBuilder<Fields = unknown> = <T>() => FormFieldTypedImpl<T, false, false, false, Fields>
```

The four boolean phantom flags track contract-time facts:

| Flag | Set by | Meaning |
|---|---|---|
| `HD` | `.default()` | Field has a default value. |
| `R` | `.required()` | Field is required. |
| `W` | `.warn()` | Field has at least one warning validator. |

Phantom flags do not affect runtime behaviour; they exist so adapters can reason about contract shape at compile time.

## Calling shape

```ts
.field("email", (f) => f<string>().required())
.field("count", (f) => f<number>().default(0))
.field("notes", (f) => f<string>().optional())
```

The builder is a function — write `f<T>()`, **not** `f.type<T>()`.

## `FormFieldTypedImpl<T, HD, R, W, Fields>` methods

All methods return `this` (sometimes with a widened phantom type) so they can be chained in any order. The descriptor is finalized only when the parent chain calls `.toDescriptor()` internally.

---

### `.default(value)`

```ts
.default(
  value: T | ((ctx: Record<string, unknown>) => T),
): FormFieldTypedImpl<T, true, R, W, Fields>
```

Sets the field's default value. Accepts a literal value or a factory function that receives a context bag (currently empty; reserved for future use). The value populates `$value`, `$default`, and `$initial` on the materialized [`Field`](/reference/forms/field).

| Parameter | Type | Description |
|---|---|---|
| `value` | `T \| ((ctx) => T)` | Static default or factory. Factory is invoked once per form instantiation. |

**Returns** the builder with `HD = true`.

```ts
.field("count",     (f) => f<number>().default(0))
.field("createdAt", (f) => f<Date>().default(() => new Date()))
```

A factory call is detected via `typeof value === "function"`. If you need to store a function as the field value itself, wrap it in an object.

---

### `.optional()`

```ts
.optional(): FormFieldTypedImpl<T | undefined, HD, R, W, Fields>
```

Widens the value type to `T | undefined`. Used in conjunction with `.required()` to express fields that are nullable in the model but conditionally required.

**Returns** the builder with `T` widened to `T | undefined`.

```ts
.field("nickname", (f) => f<string>().optional())
// resulting field type: Field<string | undefined>
```

`.optional()` does not affect default values — combine with `.default(undefined)` if you want an explicit initial `undefined`.

---

### `.disabled(initial?)`

```ts
.disabled(initial?: boolean): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Sets the field's initial `$disabled` state. Defaults to `true` if `initial` is omitted.

| Parameter | Type | Description |
|---|---|---|
| `initial` | `boolean` _(optional, default `false`)_ | Initial disabled state. Pass `true` to start disabled, `false` to start enabled. |

**Returns** the builder unchanged.

```ts
.field("submittedAt", (f) => f<Date>().disabled(true))
```

The runtime exposes `field.$disabled: Store<boolean>`. Toggle at runtime via the form-level `disable: EventCallable<boolean>` event or by manually mapping a store into `field.$disabled`.

---

### `.validate(v)`

```ts
.validate(v: SyncFieldValidator<T>): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Attaches a synchronous validator. Multiple `.validate()` calls accumulate; all run on every validation trigger. The validator may return `null`, a `string`, a `string[]`, or `ValidationIssue[]` (see [`ValidationResult`](/reference/forms/validators#validationresult)).

| Parameter | Type | Description |
|---|---|---|
| `v` | `SyncFieldValidator<T>` | `(value, ctx) => ValidationResult` or a `CustomValidator<T>`. |

**Returns** the builder unchanged.

```ts
.field("age", (f) =>
  f<number>().validate((value) => (value < 18 ? "Must be 18 or older" : null)),
)
```

Validators that need access to other fields can read them from `ctx.rootValues` (see [`ValidatorCtx`](/reference/forms/validators#validatorctx-values)) or be declared as cross-field validators on the chain via [`.validate(validator)`](/reference/forms/form-contract-chain#validate-validator).

---

### `.required(message?)`

```ts
.required(message?: string): FormFieldTypedImpl<T, HD, true, W, Fields>
```

Marks the field as required. At runtime, an empty value (`undefined`, `null`, `""`, or empty array) yields the supplied `message` (or a default) on `$error`.

| Parameter | Type | Description |
|---|---|---|
| `message` | `string` _(optional)_ | Custom error message. Defaults to a generic "required" message. |

**Returns** the builder with `R = true`.

```ts
.field("email", (f) => f<string>().required("Email is required"))
.field("acceptedTerms", (f) => f<boolean>().required())
```

Required is enforced by the validation runner alongside other sync validators. It does not add a TypeScript constraint; widen with `.optional()` if the runtime allows missing values during editing.

---

### `.custom(fn)`

```ts
.custom(
  fn: (value: T, ctx: ValidatorCtx<Fields>) => ValidationResult,
): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Equivalent to `.validate(fn)` but with a more strongly-typed `ctx.values` (typed as `Fields`, the parent form's accumulated field shape). Use `.custom()` when the validator needs to read sibling fields with full type inference.

| Parameter | Type | Description |
|---|---|---|
| `fn` | `(value, ctx) => ValidationResult` | Custom sync validator with parent-typed `ctx.values`. |

**Returns** the builder unchanged.

```ts
.field("confirmPassword", (f) =>
  f<string>().custom((value, ctx) =>
    value === ctx.values.password ? null : "Passwords must match",
  ),
)
```

Internally `.custom()` is stored in the same array as `.validate()`; the only difference is the typing of `ctx`.

---

### `.warn(v)`

```ts
.warn(v: SyncFieldValidator<T>): FormFieldTypedImpl<T, HD, R, true, Fields>
```

Attaches a non-blocking warning validator. Warnings populate `$warning: Store<string | null>` on the field and never affect `$isValid` or block submission.

| Parameter | Type | Description |
|---|---|---|
| `v` | `SyncFieldValidator<T>` | Warning validator. Same shape as `.validate()`. |

**Returns** the builder with `W = true`.

```ts
.field("password", (f) =>
  f<string>().warn((value) => (value.length < 12 ? "Consider a longer password" : null)),
)
```

Warnings are displayed independently of errors — both `$error` and `$warning` may be non-null at the same time.

---

### `.validateAsync(fn, opts?)`

```ts
.validateAsync(
  fn: AsyncFieldValidator<T>,
  opts?: { debounce?: number; runOn?: ValidationMode },
): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Attaches an asynchronous validator. The runner debounces invocations per validator, cancels in-flight promises via `ctx.signal`, and tracks `$validating: Store<boolean>` on the field.

| Parameter | Type | Description |
|---|---|---|
| `fn` | `AsyncFieldValidator<T>` | `(value, ctx) => Promise<ValidationResult>` or a `CustomAsyncValidator<T>`. |
| `opts.debounce` | `number` _(optional)_ | Milliseconds to debounce. Defaults to `0`. |
| `opts.runOn` | [`ValidationMode`](/reference/forms/validation-modes) _(optional)_ | Override the trigger for this async validator. Defaults to the form's mode. |

**Returns** the builder unchanged.

```ts
.field("username", (f) =>
  f<string>().validateAsync(
    async (value, ctx) => {
      const res = await fetch(`/api/check?u=${value}`, { signal: ctx.signal })
      const { available } = await res.json()
      return available ? null : "Username taken"
    },
    { debounce: 300 },
  ),
)
```

Async errors merge with sync errors in `$error`. Concurrent calls for the same field abort the previous one via `AbortController`.

---

### `.validateOn(mode)`

```ts
.validateOn(mode: ValidationMode): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Overrides the form-level [`mode`](/reference/forms/validation-modes) for this field's first-time validation trigger. Affects all validators on the field — sync, async, required, custom.

| Parameter | Type | Description |
|---|---|---|
| `mode` | [`ValidationMode`](/reference/forms/validation-modes) | One of `"submit" \| "blur" \| "change" \| "touched" \| "all"`. |

**Returns** the builder unchanged.

```ts
.field("email", (f) => f<string>().required().validateOn("blur"))
```

When omitted, the field inherits the form-level `validate.mode` from [`createFormViewModel({ validate })`](/reference/forms/create-form-view-model).

---

### `.reValidateOn(mode)`

```ts
.reValidateOn(mode: ReValidationMode): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Overrides the form-level [`reValidate`](/reference/forms/validation-modes) trigger for this field. `reValidate` controls when validation re-runs after the field has already produced an error — typically more aggressive than the first-time `validateOn` mode.

| Parameter | Type | Description |
|---|---|---|
| `mode` | [`ReValidationMode`](/reference/forms/validation-modes) | One of `"change" \| "blur" \| "submit"`. |

**Returns** the builder unchanged.

```ts
.field("email", (f) =>
  f<string>().required().validateOn("blur").reValidateOn("change"),
)
```

When omitted, the field inherits the form-level `validate.reValidate`.

---

### `.dependsOn(paths)`

```ts
.dependsOn(paths: string | string[]): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Declares additional fields whose changes should re-trigger this field's validation. Paths are dotted strings relative to the form root (e.g. `"address.city"`). Unknown paths throw via the contract-utility strategy when used in `pick` / `omit` (unless `dropDangling` is set).

| Parameter | Type | Description |
|---|---|---|
| `paths` | `string \| string[]` | One or more field paths. Multiple `.dependsOn()` calls accumulate. |

**Returns** the builder unchanged.

```ts
.field("password", (f) => f<string>().required())
.field("confirm", (f) =>
  f<string>().required().dependsOn("password").custom((value, ctx) =>
    value === ctx.values.password ? null : "Passwords must match",
  ),
)
```

Dependencies are wired into the validation runner's inverted graph — one `sample()` per unique upstream path, even if multiple fields depend on it.

---

### `.transform({ parse, format })`

```ts
.transform<DomValue>(t: {
  parse: (dom: DomValue) => T
  format: (value: T) => DomValue
}): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Attaches a bidirectional transform between the field's stored value type `T` and a separate `DomValue` representation. Adapters (e.g. [`useField`](/reference/forms-react/use-field)) honour the transform when wiring `<input>` elements.

| Parameter | Type | Description |
|---|---|---|
| `t.parse` | `(dom) => T` | Convert a DOM-side value (typically `string`) into the stored type. |
| `t.format` | `(value) => DomValue` | Convert the stored type into a DOM-side value. |

**Returns** the builder unchanged. The transform is exposed on the runtime field as `field.__transform`.

```ts
.field("birthDate", (f) =>
  f<Date>()
    .default(new Date())
    .transform<string>({
      parse: (s) => new Date(s),
      format: (d) => d.toISOString().slice(0, 10),
    }),
)
```

Only the most recent `.transform()` call wins. The transform never runs inside the contract — it is invoked by adapters or by manually reading `field.__transform`.

---

### `.resetOn(events)`

```ts
.resetOn(events: string | string[]): FormFieldTypedImpl<T, HD, R, W, Fields>
```

Names form-level events that should reset this field to its `$default`. Multiple `.resetOn()` calls accumulate.

| Parameter | Type | Description |
|---|---|---|
| `events` | `string \| string[]` | Event name(s) declared elsewhere on the form (e.g. via the `fn` builder of [`createFormViewModel`](/reference/forms/create-form-view-model)). |

**Returns** the builder unchanged.

```ts
.field("scratchpad", (f) => f<string>().default("").resetOn("clearScratch"))
```

The reset wiring is applied during runtime materialization; events that do not exist on the runtime context are silently ignored.

---

## Reserved field names

Field, sub-form, and array names are validated by the parent chain. See [Reserved entity names](/reference/forms/create-form-contract#reserved-entity-names) for the full list.

## Field descriptor shape

Internally, each `.toDescriptor()` call (invoked by the parent chain's `.field()`) produces:

```ts
interface FormFieldDescriptor {
  readonly kind: "field"
  readonly defaultValue: unknown
  readonly hasDefault: boolean
  readonly isFactory: boolean
  readonly isOptional: boolean
  readonly isDisabled: boolean
  readonly syncValidators: SyncFieldValidator[]
  readonly required: { flag: boolean; message?: string }
  readonly warnValidators: SyncFieldValidator[]
  readonly asyncValidators: AsyncValidatorEntry[]
  readonly validateOn: ValidationMode | null
  readonly reValidateOn: ReValidationMode | null
  readonly dependsOn: string[]
  readonly transform: { parse: Function; format: Function } | null
  readonly resetOn: string[]
}
```

Application code does not normally interact with the descriptor directly. Adapters and contract utilities read it via [`.getFieldDescriptors()`](/reference/forms/form-contract-chain#getfielddescriptors) on the parent chain.

## See also

- [`FormContractChainImpl.field`](/reference/forms/form-contract-chain#field-name-builder) — how this builder is invoked.
- [Validators](/reference/forms/validators) — `SyncFieldValidator`, `AsyncFieldValidator`, `CustomValidator`, `ValidatorCtx`, `ValidationResult`.
- [Validation modes](/reference/forms/validation-modes) — `ValidationMode`, `ReValidationMode`, defaults.
- [`Field`](/reference/forms/field) — the runtime surface that this builder describes.
- [`useField`](/reference/forms-react/use-field) — React adapter that consumes `field.__transform`.
