---
description: "Build dynamic form arrays (append/remove/reorder) with model-backed rows and efficient reactivity."
---

# Work with form arrays

Render a list the user can grow, shrink, reorder, and edit row-by-row — contacts, line items, addresses — backed by a real `@kbml-tentacles/core` model so reactivity stays incremental even at hundreds of rows.

| If you want to… | Reach for |
|---|---|
| Add a new row at the end | `array.append(row?)` |
| Insert at a specific position | `array.insert({ index, value })` |
| Drop a single row | `array.remove(index)` or row's own `row.remove()` |
| Reorder rows | `array.move({ from, to })` / `array.swap({ a, b })` |
| Replace the whole list | `array.replace(rows)` / `array.clear()` |
| Read a row reactively | `array.$at(index)` |
| Constrain row count | `min` / `max` on the contract |

## Declare the array

`.array(name, rowContract, opts?)` declares a repeating section. The row contract is itself a `createFormContract()` chain — the row gets its own validation, its own dirty/touched state, and its own reset.

```ts
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms"

const ContactContract = createFormContract()
  .field("name",  (f) => f<string>().default("").required())
  .field("phone", (f) => f<string>().default("").required())
  .field("primary", (f) => f<boolean>().default(false))

const DirectoryContract = createFormContract()
  .field("label", (f) => f<string>().default(""))
  .array("contacts", ContactContract, {
    min: 1,
    max: 25,
    key: (row) => row.phone,
  })

export const directoryFormViewModel = createFormViewModel({
  contract: DirectoryContract,
})
```

`min` and `max` are enforced at the operations layer — `append` past `max` is a no-op, removing the last row when `min === 1` writes a message to `$arrayError` instead of removing it. The `key` option is used by the `<Each>` renderer to keep DOM nodes paired with their rows across reorders. Provide a column name (`"phone"`) or a function `(row) => string`.

Under the hood `formContractToModelContract()` (in `packages/forms/src/runtime/form-contract-to-model-contract.ts`) emits a model contract with a synthetic `__rowId` autoincrement primary key, then builds a `@kbml-tentacles/core` Model from it. Every row is a model instance — its `fn` returns a `FormRowShape<Row>`.

## Iterate with `<Each>`

Because the array IS a model, you render it with the framework's `<Each>` component. Pass the array as `model` and its `$ids` store as `source`.

```tsx
// React — Vue/Solid versions are identical in spirit
import { Each, View, useModel } from "@kbml-tentacles/react"
import { useField } from "@kbml-tentacles/forms-react"

function DirectoryBody() {
  const form = useModel(directoryFormViewModel)

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit() }}>
      <Each model={form.contacts} source={form.contacts.$ids}>
        {(row) => <ContactRow row={row} />}
      </Each>

      <button type="button" onClick={() => form.contacts.append()}>
        Add contact
      </button>
    </form>
  )
}

export function DirectoryView() {
  return (
    <View model={directoryFormViewModel}>
      <DirectoryBody />
    </View>
  )
}

function ContactRow({ row }: { row: FormRowShape<{ name: string; phone: string; primary: boolean }> }) {
  const { name, phone } = row
  const [n, p] = useField([name, phone])

  return (
    <fieldset>
      <input {...n.register()} placeholder="Name" />
      <input {...p.register()} placeholder="Phone" />
      <button type="button" onClick={() => row.remove()}>Remove</button>
    </fieldset>
  )
}
```

Two details worth noticing:

- `<Each>` resolves the row instance from the model and passes the `FormRowShape<Row>` straight into the children — no manual lookup.
- `row.remove()` is the per-row event that removes *this* row. The array-level `array.remove(index)` works too, but you usually do not have an index handy in the row component.

The same component works in Vue and Solid with a different `useField` import — see [Integrate with Vue](/how-to/integrate-with-vue) and [Integrate with Solid](/how-to/integrate-with-solid).

## Operations cheatsheet

Every operation is an `EventCallable` — you invoke it like any effector event.

```ts
form.contacts.append()                                // empty row at the end
form.contacts.append({ name: "Ada", phone: "555-0100" })
form.contacts.append([row1, row2])                    // many at once

form.contacts.prepend({ name: "Grace" })

form.contacts.insert({ index: 2, value: { name: "Ada" } })
form.contacts.insert({ index: 0, value: [a, b] })

form.contacts.remove(3)
form.contacts.remove([0, 2, 5])                       // multi-remove
form.contacts.remove()                                // wipe all rows

form.contacts.removeKey("alice@example.com")          // remove by stable key

form.contacts.move({ from: 4, to: 1 })
form.contacts.swap({ a: 0, b: 3 })

form.contacts.update({ index: 0, value: { primary: true } })
form.contacts.replace([{ name: "Bob" }])
form.contacts.clear()
```

