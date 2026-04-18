# `<View>`

**Primary way to mount a view-model.** Instantiates a `ViewModelDefinition`, provides its shape to every descendant via React context, and uses `lifecycle.unmount()` on cleanup rather than `lifecycle.destroy()` — making the component StrictMode-safe: the effector region survives the simulated unmount-remount that React performs in development. Prefer `<View>` over [`useView`](./use-view); reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

— *Reference · React adapter · View*

## Signature

```ts
function View<Shape>(props: ViewProps<Shape>): JSX.Element;

interface ViewProps<Shape> {
  model: ViewModelDefinition<Shape>;
  props?: Record<string, unknown>;
  children?: ReactNode;
}
```

## Props

| Name | Type | Required | Description |
|---|---|---|---|
| `model` | `ViewModelDefinition<Shape>` | yes | The definition to instantiate. Stable identity expected across renders. |
| `props` | `Record<string, unknown>` | no | Raw props passed to the instance. Same normalisation rules as `useView`. |
| `children` | `ReactNode` | no | Subtree that may read the shape via `useModel(model)`. |

## Behaviour

`<View>` internally instantiates the model on first render, provides the shape via a React context keyed by the definition, and forwards `props` to the instance on every render. Descendants call `useModel(definition)` to read the shape.

```tsx
<View model={loginViewModel} props={{ onSubmit: handleSubmit }}>
  <EmailField />
  <PasswordField />
  <SubmitButton />
</View>
```

## Lifecycle

| Phase | Effect |
|---|---|
| First render | `definition.create(props)` |
| Every render | `props` forwarded to the instance in `useLayoutEffect`. |
| After first commit | `lifecycle.mount()` fires once. |
| Unmount cleanup | `lifecycle.unmount()` — region is preserved, external stores retained. |

## StrictMode

In React 18+ development, StrictMode mounts and immediately unmounts every component to surface side-effect bugs. With `useView` + `lifecycle.destroy`, the region would be torn down and recreated, losing any transient state. `<View>` uses `lifecycle.unmount` instead: the region stays alive, props are re-applied, and the second mount reuses the same instance.

| Hook vs component | Cleanup method | StrictMode-safe? |
|---|---|---|
| `useView` | `lifecycle.destroy` | no (fresh instance on remount) |
| `<View>` | `lifecycle.unmount` | yes (instance preserved) |

`<View>` is the default choice. Use `useView` only for single-owner components with no descendants that need `useModel` — where recreation on StrictMode double-mount is acceptable.

## Context

`<View>` provides the shape through an internal context whose key is the `ViewModelDefinition` itself. Nesting two `<View>`s with different definitions produces two independent contexts; `useModel(vm)` resolves to the *nearest* `<View>` whose `model` matches by identity.

```tsx
<View model={outerVM}>
  <View model={innerVM}>
    <Consumer /> {/* useModel(innerVM) resolves inner; useModel(outerVM) resolves outer */}
  </View>
</View>
```

## Prop normalisation

Identical to `useView`:

- store prop + plain value → wrapped in a writable store, synced on every render.
- store prop + `Store<T>` → passed through.
- event prop + function → wrapped in an effector event, latest callback held via `useRef`.
- event prop + `EventCallable<T>` → passed through.

## Example

```tsx
function LoginPage() {
  return (
    <View model={loginViewModel} props={{ onSuccess: navigate }}>
      <LoginForm />
    </View>
  );
}

function LoginForm() {
  const form = useModel(loginViewModel);
  const [submitting] = useUnit([form.$isSubmitting]);
  return <button disabled={submitting}>Sign in</button>;
}
```

## Edge cases

- Swapping the `model` prop destroys the previous instance and creates a new one. Do not recreate `ViewModelDefinition` inside render.
- Providing two `<View>`s with the *same* definition creates two independent instances. `useModel(vm)` reads from the innermost one.
- If no descendant reads the shape, the context is still created; the overhead is one React context per `<View>`.
- `<View>` does not forward DOM props; it renders only `children` without a wrapper element.

## See also

- [`useView`](./use-view) — the hook form without context provision.
- [`useModel`](./use-model) — overload 1 reads the `<View>` context.
- [`<Each>`](./each) — the iteration counterpart for models.
