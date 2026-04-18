import { describe, expect, it } from "vitest";
import { allSettled, fork } from "effector";
import { createContract, createModel } from "../index";

// Helper: create a simple model to use as ref target
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

describe("Ref: basic many API", () => {
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

  it("fn receives $ids, add, remove", () => {
    const inst = model.create({ id: "m1", title: "t" });
    expect(inst.items).toHaveProperty("$ids");
    expect(inst.items).toHaveProperty("add");
    expect(inst.items).toHaveProperty("remove");
    expect(inst.items.$ids.getState()).toEqual([]);
  });

  it("add appends ID", () => {
    const inst = model.create({ id: "m2", title: "t" });
    inst.items.add("e1");
    expect(inst.items.$ids.getState()).toEqual(["e1"]);
  });

  it("remove filters ID", () => {
    const inst = model.create({ id: "m3", title: "t" });
    inst.items.add("e1");
    inst.items.remove("e1");
    expect(inst.items.$ids.getState()).toEqual([]);
  });

  it("add is idempotent", () => {
    const inst = model.create({ id: "m4", title: "t" });
    inst.items.add("e1");
    inst.items.add("e1");
    expect(inst.items.$ids.getState()).toEqual(["e1"]);
  });

  it("remove non-existent is no-op", () => {
    const inst = model.create({ id: "m5", title: "t" });
    inst.items.remove("x");
    expect(inst.items.$ids.getState()).toEqual([]);
  });
});

describe("Ref: basic one API", () => {
  const targetModel = makeTargetModel();

  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .ref("current", "one")
    .pk("id");
  const model = createModel({
    contract,
    fn: ({ $title, current }) => ({ $title, current }),
  });
  model.bind({ current: () => targetModel });

  it("fn receives $id, set, clear", () => {
    const inst = model.create({ id: "o1", title: "t" });
    expect(inst.current).toHaveProperty("$id");
    expect(inst.current).toHaveProperty("set");
    expect(inst.current).toHaveProperty("clear");
    expect(inst.current.$id.getState()).toBeNull();
  });

  it("set replaces ID", () => {
    const inst = model.create({ id: "o2", title: "t" });
    inst.current.set("e1");
    inst.current.set("e2");
    expect(inst.current.$id.getState()).toBe("e2");
  });

  it("clear nulls ID", () => {
    const inst = model.create({ id: "o3", title: "t" });
    inst.current.set("e1");
    inst.current.clear();
    expect(inst.current.$id.getState()).toBeNull();
  });
});

describe("Ref: SIDs", () => {
  const targetModel = makeTargetModel();

  it("many SID format", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "sidMany",
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });
    const inst = model.create({ id: "s1" });
    // $ids is a virtual store (backed by $dataMap) — no own SID
    expect(inst.items.add.sid).toBe("tentacles:sidMany:s1:items:add");
    expect(inst.items.remove.sid).toBe("tentacles:sidMany:s1:items:remove");
  });

  it("one SID format", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "sidOne",
      fn: ({ current }) => ({ current }),

    });
    model.bind({ current: () => targetModel });
    const inst = model.create({ id: "s2" });
    // $id is a virtual store (backed by $dataMap) — no own SID
    expect(inst.current.set.sid).toBe("tentacles:sidOne:s2:current:set");
    expect(inst.current.clear.sid).toBe("tentacles:sidOne:s2:current:clear");
  });
});

describe("Ref: instance lifecycle", () => {
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

  it("multiple instances have independent ref stores", () => {
    const a = model.create({ id: "lc-a" });
    const b = model.create({ id: "lc-b" });
    a.items.add("x");
    expect(a.items.$ids.getState()).toEqual(["x"]);
    expect(b.items.$ids.getState()).toEqual([]);
  });

  it("delete clears ref SIDs", () => {
    const inst = model.create({ id: "lc-del" });
    inst.items.add("x");
    model.delete("lc-del");
    // Re-create with same ID should work without duplicate SID warning
    const inst2 = model.create({ id: "lc-del" });
    expect(inst2.items.$ids.getState()).toEqual([]);
  });

  it("re-create with same ID replaces ref stores", () => {
    const inst1 = model.create({ id: "lc-re" });
    inst1.items.add("old");
    const inst2 = model.create({ id: "lc-re" });
    expect(inst2.items.$ids.getState()).toEqual([]);
  });
});