`update` accepts a partial row — only the fields you pass are written; the rest keep their current values. `replace` replaces every row with the supplied list and resets internal indexes.

`appended`, `removed`, and so on are not separate events — you observe array changes by watching `form.contacts.$values`, `form.contacts.$ids`, or `form.contacts.$count` (the last comes from the underlying model and is not declared on `FormArrayShape` but exists at runtime).

## Read a single row with `$at(index)`

`$at(index)` returns a `Store<FormRowShape<Row> | null>` — `null` when the index is out of bounds, the row shape otherwise. Use it when you need a positional reference (the first row, the last row, the row currently selected) rather than iterating.

```ts
import { combine } from "effector"

const $first = form.contacts.$at(0)
const $hasFirstError = combine($first, (row) =>
  row !== null ? row.$isValid.getState() === false : false,
)
```

`$at` is reactive — the returned store updates whenever the array shifts. Holding `$at(0)` across an `insert({ index: 0, … })` returns a different row instance after the insert, which is usually what you want.

For random access by stable key rather than position, use the model APIs spread onto the array: `form.contacts.get(rowId)` returns a `FormRowShape<Row>` directly. The row id is whatever the synthetic `__rowId` autoincrement assigned (or your custom `key` if you provided one).

## Aggregates roll up automatically

The array exposes the same vocabulary as a regular form, scoped to its rows:

| Store | Meaning |
|---|---|
| `array.$values` | `Row[]` snapshot of all rows |
| `array.$errors` | `(DeepErrors<Row> \| null)[]` aligned with `$values` |
| `array.$isValid` | `false` if any row's `$isValid` is `false` or `$arrayError` is set |
| `array.$isDirty` | `true` if any row is dirty or rows were added/removed |
| `array.$isTouched` | `true` if any field in any row was touched |
| `array.$isValidating` | `true` while any row's async validators are running |
| `array.$arrayError` | Set by the runner when `min`/`max` is violated |

The root form's `$isValid`, `$isDirty`, etc. aggregate across nested arrays automatically — you do not need to wire anything by hand.

## `$arrayError` for whole-array constraints

Validations that apply to the array as a whole — minimum size, no duplicates, sum constraint — should write to `$arrayError`. The cleanest way is a chain-level `.validate()` on the parent contract that returns a `path` pointing at the array.

```ts
const DirectoryContract = createFormContract()
  .array("contacts", ContactContract, { min: 1, max: 25 })
  .validate((values) => {
    const phones = values.contacts.map((c) => c.phone)
    const dup = phones.find((p, i) => p && phones.indexOf(p) !== i)
    return dup
      ? { path: ["contacts"], message: `Duplicate phone: ${dup}` }
      : null
  })
```

`min` / `max` violations — declared in the array options — write to `$arrayError` automatically; you do not need to handle those by hand. `$arrayError` is independent of per-row `$errors`. A row may be valid while the whole list is not (too few rows), and vice versa.

## `row.remove()` versus `array.remove(index)`

Two ways to drop a row, with different idioms:

- `row.remove()` — call this from inside the row component when you do not have an index. It always removes the right row regardless of reordering, because the row knows its own identity.
- `array.remove(index)` — call this from outside (a "remove last" button, a bulk delete) when you have a numeric position.
- `array.removeKey(key)` — call this when you only have a stable identifier (the email, the SKU) and not the index. Requires `key` to be configured on the array contract.

All three honour `min` — removing the last allowed row writes to `$arrayError` and leaves the row in place.

## Performance notes

Form arrays scale to thousands of rows because of two design choices:

1. Each row is a `@kbml-tentacles/core` model instance. Per-instance cost without `.on()` registration is near zero (see `packages/core/layers/model/field-proxy.ts:1` for the proxy pattern).
2. The renderer reads `$ids` and resolves rows by id, so adding one row at the end performs one DOM mount, not a full re-render.

Heavy interactions to avoid:

- Calling `array.replace(allRows)` on every keystroke instead of `update({ index, value })` — `replace` rebuilds every row.
- Subscribing to `array.$values` from a parent component just to derive the count — read `array.$count` instead and let the children own their own state.
- Putting expensive computation in the row's `<Each>` children without memoization — every row evaluates them.

## See also

| Page | What it covers |
|---|---|
| [Define a form contract](/how-to/define-a-form-contract) | `.array()` syntax and `key` option |
| [Form array shape reference](/reference/forms/form-array-shape) | Full type definitions of operations |
| [Each component reference](/reference/react/each) | How `<Each>` resolves rows from a model |
| [Cross-field validation](/how-to/cross-field-validation) | Validating across rows of an array |
