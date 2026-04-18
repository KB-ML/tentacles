import { afterEach, describe, expect, it } from "vitest";
import { createContract, createModel } from "@kbml-tentacles/core";
import { createEvent, createStore } from "effector";
import { useUnit } from "effector-react";
import { render, cleanup, act, screen } from "@testing-library/react";
import { Each, useModel } from "../index";

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTodoModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>().default(false))
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $title, $done }) => ({ $id, $title, $done }),
  });
}

function makeTreeModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("children", "many")
    .ref("parent", "one")
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $name, children, parent }) => ({ $id, $name, children, parent }),
  });
}

function makeCategoryTodoModels() {
  const catContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("todos", "many")
    .pk("id");

  const catModel = createModel({
    contract: catContract,
    fn: ({ $id, $name, todos }) => ({ $id, $name, todos }),
  });

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .inverse("category", "todos")
    .pk("id");

  const todoModel = createModel({
    contract: todoContract,
    fn: ({ $id, $title, $category }) => ({ $id, $title, $category }),
  });

  catModel.bind({ todos: () => todoModel });
  todoModel.bind({ category: () => catModel });

  return { catModel, todoModel };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7.1 Basic iteration
// ─────────────────────────────────────────────────────────────────────────────

describe("basic iteration", () => {
  it("renders correct number of items from source={$ids}", () => {
    const model = makeTodoModel();
    model.create({ id: "1", title: "A" });
    model.create({ id: "2", title: "B" });
    model.create({ id: "3", title: "C" });

    function Item() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="item">{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>,
    );

    expect(screen.getAllByTestId("item")).toHaveLength(3);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();

    model.clear();
  });

  it("each item receives correct instance via useModel", () => {
    const model = makeTodoModel();
    model.create({ id: "x", title: "X-Title" });
    model.create({ id: "y", title: "Y-Title" });

    function Item() {
      const todo = useModel(model);
      const id = useUnit(todo.$id);
      const title = useUnit(todo.$title);
      return <div data-testid={`item-${id}`}>{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>,
    );

    expect(screen.getByTestId("item-x").textContent).toBe("X-Title");
    expect(screen.getByTestId("item-y").textContent).toBe("Y-Title");

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.2 Add/remove
// ─────────────────────────────────────────────────────────────────────────────

describe("add/remove", () => {
  it("adding an ID mounts a new item", () => {
    const model = makeTodoModel();
    model.create({ id: "1", title: "First" });

    function Item() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="item">{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>,
    );

    expect(screen.getAllByTestId("item")).toHaveLength(1);

    act(() => {
      model.create({ id: "2", title: "Second" });
    });

    expect(screen.getAllByTestId("item")).toHaveLength(2);
    expect(screen.getByText("Second")).toBeTruthy();

    model.clear();
  });

  it("removing an ID unmounts that item", () => {
    const model = makeTodoModel();
    model.create({ id: "a", title: "Alpha" });
    model.create({ id: "b", title: "Beta" });

    function Item() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="item">{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>,
    );

    expect(screen.getAllByTestId("item")).toHaveLength(2);

    act(() => {
      model.delete("a");
    });

    expect(screen.getAllByTestId("item")).toHaveLength(1);
    expect(screen.getByText("Beta")).toBeTruthy();

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.3 useModel direct
// ─────────────────────────────────────────────────────────────────────────────

describe("useModel direct", () => {
  it("returns instance by static ID", () => {
    const model = makeTodoModel();
    model.create({ id: "d1", title: "Direct" });

    // Separate component to avoid conditional useUnit in View
    function TitleOrNull({ todo }: { todo: unknown }) {
      if (!todo) return <div data-testid="result">null</div>;
      const title = useUnit((todo as ReturnType<typeof model.getSync> & {}).$title);
      return <div data-testid="result">{title}</div>;
    }

    function View() {
      const todo = useModel(model, "d1");
      return <TitleOrNull todo={todo} />;
    }

    render(<View />);
    expect(screen.getByTestId("result").textContent).toBe("Direct");

    model.clear();
  });

  it("returns null for non-existent ID", () => {
    const model = makeTodoModel();

    function View() {
      const todo = useModel(model, "nope");
      return <div data-testid="result">{todo ? "found" : "null"}</div>;
    }

    render(<View />);
    expect(screen.getByTestId("result").textContent).toBe("null");
  });

  it("reactive $id updates when store changes", () => {
    const model = makeTodoModel();
    model.create({ id: "r1", title: "React-1" });
    model.create({ id: "r2", title: "React-2" });

    const selectEvt = createEvent<string | null>();
    const $selected = createStore<string | null>("r1").on(selectEvt, (_, v) => v);

    function TitleOrNull({ todo }: { todo: unknown }) {
      if (!todo) return <div data-testid="result">null</div>;
      const title = useUnit((todo as ReturnType<typeof model.getSync> & {}).$title);
      return <div data-testid="result">{title}</div>;
    }

    function View() {
      const todo = useModel(model, $selected);
      return <TitleOrNull todo={todo} />;
    }

    render(<View />);
    expect(screen.getByTestId("result").textContent).toBe("React-1");

    act(() => selectEvt("r2"));
    expect(screen.getByTestId("result").textContent).toBe("React-2");

    act(() => selectEvt(null));
    expect(screen.getByTestId("result").textContent).toBe("null");

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.4 from resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("from resolution", () => {
  it("resolves ref from parent context", () => {
    const { catModel, todoModel } = makeCategoryTodoModels();

    catModel.create({
      id: "cat1",
      name: "Work",
      todos: {
        create: [
          { id: "t1", title: "Review" },
          { id: "t2", title: "Deploy" },
        ]
      },
    });

    function TodoItem() {
      const todo = useModel(todoModel);
      const title = useUnit(todo.$title);
      return <div data-testid="todo">{title}</div>;
    }

    function CatView() {
      const cat = useModel(catModel);
      const name = useUnit(cat.$name);
      return (
        <div>
          <div data-testid="cat">{name}</div>
          <Each model={todoModel} from="todos">
            <TodoItem />
          </Each>
        </div>
      );
    }

    render(
      <Each model={catModel} source={catModel.$ids}>
        <CatView />
      </Each>,
    );

    expect(screen.getByTestId("cat").textContent).toBe("Work");
    expect(screen.getAllByTestId("todo")).toHaveLength(2);

    catModel.clear();
    todoModel.clear();
  });

  it("self-ref tree: recursive from='children'", () => {
    const nodeModel = makeTreeModel();
    nodeModel.create({
      id: "root",
      name: "Root",
      children: {
        create: [
          { id: "a", name: "A", children: { create: [{ id: "a1", name: "A1" }] } },
          { id: "b", name: "B" },
        ]
      },
    });

    function TreeNode({ depth = 0 }: { depth?: number }) {
      const node = useModel(nodeModel);
      const name = useUnit(node.$name);
      const childIds = useUnit(node.children.$ids);

      return (
        <div data-testid={`node-d${depth}`}>
          <span data-testid="name">{name}</span>
          {childIds.length > 0 && (
            <Each model={nodeModel} from="children">
              <TreeNode depth={depth + 1} />
            </Each>
          )}
        </div>
      );
    }

    render(
      <Each model={nodeModel} id="root">
        <TreeNode />
      </Each>,
    );

    const names = screen.getAllByTestId("name").map((el) => el.textContent);
    expect(names).toEqual(["Root", "A", "A1", "B"]);

    nodeModel.clear();
  });

  it("throws when no matching ref found", () => {
    const model = makeTodoModel();
    model.create({ id: "1", title: "T" });

    function Bad() {
      return (
        <Each model={model} from="nonexistent">
          <div />
        </Each>
      );
    }

    expect(() => render(<Bad />)).toThrow(/no parent ref/);
    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.5 id mode
// ─────────────────────────────────────────────────────────────────────────────

describe("id mode", () => {
  it("scopes single instance by static ID", () => {
    const model = makeTodoModel();
    model.create({ id: "s1", title: "Static" });

    function View() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="result">{title}</div>;
    }

    render(
      <Each model={model} id="s1">
        <View />
      </Each>,
    );

    expect(screen.getByTestId("result").textContent).toBe("Static");
    model.clear();
  });

  it("reactive Store<id>: switches instance on change", () => {
    const model = makeTodoModel();
    model.create({ id: "i1", title: "One" });
    model.create({ id: "i2", title: "Two" });

    const selectEvt = createEvent<string | null>();
    const $id = createStore<string | null>("i1").on(selectEvt, (_, v) => v);

    function View() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="result">{title}</div>;
    }

    render(
      <Each model={model} id={$id}>
        <View />
      </Each>,
    );

    expect(screen.getByTestId("result").textContent).toBe("One");

    act(() => selectEvt("i2"));
    expect(screen.getByTestId("result").textContent).toBe("Two");

    model.clear();
  });

  it("renders nothing when reactive id is null", () => {
    const model = makeTodoModel();
    model.create({ id: "n1", title: "Nullable" });

    const selectEvt = createEvent<string | null>();
    const $id = createStore<string | null>(null).on(selectEvt, (_, v) => v);

    function View() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="result">{title}</div>;
    }

    const { container } = render(
      <Each model={model} id={$id}>
        <View />
      </Each>,
    );

    expect(container.querySelector('[data-testid="result"]')).toBeNull();

    act(() => selectEvt("n1"));
    expect(screen.getByTestId("result").textContent).toBe("Nullable");

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.6 Render-prop
// ─────────────────────────────────────────────────────────────────────────────

describe("render-prop", () => {
  it("children as function receives instance", () => {
    const model = makeTodoModel();
    model.create({ id: "rp1", title: "RenderProp" });

    function ItemView({ inst }: { inst: unknown }) {
      const title = useUnit((inst as ReturnType<typeof model.getSync> & {}).$title);
      return <div data-testid="result">{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        {(instance) => <ItemView inst={instance} />}
      </Each>,
    );

    expect(screen.getByTestId("result").textContent).toBe("RenderProp");
    model.clear();
  });

  it("context is also set for deeply nested useModel", () => {
    const model = makeTodoModel();
    model.create({ id: "deep", title: "DeepAccess" });

    function DeepChild() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="deep">{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        {() => (
          <div>
            <DeepChild />
          </div>
        )}
      </Each>,
    );

    expect(screen.getByTestId("deep").textContent).toBe("DeepAccess");
    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.7 Fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("fallback", () => {
  it("rendered when $ids is empty", () => {
    const model = makeTodoModel();

    render(
      <Each model={model} source={model.$ids} fallback={<div data-testid="empty">No items</div>}>
        <div data-testid="item" />
      </Each>,
    );

    expect(screen.getByTestId("empty").textContent).toBe("No items");
    expect(screen.queryByTestId("item")).toBeNull();
  });

  it("hidden when first item appears", () => {
    const model = makeTodoModel();

    render(
      <Each model={model} source={model.$ids} fallback={<div data-testid="empty">No items</div>}>
        <div data-testid="item" />
      </Each>,
    );

    expect(screen.getByTestId("empty")).toBeTruthy();

    act(() => {
      model.create({ id: "f1", title: "First" });
    });

    expect(screen.queryByTestId("empty")).toBeNull();
    expect(screen.getByTestId("item")).toBeTruthy();

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.9 Multi-level nesting
// ─────────────────────────────────────────────────────────────────────────────

describe("multi-level nesting", () => {
  it("three-level nesting: all ancestors accessible", () => {
    const catContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("todos", "many")
      .pk("id");

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");

    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");

    const catModel = createModel({ contract: catContract });
    const todoModel = createModel({ contract: todoContract });
    const tagModel = createModel({ contract: tagContract });

    catModel.bind({ todos: () => todoModel });
    todoModel.bind({ tags: () => tagModel });

    catModel.create({
      id: "c1",
      name: "Work",
      todos: { create: [{ id: "t1", title: "Task", tags: { create: [{ id: "g1", label: "urgent" }] } }] },
    });

    function TagBadge() {
      const tag = useModel(tagModel);
      const todo = useModel(todoModel);
      const cat = useModel(catModel);
      const label = useUnit(tag.$label);
      const title = useUnit(todo.$title);
      const name = useUnit(cat.$name);
      return <div data-testid="tag">{`${name}/${title}/${label}`}</div>;
    }

    render(
      <Each model={catModel} source={catModel.$ids}>
        <Each model={todoModel} from="todos">
          <Each model={tagModel} from="tags">
            <TagBadge />
          </Each>
        </Each>
      </Each>,
    );

    expect(screen.getByTestId("tag").textContent).toBe("Work/Task/urgent");

    catModel.clear();
    todoModel.clear();
    tagModel.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.10 Recursive tree
// ─────────────────────────────────────────────────────────────────────────────

describe("recursive tree", () => {
  it("renders tree and depth prop propagates", () => {
    const nodeModel = makeTreeModel();
    nodeModel.create({
      id: "root",
      name: "Root",
      children: { create: [{ id: "a", name: "A", children: { create: [{ id: "a1", name: "A1" }] } }] },
    });

    function TreeNode({ depth = 0 }: { depth?: number }) {
      const node = useModel(nodeModel);
      const name = useUnit(node.$name);
      const childIds = useUnit(node.children.$ids);

      return (
        <div>
          <span data-testid="node">{`${depth}:${name}`}</span>
          {childIds.length > 0 && (
            <Each model={nodeModel} from="children">
              <TreeNode depth={depth + 1} />
            </Each>
          )}
        </div>
      );
    }

    render(
      <Each model={nodeModel} id="root">
        <TreeNode />
      </Each>,
    );

    const nodes = screen.getAllByTestId("node").map((el) => el.textContent);
    expect(nodes).toEqual(["0:Root", "1:A", "2:A1"]);

    nodeModel.clear();
  });

  it("parent access via ref from child", () => {
    const nodeModel = makeTreeModel();
    nodeModel.create({
      id: "root",
      name: "Root",
      children: { create: [{ id: "child", name: "Child", parent: "root" }] },
    });

    function ChildView() {
      const node = useModel(nodeModel);
      const name = useUnit(node.$name);
      const parentId = useUnit(node.parent.$id);
      return (
        <div>
          <span data-testid="child">{name}</span>
          <span data-testid="parent-id">{parentId ?? "none"}</span>
        </div>
      );
    }

    render(
      <Each model={nodeModel} id="root">
        <Each model={nodeModel} from="children">
          <ChildView />
        </Each>
      </Each>,
    );

    expect(screen.getByTestId("child").textContent).toBe("Child");
    expect(screen.getByTestId("parent-id").textContent).toBe("root");

    nodeModel.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.11 Instance replacement
// ─────────────────────────────────────────────────────────────────────────────

describe("instance replacement", () => {
  it("children pick up new instance after replacement", () => {
    const model = makeTodoModel();
    model.create({ id: "rep", title: "Original" });

    function View() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="result">{title}</div>;
    }

    render(
      <Each model={model} source={model.$ids}>
        <View />
      </Each>,
    );

    expect(screen.getByTestId("result").textContent).toBe("Original");

    act(() => {
      model.create({ id: "rep", title: "Replaced" });
    });

    expect(screen.getByTestId("result").textContent).toBe("Replaced");

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useModel throws without <Each>
// ─────────────────────────────────────────────────────────────────────────────

describe("useModel error", () => {
  it("throws when used outside <Each>", () => {
    const model = makeTodoModel();

    function Bad() {
      useModel(model);
      return null;
    }

    expect(() => render(<Bad />)).toThrow(/no <Each> ancestor/);
  });
});
