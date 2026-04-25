# @kbml-tentacles/forms-solid

Solid bindings for [@kbml-tentacles/forms](../forms). Provides `useField` — a primitive that subscribes to a `Field<T>` and returns Solid `Accessor`s ready to bind to inputs.

```sh
npm install effector effector-solid solid-js @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-solid
```

## Quick start

```tsx
import { useModel, View } from "@kbml-tentacles/solid";
import { useField } from "@kbml-tentacles/forms-solid";
import { Show } from "solid-js";
import { loginForm } from "./login-form";

function LoginForm() {
  const form = useModel(loginForm);
  const email = useField(form.email);
  const password = useField(form.password);

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
      <input type="email" {...email.register()} />
      <Show when={email.error()}>{(msg) => <span>{msg()}</span>}</Show>

      <input type="password" {...password.register()} />
      <Show when={password.error()}>{(msg) => <span>{msg()}</span>}</Show>

      <button type="submit">Sign in</button>
    </form>
  );
}

export default function App() {
  return (
    <View model={loginForm}>
      <LoginForm />
    </View>
  );
}
```

## API

- **`useField(field)`** — returns `{ value, error, warning, dirty, touched, validating, disabled, changed, blurred, register }` where the reactive slots are Solid `Accessor`s.
- **`useField([f1, f2, ...])`** — batch subscription, returns a tuple. One `useUnit` under the hood.
- **`field.register()`** — `{ value, onInput, onBlur }` ready to spread on a native `<input>`.

For form-level state (`$values`, `$isValid`, `submit`, etc.) use the underlying view-model with `useModel(form)` from `@kbml-tentacles/solid` and `useUnit` from `effector-solid`.

## Documentation

- Tutorial: [your first form](../../docs/tutorials/your-first-form.md)
- Reference: [`docs/reference/forms-solid`](../../docs/reference/forms-solid)

## Peer dependencies

- `effector ^23.0.0`
- `effector-solid ^0.23.0`
- `solid-js >=1.3.0`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
