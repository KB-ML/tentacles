# `useField`

Binds one or many `Field<T>` units from a form view-model to React inputs. Returns a `value` plus the field's reactive flags (`error`, `warning`, `dirty`, `touched`, `validating`, `disabled`), the imperative events (`changed`, `blurred`), and a `register()` shorthand for spreading onto `<input>`. Every store subscription for every passed field is collapsed into a single `useUnit({...})` call.

— *Reference · forms-react adapter · useField*

## Signature

```ts
// Single field — controlled
function useField<T>(field: Field<T>): UseFieldResult<T>;

// Tuple of fields — controlled
function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
): { [K in keyof F]: F[K] extends Field<infer T> ? UseFieldResult<T> : never };

// Tuple of fields — uncontrolled (second arg `true`)
function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
  uncontrolled: true,
): {
  [K in keyof F]: F[K] extends Field<infer T> ? UseFieldUncontrolledResult<T> : never;
};
```

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `field` / `fields` | `Field<T>` or `readonly Field<any>[]` | yes | One field, or an ordered tuple. The single-field form unwraps to one `UseFieldResult`; the tuple form returns a same-length tuple. |
| `uncontrolled` | `true` | no | Switches the array overload into uncontrolled mode (DOM owns the value, syncs on `$initial` change). Only valid with the array overload. |

## Return — controlled

```ts
interface UseFieldResult<T> {
  value: T;
  error: string | null;
  warning: string | null;
  dirty: boolean;
  touched: boolean;
  validating: boolean;
  disabled: boolean;
  changed: (value: T) => void;
  blurred: () => void;
  register: () => {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    onBlur: () => void;
  };
}
```

| Property | Source | Description |
|---|---|---|
| `value` | `field.$value` | Current value as `T`. Updates on every change. |
| `error` | `field.$error` | Visible validation error (`null` if none or hidden by validation mode). |
| `warning` | `field.$warning` | Soft, non-blocking message (`null` if none). |
| `dirty` | `field.$dirty` | `true` when `$value` differs from `$initial` (deep equal). |
| `touched` | `field.$touched` | `true` after the first `blurred()`. |
| `validating` | `field.$validating` | `true` while any async validator on the field is in flight. |
| `disabled` | `field.$disabled` | Reflects `field.disable(true)` and contract-level `.disabled()`. |
| `changed(v)` | `field.changed` | Imperatively set the value. Bypasses parsing — pass `T` directly. |
| `blurred()` | `field.blurred` | Mark the field touched and trigger blur-mode validators. |
| `register()` | derived | Returns props for spreading onto a string-typed `<input>`. |

## Return — uncontrolled

```ts
interface UseFieldUncontrolledResult<T> {
  error: string | null;
  changed: (value: T) => void;
  blurred: () => void;
  register: <E extends HTMLElement = HTMLInputElement>() => {
    ref: React.RefObject<E | null>;
    defaultValue: string;
    onChange: (e: { target: { value: string } }) => void;
    onBlur: () => void;
  };
}
```

The shape is intentionally minimal: no `value`, no flag stores. The DOM owns the current value and the hook does not re-render on every keystroke. The `ref` is React's standard mutable ref; spread the entire `register()` result onto the input.

## Single-field controlled binding

```tsx
function EmailField() {
  const form = useModel(loginFormViewModel);
  const email = useField(form.email);

  return (
    <label>
      Email
      <input {...email.register()} />
      {email.error && <span role="alert">{email.error}</span>}
    </label>
  );
}
```

`register()` calls `field.changed(e.target.value)` and `field.blurred()` under the hood. The `value` it returns is `String(field.$value)`.

## Array overload

```tsx
const form = useModel(loginFormViewModel);
const [email, password, remember] = useField([
  form.email,
  form.password,
  form.remember,
]);

return (
  <>
    <input {...email.register()} />
    <input type="password" {...password.register()} />
    <input
      type="checkbox"
      checked={remember.value}
      onChange={(e) => remember.changed(e.target.checked)}
    />
  </>
);
```

The tuple is positional: index `i` of the result corresponds to `fields[i]`. Each entry preserves its own `T` so `remember.value` is `boolean` and `email.value` is `string`.

The internal implementation collapses every field's stores into a single `useUnit({ ... })` call. This keeps the component's render scope tied to one hook slot regardless of how many fields are passed — the equivalent of N separate `useField` calls would mount N hook slots and may interact poorly with conditional rendering.

## Uncontrolled mode

```tsx
const [email, password] = useField(
  [form.email, form.password],
  true,
);

return (
  <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
    <input {...email.register()} placeholder="email" />
    {email.error && <p>{email.error}</p>}
    <input type="password" {...password.register()} placeholder="password" />
  </form>
);
```

In uncontrolled mode:

- `register()` returns a `ref` you spread onto the input. React assigns the DOM node into the ref on mount.
- The DOM holds the current value; the hook does not re-render on `field.$value` changes.
- The hook subscribes to `field.$initial`. When the form is reset (`form.reset()` / `form.resetTo({...})`), the input's `value` is rewritten via `ref.current.value = String($initial)`.
- `error`, `changed`, and `blurred` are still available; only the per-keystroke value subscription is removed.

