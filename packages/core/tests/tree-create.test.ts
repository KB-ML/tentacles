import { describe, expect, it } from "vitest";
import { fork } from "effector";
import { createContract, createModel } from "../index";

describe("Tree create: ref.many inline", () => {
  const childContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .pk("id");
  const childModel = createModel({ contract: childContract });

  const parentContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .ref("items", "many")
    .pk("id");
  const parentModel = createModel({ contract: parentContract,
    refs: { items: () => childModel },
  });
 
  it("creates children inline and links them", () => {
    const parent = parentModel.create({
      id: "p1",
      title: "Parent",
      items: { create: [
        { id: "c1", name: "Child 1" },
        { id: "c2", name: "Child 2" },
      ] },
    });

    expect(parent.items.$ids.getState()).toEqual(["c1", "c2"]);
    expect(childModel.get("c1")?.$name.getState()).toBe("Child 1");
    expect(childModel.get("c2")?.$name.getState()).toBe("Child 2");
  });

  it("links existing children by ID", () => {
    childModel.create({ id: "existing", name: "Existing" });

    const parent = parentModel.create({
      id: "p2",
      title: "Parent",
      items: { connect: ["existing"] },
    });

    expect(parent.items.$ids.getState()).toEqual(["existing"]);
  });

  it("supports mixed create and link", () => {
    childModel.create({ id: "pre", name: "Pre-existing" });

    const parent = parentModel.create({
      id: "p3",
      title: "Parent",
      items: { create: [{ id: "new-child", name: "New" }], connect: ["pre"] },
    });

    expect(parent.items.$ids.getState()).toEqual(["pre", "new-child"]);
    expect(childModel.get("new-child")?.$name.getState()).toBe("New");
  });

  it("works without refs (backward compat)", () => {
    const parent = parentModel.create({
      id: "p4",
      title: "No refs",
    });

    expect(parent.$title.getState()).toBe("No refs");
    expect(parent.items.$ids.getState()).toEqual([]);
  });
});

describe("Tree create: ref.one inline", () => {
  const targetContract = createContract()
    .store("id", (s) => s<string>())
    .store("value", (s) => s<number>())
    .pk("id");
  const targetModel = createModel({ contract: targetContract });

  const ownerContract = createContract()
    .store("id", (s) => s<string>())
    .store("label", (s) => s<string>())
    .ref("selected", "one")
    .pk("id");
  const ownerModel = createModel({ contract: ownerContract,
    refs: { selected: () => targetModel },
  });
 
  it("creates child inline and sets ref", () => {
    const owner = ownerModel.create({
      id: "o1",
      label: "Owner",
      selected: { create: { id: "t1", value: 42 } },
    });

    expect(owner.selected.$id.getState()).toBe("t1");
    expect(targetModel.get("t1")?.$value.getState()).toBe(42);
  });

  it("links existing by ID", () => {
    targetModel.create({ id: "existing-t", value: 99 });

    const owner = ownerModel.create({
      id: "o2",
      label: "Owner",
      selected: "existing-t",
    });

    expect(owner.selected.$id.getState()).toBe("existing-t");
  });

  it("omitted ref stays null", () => {
    const owner = ownerModel.create({
      id: "o3",
      label: "No ref",
    });

    expect(owner.selected.$id.getState()).toBeNull();
  });
});

describe("Tree create: self-ref (recursive)", () => {
  const treeContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("children", "many")
    .pk("id");
  const treeModel = createModel({ contract: treeContract });

  it("creates a tree recursively", () => {
    const root = treeModel.create({
      id: "root",
      name: "Root",
      children: { create: [
        {
          id: "child-1",
          name: "Child 1",
          children: { create: [{ id: "gc-1", name: "Grandchild" }] },
        },
        { id: "child-2", name: "Child 2" },
      ] },
    });

    expect(root.children.$ids.getState()).toEqual(["child-1", "child-2"]);

    const child1 = treeModel.get("child-1");
    expect(child1?.$name.getState()).toBe("Child 1");
    expect(child1?.children.$ids.getState()).toEqual(["gc-1"]);

    const gc = treeModel.get("gc-1");
    expect(gc?.$name.getState()).toBe("Grandchild");
    expect(gc?.children.$ids.getState()).toEqual([]);
  });
});

describe("Tree create: scoped (SSR)", () => {
  const itemContract = createContract()
    .store("id", (s) => s<string>())
    .store("text", (s) => s<string>())
    .pk("id");
  const itemModel = createModel({ contract: itemContract });

  const listContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("items", "many")
    .pk("id");
  const listModel = createModel({ contract: listContract,
    refs: { items: () => itemModel },
  });
 
  it("creates tree in scope", async () => {
    const scope = fork();

    await listModel.create(
      {
        id: "list-1",
        name: "My List",
        items: { create: [
          { id: "i1", text: "Item 1" },
          { id: "i2", text: "Item 2" },
        ] },
      },
      { scope },
    );

    const list = listModel.get("list-1")!;
    expect(scope.getState(list.$name)).toBe("My List");
    expect(scope.getState(list.items.$ids)).toEqual(["i1", "i2"]);

    const item1 = itemModel.get("i1")!;
    expect(scope.getState(item1.$text)).toBe("Item 1");
  });
});

describe("Composite PK from refs (many-to-many)", () => {
  const companyContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .pk("id");
  const companyModel = createModel({ contract: companyContract });

  const taskContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .pk("id");
  const taskModel = createModel({ contract: taskContract });

  const assignmentContract = createContract()
    .ref("company", "one")
    .ref("task", "one")
    .store("hours", (s) => s<number>())
    .pk("company", "task");
  const assignmentModel = createModel({ contract: assignmentContract,
    refs: { company: () => companyModel, task: () => taskModel },
  });
 
  it("derives PK from ref IDs (string refs)", () => {
    companyModel.create({ id: "acme", name: "Acme Corp" });
    taskModel.create({ id: "t1", title: "Build widget" });

    const assignment = assignmentModel.create({ company: "acme", task: "t1", hours: 8 });

    expect(assignment.__id).toBe("acme\x00t1");
    expect(assignment.$hours.getState()).toBe(8);
    expect(assignment.company.$id.getState()).toBe("acme");
    expect(assignment.task.$id.getState()).toBe("t1");
  });

  it("derives PK from inline ref objects", () => {
    const assignment = assignmentModel.create({
      company: { create: { id: "globex", name: "Globex" } },
      task: { create: { id: "t2", title: "Ship feature" } },
      hours: 4,
    });

    expect(assignment.__id).toBe("globex\x00t2");
    expect(companyModel.get("globex")?.$name.getState()).toBe("Globex");
    expect(taskModel.get("t2")?.$title.getState()).toBe("Ship feature");
  });

  it("derives PK from mixed refs (inline + ID)", () => {
    taskModel.create({ id: "t3", title: "Existing task" });

    const assignment = assignmentModel.create({
      company: { create: { id: "initech", name: "Initech" } },
      task: "t3",
      hours: 2,
    });

    expect(assignment.__id).toBe("initech\x00t3");
  });
});
