# @kbml-tentacles/react

React adapter for [@kbml-tentacles/core](../core). Mount view-models with `<View>`, render rows with `<Each>`, and pull the current model out of context with `useModel`.

```sh
npm install effector effector-react @kbml-tentacles/core @kbml-tentacles/react
```

## Quick start

```tsx
import { Each, View, useModel } from "@kbml-tentacles/react";
import { useUnit } from "effector-react";
import { todoModel } from "./todo";
import { todoViewModel } from "./todo-view";

function TodoItem() {
  const todo = useModel(todoModel);
  const [title, done] = useUnit([todo.$title, todo.$done]);
  return (
    <li style={{ textDecoration: done ? "line-through" : "none" }}>
      <input type="checkbox" checked={done} onChange={todo.toggle} />
      {title}
    </li>
  );
}

export function App() {
  return (
    <View model={todoViewModel}>
      <ul>
        <Each model={todoModel} source={todoModel.$ids}>
          <TodoItem />
        </Each>
      </ul>
    </View>
  );
}
```

## API

- **`<View model={vm} props={...}>`** — mount a view-model for a subtree. Children read its shape via `useModel(vm)`. Props are normalized: store props accept `T | Store<T>`, event props accept `(payload) => void | EventCallable<T>`.
- **`<Each model={m} source={$ids}>`** / **`<Each model={m} id={singleId}>`** / **`<Each model={m} from="refField">`** — render once per id without re-creating subtrees. The descendant `useModel(m)` resolves to the current row.
- **`useModel(modelOrViewModel)`** — pull the current `<View>` / `<Each>` instance from context.
- **`useView(definition, props?)`** — escape hatch when you need a view-model instance inside a hook instead of a JSX scope.

## Documentation

- Tutorial: [React todo app](../../docs/tutorials/react-todo-app.md)
- How-to: [integrate with React](../../docs/how-to/integrate-with-react.md)
- Reference: [`docs/reference/react`](../../docs/reference/react)

## Peer dependencies

- `effector ^23.0.0`
- `effector-react ^23.0.0`
- `react >=16.8.0 <20.0.0`
- `@kbml-tentacles/core ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
