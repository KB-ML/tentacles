---
description: "Reference for @kbml-tentacles/forms-react: bind Tentacles form fields to React inputs."
---

# `@kbml-tentacles/forms-react`

React adapter for `@kbml-tentacles/forms`. A single hook — `useField` — binds one or more `Field<T>` units from a form view-model to React inputs, collapsing every reactive read into one `useUnit` call per component. The package adds no new runtime; it is a typed projection of the `Field<T>` shape onto React's controlled-input conventions.

— *Reference · forms-react adapter · v0.x*

## Install

```bash
yarn add @kbml-tentacles/forms-react @kbml-tentacles/forms @kbml-tentacles/react @kbml-tentacles/core effector effector-react
```

```bash
npm install @kbml-tentacles/forms-react @kbml-tentacles/forms @kbml-tentacles/react @kbml-tentacles/core effector effector-react
```

## Peer dependencies

| Package | Range |
|---|---|
| `@kbml-tentacles/forms` | `workspace:*` |
| `effector` | `^23.0.0` |
| `effector-react` | `^23.0.0` |
| `react` | `>=18.0.0` |

React 18 is required for the same reasons as `@kbml-tentacles/react`: `useSyncExternalStore` semantics and the StrictMode double-invoke contract used by the underlying form view-model's lifecycle.

Forms are view-models. Mount them with [`<View>`](/reference/react/view) from `@kbml-tentacles/react` — the recommended primary pattern — so the shape is available to every descendant via [`useModel`](/reference/react/use-model). `useField` reads individual fields out of that shape.

## Exports

| Symbol | Kind | Purpose |
|---|---|---|
| [`useField`](/reference/forms-react/use-field) | hook | Bind one or many `Field<T>` units to a React input. |
| `UseFieldResult<T>` | type | Shape returned for a controlled field (value + flags + events + `register()`). |
| `UseFieldUncontrolledResult<T>` | type | Shape returned in uncontrolled mode (ref-based, no `value`). |

## Quick example

```tsx
import { View, useModel } from "@kbml-tentacles/react";
import { useField } from "@kbml-tentacles/forms-react";
import { loginFormViewModel } from "./login-form";

function LoginFormBody() {
  const form = useModel(loginFormViewModel);
  const [email, password] = useField([form.email, form.password]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
      <input placeholder="email" {...email.register()} />
      {email.error && <p>{email.error}</p>}
      <input type="password" placeholder="password" {...password.register()} />
      <button type="submit">Sign in</button>
    </form>
  );
}

export function LoginForm() {
  return (
    <View model={loginFormViewModel}>
      <LoginFormBody />
    </View>
  );
}
```

The form itself is created by `createFormViewModel({...})` from `@kbml-tentacles/forms`; `<View>` materialises it into a `FormShape` and scopes it to the subtree. `useModel(loginFormViewModel)` reads the shape, then `useField` projects one `Field<T>` into `{ value, error, changed, register, ... }`.

## Controlled vs uncontrolled

`useField` defaults to controlled — `register()` produces `{ value, onChange, onBlur }` and the input is driven by the field's `$value` store. Passing `true` as the second argument switches to uncontrolled mode, where `register()` returns `{ ref, defaultValue, onChange, onBlur }`; the DOM owns the current value and the hook resyncs only when `$initial` changes (for reset/resetTo). Uncontrolled mode is the recommended form for large forms where re-render cost of per-keystroke subscriptions is a concern.

## Array overload

`useField([form.email, form.password])` returns an ordered tuple of results, one per input field, in the same order. The overload is typed via mapped types, so the tuple preserves each field's `T` independently. All subscriptions for every field are collapsed into a single `useUnit(...)` call — the render scope is one hook slot regardless of how many fields are passed.

## See also

- [`useField` · full reference](/reference/forms-react/use-field)
- [`@kbml-tentacles/forms`](/reference/forms/) — the contract layer this adapter reads against.
- [`Field` reference](/reference/forms/field) — the unit returned by `form.<path>`.
- [`<View>` · React](/reference/react/view) — primary way to mount a form view-model.
- [`useView` · React](/reference/react/use-view) — hook alternative when you own the instance in a single component.
- [`@kbml-tentacles/forms-vue`](/reference/forms-vue/) — the same API for Vue.
- [`@kbml-tentacles/forms-solid`](/reference/forms-solid/) — the same API for Solid.
- [Tutorial · Your first form](/tutorials/your-first-form)
