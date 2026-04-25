# @kbml-tentacles/solid

Solid adapter for [@kbml-tentacles/core](../core). Mount view-models with `<View>`, render rows with `<Each>`, and pull the current model out of context with `useModel`.

```sh
npm install effector effector-solid solid-js @kbml-tentacles/core @kbml-tentacles/solid
```

## Quick start

```tsx
import { Each, View, useModel } from "@kbml-tentacles/solid";
import { useUnit } from "effector-solid";
import { todoModel } from "./todo";
import { todoViewModel } from "./todo-view";

function TodoItem() {
  const todo = useModel(todoModel);
  const title = useUnit(todo.$title);
  const done = useUnit(todo.$done);
  return (
    <li style={{ "text-decoration": done() ? "line-through" : "none" }}>
      <input type="checkbox" checked={done()} onChange={() => todo.toggle()} />
      {title()}
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

- **`<View model={vm} props={...}>`** — mount a view-model for a subtree. Children read its shape via `useModel(vm)`.
- **`<Each model={m} source={$ids}>`** / **`<Each model={m} id={singleId}>`** / **`<Each model={m} from="refField">`** — render once per id without rebuilding fragments.
- **`useModel(modelOrViewModel)`** — pull the current `<View>` / `<Each>` instance from context. Returns Solid `Accessor`s for reactive fields when wrapped with `useUnit`.
- **`useView(definition, () => props)`** — primitive for using a view-model outside a `<View>` boundary.
- **`ScopeProvider` / `useProvidedScope`** — wire a Solid subtree to a specific effector `Scope` (useful with SSR / `effector-solid`'s scope context).

## Documentation

- Tutorial: [Solid todo app](../../docs/tutorials/solid-todo-app.md)
- How-to: [integrate with Solid](../../docs/how-to/integrate-with-solid.md)
- Reference: [`docs/reference/solid`](../../docs/reference/solid)

## Peer dependencies

- `effector ^23.0.0`
- `effector-solid ^0.23.0`
- `solid-js >=1.3.0`
- `@kbml-tentacles/core ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
