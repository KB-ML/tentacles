import { afterEach, describe, expect, it } from "vitest";
import { createContract, createModel } from "@kbml-tentacles/core";
import { createEvent, createStore } from "effector";
import { useUnit } from "effector-solid";
import { render, cleanup, screen } from "@solidjs/testing-library";
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
      return <div data-testid="item">{title()}</div>;
    }

    render(() => (
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>
    ));

    expect(screen.getAllByTestId("item")).toHaveLength(3);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.2 Add/remove
// ─────────────────────────────────────────────────────────────────────────────

describe("add/remove", () => {
  it("removing an ID unmounts that item", () => {
    const model = makeTodoModel();
    model.create({ id: "a", title: "Alpha" });
    model.create({ id: "b", title: "Beta" });

    function Item() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="item">{title()}</div>;
    }

    render(() => (
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>
    ));

    expect(screen.getAllByTestId("item")).toHaveLength(2);

    model.delete("a");
    // Solid is synchronous — no flush needed
    expect(screen.getAllByTestId("item")).toHaveLength(1);
    expect(screen.getByText("Beta")).toBeTruthy();

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
      return <div data-testid="todo">{title()}</div>;
    }

    function CatView() {
      const cat = useModel(catModel);
      const name = useUnit(cat.$name);
      return (
        <div>
          <span data-testid="cat">{name()}</span>
          <Each model={todoModel} from="todos">
            <TodoItem />
          </Each>
        </div>
      );
    }

    render(() => (
      <Each model={catModel} source={catModel.$ids}>
        <CatView />
      </Each>
    ));

    expect(screen.getByTestId("cat").textContent).toBe("Work");
    expect(screen.getAllByTestId("todo")).toHaveLength(2);

    catModel.clear();
    todoModel.clear();
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
      return <div data-testid="result">{title()}</div>;
    }

    render(() => (
      <Each model={model} id="s1">
        <View />
      </Each>
    ));

    expect(screen.getByTestId("result").textContent).toBe("Static");
    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.7 Fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("fallback", () => {
  it("rendered when $ids is empty", () => {
    const model = makeTodoModel();

    render(() => (
      <Each model={model} source={model.$ids} fallback={<div data-testid="empty">No items</div>}>
        <div data-testid="item" />
      </Each>
    ));

    expect(screen.getByTestId("empty").textContent).toBe("No items");
    expect(screen.queryByTestId("item")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useModel error
// ─────────────────────────────────────────────────────────────────────────────

describe("useModel error", () => {
  it("throws when used outside <Each>", () => {
    const model = makeTodoModel();

    function Bad() {
      useModel(model);
      return null;
    }

    expect(() => render(() => <Bad />)).toThrow(/no <Each> ancestor/);
  });
});