describe("Ref: scoped creation", () => {
  const targetModel = makeTargetModel();

  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("items", "many")
    .pk("id");
  const model = createModel({
    contract,
    fn: ({ $name, items }) => ({ $name, items }),
  });
  model.bind({ items: () => targetModel });

  it("refs work with scope", async () => {
    const scope = fork();
    const inst = await model.create({ id: "sc1", name: "t" }, { scope });
    await allSettled(inst.items.add, { scope, params: "e1" });
    expect(scope.getState(inst.items.$ids)).toEqual(["e1"]);
  });

  it("scoped isolation", async () => {
    const scopeA = fork();
    const scopeB = fork();
    const instA = await model.create({ id: "sc2", name: "a" }, { scope: scopeA });
    const instB = await model.create({ id: "sc2", name: "b" }, { scope: scopeB });
    await allSettled(instA.items.add, { scope: scopeA, params: "x" });
    expect(scopeA.getState(instA.items.$ids)).toEqual(["x"]);
    expect(scopeB.getState(instB.items.$ids)).toEqual([]);
  });
});

describe("Ref: builder integration", () => {
  const targetModel = makeTargetModel();

  it("ref API usable in fn", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .event("addItem", (e) => e<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ items, addItem }) => {
        items.$ids.on(addItem, (ids, id) =>
          ids.includes(id) ? ids : [...ids, id],
        );
        return { items, addItem };
      },

    });
    model.bind({ items: () => targetModel });
    const inst = model.create({ id: "b1" });
    inst.addItem("via-event");
    expect(inst.items.$ids.getState()).toEqual(["via-event"]);
  });

  it("model without refs unchanged", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc };
      },
    });
    const inst = model.create({ id: "nr1", count: 0 });
    inst.inc();
    expect(inst.$count.getState()).toBe(1);
  });
});

describe("Ref: self-reference", () => {
  it("self-ref", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("children", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name, children }) => {
        return { $name, children }
      },
    });

    const parent = model.create({ id: "root", name: "root" });
    const child = model.create({ id: "child1", name: "child" });
    parent.children.add("child1");
    expect(parent.children.$ids.getState()).toEqual(["child1"]);
  });

  it("self-ref one + many", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("manager", "one")
      .ref("directReports", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name, manager, directReports }) => ({ $name, manager, directReports }),
    });

    const alice = model.create({ id: "alice", name: "Alice" });
    const bob = model.create({ id: "bob", name: "Bob" });

    alice.manager.set("bob");
    bob.directReports.add("alice");

    expect(alice.manager.$id.getState()).toBe("bob");
    expect(bob.directReports.$ids.getState()).toEqual(["alice"]);
  });
});

describe("Ref: circular deps", () => {
  it("mutual refs via thunks", () => {
    const contractA = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("bRefs", "many")
      .pk("id");
    const modelA = createModel({
      contract: contractA,
      fn: ({ $name, bRefs }) => ({ $name, bRefs }),
    });

    const contractB = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("aRef", "one")
      .pk("id");
    const modelB = createModel({
      contract: contractB,
      fn: ({ $name, aRef }) => ({ $name, aRef }),
    });

    const a = modelA.create({ id: "a1", name: "A" });
    const b = modelB.create({ id: "b1", name: "B" });

    a.bRefs.add("b1");
    b.aRef.set("a1");

    expect(a.bRefs.$ids.getState()).toEqual(["b1"]);
    expect(b.aRef.$id.getState()).toBe("a1");
  });

  it("mutual refs independent", () => {
    const contractA = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const modelA = createModel({
      contract: contractA,
      fn: ({ items }) => ({ items }),
    });

    const contractB = createContract()
      .store("id", (s) => s<string>())
      .ref("parent", "one")
      .pk("id");
    const modelB = createModel({
      contract: contractB,
      fn: ({ parent }) => ({ parent }),
    });

    const a = modelA.create({ id: "ia1" });
    const b = modelB.create({ id: "ib1" });

    a.items.add("ib1");
    expect(b.parent.$id.getState()).toBeNull();
  });
});

describe("Ref: mixed contracts", () => {
  const targetModel = makeTargetModel();

  it("stores + events + refs coexist", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .ref("items", "many")
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $count, inc, items, current }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc, items, current };
      },
    });
    model.bind({ items: () => targetModel, current: () => targetModel });

    const inst = model.create({ id: "mx1", count: 0 });
    inst.inc();
    inst.items.add("r1");
    inst.current.set("r2");

    expect(inst.$count.getState()).toBe(1);
    expect(inst.items.$ids.getState()).toEqual(["r1"]);
    expect(inst.current.$id.getState()).toBe("r2");
  });

  it("data excludes refs", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name, items }) => ({ $name, items }),
    });
    model.bind({ items: () => targetModel });
    // data only requires "name", not "items" — this compiles
    const inst = model.create({ id: "de1", name: "test" });
    expect(inst.items.$ids.getState()).toEqual([]);
  });
});
