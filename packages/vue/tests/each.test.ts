import { afterEach, describe, expect, it } from "vitest";
import { createContract, createModel } from "@kbml-tentacles/core";
import { createEvent, createStore } from "effector";
import { useUnit } from "effector-vue/composition";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { Each, useModel } from "../index";

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
    refs: { todos: () => todoModel },
  });

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .inverse("category", "todos")
    .pk("id");

  const todoModel = createModel({
    contract: todoContract,
    fn: ({ $id, $title, $category }) => ({ $id, $title, $category }),
    refs: { category: () => catModel },
  });

  
  return { catModel, todoModel };
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

// ─────────────────────────────────────────────────────────────────────────────
// 7.1 Basic iteration
// ─────────────────────────────────────────────────────────────────────────────

describe("basic iteration", () => {
  it("renders correct number of items from source={$ids}", async () => {
    const model = makeTodoModel();
    model.create({ id: "1", title: "A" });
    model.create({ id: "2", title: "B" });
    model.create({ id: "3", title: "C" });

    const Item = defineComponent({
      setup() {
        const todo = useModel(model);
        const title = useUnit(todo.$title);
        return () => h("div", { "data-testid": "item" }, title.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, source: model.$ids }, { default: () => h(Item) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.findAll('[data-testid="item"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("A");
    expect(wrapper.text()).toContain("B");
    expect(wrapper.text()).toContain("C");

    model.clear();
    wrapper.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.2 Add/remove
// ─────────────────────────────────────────────────────────────────────────────

describe("add/remove", () => {
  it("adding an ID mounts a new item", async () => {
    const model = makeTodoModel();
    model.create({ id: "1", title: "First" });

    const Item = defineComponent({
      setup() {
        const todo = useModel(model);
        const title = useUnit(todo.$title);
        return () => h("div", { "data-testid": "item" }, title.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, source: model.$ids }, { default: () => h(Item) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.findAll('[data-testid="item"]')).toHaveLength(1);

    model.create({ id: "2", title: "Second" });
    await nextTick();
    await nextTick();

    expect(wrapper.findAll('[data-testid="item"]')).toHaveLength(2);

    model.clear();
    wrapper.unmount();
  });

  it("removing an ID unmounts that item", async () => {
    const model = makeTodoModel();
    model.create({ id: "a", title: "Alpha" });
    model.create({ id: "b", title: "Beta" });

    const Item = defineComponent({
      setup() {
        const todo = useModel(model);
        const title = useUnit(todo.$title);
        return () => h("div", { "data-testid": "item" }, title.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, source: model.$ids }, { default: () => h(Item) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.findAll('[data-testid="item"]')).toHaveLength(2);

    model.delete("a");
    await nextTick();
    await nextTick();

    expect(wrapper.findAll('[data-testid="item"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("Beta");

    model.clear();
    wrapper.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.4 from resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("from resolution", () => {
  it("resolves ref from parent context", async () => {
    const { catModel, todoModel } = makeCategoryTodoModels();

    catModel.create({
      id: "cat1",
      name: "Work",
      todos: { create: [
        { id: "t1", title: "Review" },
        { id: "t2", title: "Deploy" },
      ] },
    });

    const TodoItem = defineComponent({
      setup() {
        const todo = useModel(todoModel);
        const title = useUnit(todo.$title);
        return () => h("div", { "data-testid": "todo" }, title.value);
      },
    });

    const CatView = defineComponent({
      setup() {
        const cat = useModel(catModel);
        const name = useUnit(cat.$name);
        return () =>
          h("div", [
            h("span", { "data-testid": "cat" }, name.value),
            h(Each as any, { model: todoModel, from: "todos" }, { default: () => h(TodoItem) }),
          ]);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model: catModel, source: catModel.$ids }, { default: () => h(CatView) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="cat"]').text()).toBe("Work");
    expect(wrapper.findAll('[data-testid="todo"]')).toHaveLength(2);

    catModel.clear();
    todoModel.clear();
    wrapper.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.5 id mode
// ─────────────────────────────────────────────────────────────────────────────

describe("id mode", () => {
  it("scopes single instance by static ID", async () => {
    const model = makeTodoModel();
    model.create({ id: "s1", title: "Static" });

    const View = defineComponent({
      setup() {
        const todo = useModel(model);
        const title = useUnit(todo.$title);
        return () => h("div", { "data-testid": "result" }, title.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, id: "s1" }, { default: () => h(View) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="result"]').text()).toBe("Static");

    model.clear();
    wrapper.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.7 Fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("fallback", () => {
  it("rendered when $ids is empty", async () => {
    const model = makeTodoModel();

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              Each as any,
              { model, source: model.$ids, fallback: h("div", { "data-testid": "empty" }, "No items") },
              { default: () => h("div", { "data-testid": "item" }) },
            );
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="item"]').exists()).toBe(false);

    wrapper.unmount();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useModel error
// ─────────────────────────────────────────────────────────────────────────────

describe("useModel error", () => {
  it("throws when used outside <Each>", () => {
    const model = makeTodoModel();

    const Bad = defineComponent({
      setup() {
        useModel(model);
        return () => null;
      },
    });

    expect(() => mount(Bad)).toThrow(/no <Each> ancestor/);
  });
});
