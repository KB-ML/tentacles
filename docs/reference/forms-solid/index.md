# `@kbml-tentacles/forms-solid`

SolidJS adapter for `@kbml-tentacles/forms`. A single primitive — `useField` — projects a `Field<T>` into Solid `Accessor<T>` getters, plus a `register()` shorthand for binding `<input>` directly. Reads bridge through `useUnit` from `effector-solid`, so every reactive read is a function call inside JSX (`email.value()`, `email.error()`).

— *Reference · forms-solid adapter · v0.x*

## Install

```bash
yarn add @kbml-tentacles/forms-solid @kbml-tentacles/forms @kbml-tentacles/solid @kbml-tentacles/core effector effector-solid
```

```bash
npm install @kbml-tentacles/forms-solid @kbml-tentacles/forms @kbml-tentacles/solid @kbml-tentacles/core effector effector-solid
```

## Peer dependencies

| Package | Range |
|---|---|
| `@kbml-tentacles/forms` | `workspace:*` |
| `effector` | `^23.0.0` |
| `effector-solid` | `^0.22.0` |
| `solid-js` | `>=1.8.0` |

The primitive imports `useUnit` from `effector-solid`. Solid 1.8+ is required for the same context-typing reasons as the surrounding `@kbml-tentacles/solid` adapter.

Forms are view-models. Mount them with [`<View>`](/reference/solid/view) from `@kbml-tentacles/solid` (primary pattern) — or [`useView`](/reference/solid/use-view) when a single component owns the form. `useField` reads individual fields out of the resulting shape.

## Exports

| Symbol | Kind | Purpose |
|---|---|---|
| [`useField`](/reference/forms-solid/use-field) | primitive | Bind one or many `Field<T>` units to a Solid input. |
| `UseFieldResult<T>` | type | Shape returned per field — accessors + events + `register()`. |

## Quick example

```tsx
import { View, useModel } from "@kbml-tentacles/solid";
import { useField } from "@kbml-tentacles/forms-solid";
import { loginFormViewModel } from "./login-form";

function LoginFormBody() {
  const form = useModel(loginFormViewModel);
  const [email, password] = useField([form.email, form.password]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
      <input placeholder="email" {...email.register()} />
      {email.error() && <p>{email.error()}</p>}
      <input type="password" placeholder="password" {...password.register()} />
      <button type="submit">Sign in</button>
    </form>
  );
}

export function LoginScreen() {
  return (
    <View model={loginFormViewModel}>
      <LoginFormBody />
    </View>
  );
}
```

The form itself is created by `createFormViewModel({...})` from `@kbml-tentacles/forms`; `<View>` materialises it into a `FormShape` and provides it through Solid context. Descendants call `useModel(loginFormViewModel)` to pull the shape and `useField` projects one `Field<T>` into `{ value, error, changed, register, ... }`, where every reactive entry is an `Accessor<T>`.

## Accessor calling convention

Every reactive property on `UseFieldResult<T>` is an `Accessor`. Call it as a function inside any tracking scope:

```tsx
<input value={email.value()} />
{email.error() ? <p>{email.error()}</p> : null}
{email.dirty() && <small>unsaved</small>}
```

Imperative reads (e.g. inside a one-shot event handler) are equally fine — the call returns the current value without subscribing. Inside JSX, the surrounding `createEffect` Solid sets up handles tracking.

## Array overload

`useField([form.email, form.password])` returns an ordered tuple of results in the same order as the input fields, with each entry's `T` preserved through mapped types. All subscriptions for every field route through one `useUnit(...)` call.

## See also

- [`useField` · full reference](/reference/forms-solid/use-field)
- [`@kbml-tentacles/forms`](/reference/forms/) — the contract layer this adapter reads against.
- [`Field` reference](/reference/forms/field) — the unit returned by `form.<path>`.
- [`<View>` · Solid](/reference/solid/view) — primary mount for a form view-model.
- [`useView` · Solid](/reference/solid/use-view) — single-component alternative to `<View>`.
- [`@kbml-tentacles/forms-react`](/reference/forms-react/) — the same API for React.
- [`@kbml-tentacles/forms-vue`](/reference/forms-vue/) — the same API for Vue.
- [Tutorial · Your first form](/tutorials/your-first-form)