Use this mode for large forms where every keystroke would otherwise trigger a re-render of the surrounding component.

## `register()` behaviour

`register()` is **string-biased**. It is the right shorthand for text-like `<input>` and `<textarea>`. The internal contract:

| Step | Behaviour |
|---|---|
| `value` | `String(field.$value)` (or `format(field.$value)` if a transform is set). |
| `onChange(e)` | calls `field.changed(parse(e.target.value))` if a transform is set, otherwise `field.changed(e.target.value)`. |
| `onBlur()` | calls `field.blurred()`. |

For non-string fields, do not use `register()` — bind manually:

| Field type | Bind as |
|---|---|
| `Field<boolean>` | `<input type="checkbox" checked={f.value} onChange={(e) => f.changed(e.target.checked)} onBlur={f.blurred} />` |
| `Field<number>` | `<input type="number" value={f.value} onChange={(e) => f.changed(Number(e.target.value))} onBlur={f.blurred} />` |
| `Field<Date>` / objects | bind manually with explicit serialisation |
| Custom controls (e.g. shadcn) | call `f.changed(v)` from the control's `onValueChange` |

## Transform behaviour

If the form contract declares `.transform({ parse, format })` on the field, `register()` applies the transform automatically:

```ts
.field("amount", (f) => f<number>()
  .transform({
    parse: (raw: string) => Number(raw.replace(/[^\d.]/g, "")),
    format: (n: number) => n.toFixed(2),
  }))
```

```tsx
const amount = useField(form.amount);
<input {...amount.register()} />
// value rendered as "123.45" (string), parsed back to number on change.
```

The DOM only ever sees strings; the field stays typed as `number`. This is the recommended pattern for currency, percentage, masked inputs, and any input where the on-screen format differs from the stored type.

## Disabled fields

```tsx
const email = useField(form.email);
// email.disabled === true if the field has .disabled() in contract
//                 or form.disable("email") was called

<input
  {...email.register()}
  disabled={email.disabled}    // <-- caller's responsibility
/>
```

`register()` does **not** set `disabled` on the input automatically. It exposes the flag in `email.disabled` and you spread it onto the element yourself. This matches the behaviour of `value` / `onChange` — `register()` returns the bare event surface; the caller decides which props to forward.

## Edge cases

- **Same field passed twice** — `useField([form.x, form.x])` returns two independent `UseFieldResult` objects pointing at the same underlying `Field`. Calling `changed` on either fires the same event. There is no de-duplication.
- **Field from an unmounted form** — `Field` units are scope-bound. Reading from a destroyed view-model throws inside `useUnit`. Always derive fields from a form mounted by `<View>` (or `useView`) in the same component subtree.
- **Disabled fields** — `field.$disabled` is reflected in `disabled`, but `register()` does not add a `disabled` attribute. The caller spreads it explicitly.
- **Field from an array row** — `useField(form.items.$at(0).price)` works the same way; the row's lifetime is tied to the form-array model, so removing the row destroys the field.
- **Switching between controlled and uncontrolled** — the `uncontrolled` argument participates in hook identity. Toggling it across renders changes the subscription set; this is allowed but causes a re-mount of the underlying `useUnit` slot.

## Example — mixed input types

```tsx
function ProfileFormBody() {
  const form = useModel(profileFormViewModel);
  const [name, age, subscribed] = useField([
    form.name,
    form.age,
    form.subscribed,
  ]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
      <input {...name.register()} placeholder="Name" />
      {name.error && <p>{name.error}</p>}

      <input
        type="number"
        value={age.value}
        onChange={(e) => age.changed(Number(e.target.value))}
        onBlur={age.blurred}
      />
      {age.error && <p>{age.error}</p>}

      <label>
        <input
          type="checkbox"
          checked={subscribed.value}
          onChange={(e) => subscribed.changed(e.target.checked)}
          onBlur={subscribed.blurred}
        />
        Subscribe to newsletter
      </label>

      <button type="submit">Save</button>
    </form>
  );
}
```

## Example — uncontrolled with native ref

```tsx
function FocusOnMount() {
  const form = useModel(loginFormViewModel);
  const [email, password] = useField([form.email, form.password], true);

  // The ref returned by register() is a normal React ref.
  const emailProps = email.register<HTMLInputElement>();

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
      <input {...emailProps} autoFocus placeholder="email" />
      <input {...password.register()} type="password" placeholder="password" />
      <button type="submit">Sign in</button>
    </form>
  );
}
```

The hook syncs `defaultValue` from `field.$initial` and rewrites the DOM node on subsequent `$initial` changes (e.g. `form.resetTo({ email: "" })`). The component does not re-render between keystrokes.

## See also

- [`Field`](/reference/forms/field) — the underlying unit returned by `form.<path>`.
- [`@kbml-tentacles/forms-vue` · `useField`](/reference/forms-vue/use-field) — Vue equivalent.
- [`@kbml-tentacles/forms-solid` · `useField`](/reference/forms-solid/use-field) — Solid equivalent.
- [`<View>` · React](/reference/react/view) — mount the surrounding form view-model (primary pattern).
- [`useView` · React](/reference/react/use-view) — hook form for single-component ownership.
- [Tutorial · Your first form](/tutorials/your-first-form)
