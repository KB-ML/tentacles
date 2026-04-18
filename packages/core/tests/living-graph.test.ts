import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";

function makeTargetModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .pk("id");
  return createModel({
    contract,
    fn: ({ $name }) => ({ $name }),
  });
}

describe("Model.$ids", () => {
  it("starts empty", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count }) => ({ $count }),
    });
    expect(model.$ids.getState()).toEqual([]);
  });

  it("tracks created instances", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count }) => ({ $count }),
    });
    model.create({ id: "a", count: 0 });
    model.create({ id: "b", count: 0 });
    expect(model.$ids.getState()).toEqual(["a", "b"]);
  });

  it("removes on delete", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count }) => ({ $count }),
    });
    model.create({ id: "a", count: 0 });
    model.create({ id: "b", count: 0 });
    model.delete("a");
    expect(model.$ids.getState()).toEqual(["b"]);
  });

  it("clears on clear()", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count }) => ({ $count }),
    });
    model.create({ id: "a", count: 0 });
    model.create({ id: "b", count: 0 });
    model.clear();
    expect(model.$ids.getState()).toEqual([]);
  });

  it("re-create same ID does not duplicate", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count }) => ({ $count }),
    });
    model.create({ id: "a", count: 0 });
    model.create({ id: "a", count: 1 });
    expect(model.$ids.getState()).toEqual(["a"]);
  });
});

describe("Model.instance()", () => {
  it("returns instance by ID", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });
    const inst = model.create({ id: "g1", name: "hello" });
    const got = model.instance("g1").getState();
    expect(got).toBe(inst);
    expect(got!.$name.getState()).toBe("hello");
  });

  it("returns null for unknown ID", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });
    expect(model.instance("nope").getState()).toBeNull();
  });

  it("returns null after delete", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });
    model.create({ id: "d1", name: "x" });
    model.delete("d1");
    expect(model.instance("d1").getState()).toBeNull();
  });
});

describe("Instance meta: __id and __model", () => {
  it("create() attaches __id and __model", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });
    const inst = model.create({ id: "m1", name: "test" });
    expect(inst.__id).toBe("m1");
    expect(inst.__model).toBe(model);
  });

  it("instance() returns instance with __id and __model", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });
    model.create({ id: "m2", name: "test" });
    const got = model.instance("m2").getState()!;
    expect(got.__id).toBe("m2");
    expect(got.__model).toBe(model);
  });

  it("navigate from instance to siblings via __model", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });
    const a = model.create({ id: "a", name: "Alice" });
    model.create({ id: "b", name: "Bob" });

    // __model is Model<any, any>, so we verify navigation works
    const sibling = a.__model.instance("b").getState();
    expect(sibling).not.toBeNull();
    expect(sibling!.__id).toBe("b");

    // Use typed model for full type safety
    const typedSibling = model.instance("b").getState();
    expect(typedSibling!.$name.getState()).toBe("Bob");
  });
});

describe("$resolved: ref many", () => {
  it("resolves referenced instances", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $title, items }) => ({ $title, items }),
    });
    model.bind({ items: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    targetModel.create({ id: "t2", name: "B" });

    const inst = model.create({ id: "r1", title: "test" });
    inst.items.add("t1");
    inst.items.add("t2");

    const resolved = inst.items.$resolved.getState();
    expect(resolved).toHaveLength(2);
    expect(resolved[0].$name.getState()).toBe("A");
    expect(resolved[1].$name.getState()).toBe("B");
  });

  it("filters dangling refs", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ items }) => ({ items }),  // refs stay bare
    });
    model.bind({ items: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    const inst = model.create({ id: "r1" });
    inst.items.add("t1");
    inst.items.add("t-missing");

    const resolved = inst.items.$resolved.getState();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].$name.getState()).toBe("A");
  });

  it("updates when target instance is deleted", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    targetModel.create({ id: "t2", name: "B" });
    const inst = model.create({ id: "r1" });
    inst.items.add("t1");
    inst.items.add("t2");

    expect(inst.items.$resolved.getState()).toHaveLength(2);

    targetModel.delete("t1");

    const resolved = inst.items.$resolved.getState();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].$name.getState()).toBe("B");
  });

  it("resolved instances have __id", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    const inst = model.create({ id: "r1" });
    inst.items.add("t1");

    const resolved = inst.items.$resolved.getState();
    expect(resolved[0].__id).toBe("t1");
  });
});

describe("$resolved: ref one", () => {
  it("resolves single reference", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    const inst = model.create({ id: "r1" });
    inst.current.set("t1");

    const resolved = inst.current.$resolved.getState();
    expect(resolved).not.toBeNull();
    expect(resolved.$name.getState()).toBe("A");
    expect(resolved.__id).toBe("t1");
  });

  it("returns null when unset", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    const inst = model.create({ id: "r1" });
    expect(inst.current.$resolved.getState()).toBeNull();
  });

  it("returns null for dangling ref", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    const inst = model.create({ id: "r1" });
    inst.current.set("nonexistent");
    expect(inst.current.$resolved.getState()).toBeNull();
  });

  it("updates when target is deleted", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    const inst = model.create({ id: "r1" });
    inst.current.set("t1");

    expect(inst.current.$resolved.getState()).not.toBeNull();

    targetModel.delete("t1");
    expect(inst.current.$resolved.getState()).toBeNull();
  });

  it("updates on clear", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    const inst = model.create({ id: "r1" });
    inst.current.set("t1");
    inst.current.clear();

    expect(inst.current.$resolved.getState()).toBeNull();
  });
});

describe("$resolved: self-ref", () => {
  it("self-ref many resolves through owning model", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("text", (s) => s<string>())
      .ref("replies", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $text, replies }) => ({ $text, replies }),
    });

    const root = model.create({ id: "c1", text: "Hello" });
    model.create({ id: "c2", text: "Reply" });
    root.replies.add("c2");

    const resolved = root.replies.$resolved.getState();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].$text.getState()).toBe("Reply");
    expect(resolved[0].__id).toBe("c2");
  });

  it("self-ref one resolves through owning model", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("parent", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name, parent }) => ({ $name, parent }),
    });

    const root = model.create({ id: "p1", name: "Root" });
    const child = model.create({ id: "p2", name: "Child" });
    child.parent.set("p1");

    const resolved = child.parent.$resolved.getState();
    expect(resolved).not.toBeNull();
    expect(resolved.$name.getState()).toBe("Root");
  });

  it("self-ref tree: nested resolution", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("children", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name, children }) => ({ $name, children }),
    });

    const root = model.create({ id: "root", name: "Root" });
    const a = model.create({ id: "a", name: "A" });
    const b = model.create({ id: "b", name: "B" });

    root.children.add("a");
    root.children.add("b");
    a.children.add("b");

    const rootChildren = root.children.$resolved.getState();
    expect(rootChildren).toHaveLength(2);

    const aChildren = a.children.$resolved.getState();
    expect(aChildren).toHaveLength(1);
    expect(aChildren[0].__id).toBe("b");
  });
});
