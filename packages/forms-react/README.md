# @kbml-tentacles/forms-react

React bindings for [@kbml-tentacles/forms](../forms). Provides `useField` — a single hook with controlled and uncontrolled modes that subscribes to a `Field<T>` and returns just the slice React needs to render an input.

```sh
npm install effector effector-react react @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-react
```

## Quick start

```tsx
import { useModel, View } from "@kbml-tentacles/react";
import { useField } from "@kbml-tentacles/forms-react";
import { loginForm } from "./login-form";

function LoginForm() {
  const form = useModel(loginForm);
  const email = useField(form.email);
  const password = useField(form.password);

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
      <input type="email" {...email.register()} />
      {email.error && <span>{email.error}</span>}

      <input type="password" {...password.register()} />
      {password.error && <span>{password.error}</span>}

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

- **`useField(field)`** — controlled subscription. Returns `{ value, error, warning, dirty, touched, validating, disabled, changed, blurred, register }`.
- **`useField([f1, f2, ...])`** — batch subscription, returns a tuple. One `useUnit` under the hood, no extra renders.
- **`useField(fields, true)`** — uncontrolled mode for performance-critical inputs. `register()` returns `{ ref, defaultValue, onChange, onBlur }` so React doesn't re-render on every keystroke.

For form-level state (`$values`, `$isValid`, `submit`, etc.) use the underlying view-model with `useModel(form)` from `@kbml-tentacles/react` and `useUnit` from `effector-react`.

## Documentation

- Tutorial: [your first form](../../docs/tutorials/your-first-form.md)
- Reference: [`docs/reference/forms-react`](../../docs/reference/forms-react)

## Peer dependencies

- `effector ^23.0.0`
- `effector-react ^23.0.0`
- `react >=16.8.0 <20.0.0`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
