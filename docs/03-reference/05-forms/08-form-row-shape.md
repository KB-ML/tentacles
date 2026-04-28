---
description: "Reference for FormRowShape: row-specific helpers on top of FormShape inside a form array."
---

# FormRowShape

A single row of a `FormArrayShape`. Extends `FormShape<Row>` — every aggregate, every control event, every lifecycle event that a top-level form has is also available per row. Adds four row-specific members.

```ts
interface FormRowShape<Row> extends FormShape<Row> {
  readonly key: string | number
  readonly index: Store<number>
  readonly arrayRef: FormArrayShape<Row>
  readonly remove: EventCallable<void>
}
```

## Row-specific members

### `key: string | number`

Stable identifier for the row. Comes from:

1. The `FormArrayOptions.key` function if declared, or
2. The synthetic `__rowId` autoincrement otherwise.

`key` survives reorders, so use it as the React/Vue/Solid list key.

### `index: Store<number>`

The row's current position. Reactive — re-sampled after `move` / `swap` / `remove`.

```ts
useUnit(row.index)  // current 0-based position
```

### `arrayRef: FormArrayShape<Row>`

Back-reference to the parent array. Useful for invoking array-level operations from inside a row's component:

```tsx
function ContactEditor({ row }: { row: FormRowShape<Contact> }) {
  return (
    <>
      <input {...useField(row.name).register()} />
      <button onClick={() => row.arrayRef.move({ from: row.index.getState(), to: 0 })}>
        Move to top
      </button>
    </>
  )
}
```

### `remove: EventCallable<void>`

Sugar for `arrayRef.removeKey(row.key)`. Removes this specific row.

```tsx
<button onClick={() => row.remove()}>Delete</button>
```

Prefer `row.remove()` over `arrayRef.remove(row.index.getState())` — the latter races with reorders.

## Inherited surface

Everything on `FormShape<Row>` is available:

- Aggregates: `$values`, `$errors`, `$isValid`, `$isDirty`, `$isTouched`, `$isValidating`, `$dirtyFields`, `$touchedFields`, `$validatingFields`, `$formError`, `$disabled`.
- Submission: `submit`, `$isSubmitting`, `$isSubmitted`, `$isSubmitSuccessful`, `$submitCount`, `submitted`, `rejected`.
- Control: `setValue`, `setValues`, `setError`, `setErrors`, `clearErrors`, `setFormError`, `validate`, `disable`, `reset`, `resetTo`, `resetCompleted`.
- Field access: `row.email`, `row.address.city`, etc. — same shapes as on the top-level form.

### Row-level `submit`?

`submit` exists on `FormRowShape` for API symmetry, but it doesn't send anything anywhere — there's no "row endpoint". What it does:

- Runs the row's validators
- Fires the row's `submitted` / `rejected` event

Useful if you want per-row validation before adding a new row, or for inline-editing workflows.

## Metadata

- `__path: readonly (string | number)[]` — e.g. `["contacts", 2]` for the row at index 2 of `contacts`.
- `kind: "form"` — same as a top-level form, because every row IS a form.

## Accessing from the array

Three ways to get a `FormRowShape`:

```ts
// By index, reactively
useUnit(form.contacts.$at(0))   // FormRowShape<Contact> | null

// Iterate reactively via <Each>
<Each model={form.contacts} source={form.contacts.$ids}>
  {(row) => <ContactEditor row={row} />}
</Each>

// Imperative lookup by __rowId
form.contacts.get(rowId)   // from the model-API spread
```

## Per-row reset vs array-level `clear`

- `row.reset()` — back to row defaults; row still exists
- `row.resetTo(values)` — set new `$initial` for this row
- `row.remove()` — delete this row from the array
- `arrayRef.clear()` — remove every row

## See also

| Topic | Link |
|---|---|
| The array shape this belongs to | [FormArrayShape](/reference/forms/form-array-shape) |
| What `FormShape` exposes | [FormShape](/reference/forms/form-shape) |
| Iterating rows | [How-to: Work with form arrays](/how-to/work-with-form-arrays) |
| Why rows are model instances | [Explanation: Form arrays as models](/explanation/form-arrays-as-models) |
