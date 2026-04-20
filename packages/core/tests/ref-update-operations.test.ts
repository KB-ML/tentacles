import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// REF UPDATE OPERATIONS TESTS
//
// Tests for Prisma-style ref operations in model.update():
// 1. "one" ref: connect, create, connectOrCreate, disconnect
// 2. "many" ref: set, add, disconnect
// 3. FK ↔ ref sync
// 4. Inverse ref operations
// 5. query.update with ref operations
// 6. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. "one" ref: connect
// ─────────────────────────────────────────────────────────────────────────────

describe("update: one ref connect", () => {
  it("connects to existing instance via { connect: id }", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "con1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "con1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });
    catModel.create({ id: 2, title: "Personal" });
    const todo = todoModel.create({ id: 1, title: "Task", categoryId: 1 });
    todo.category.set(1);

    todoModel.update(1, { category: { connect: 2 } });

    expect(todo.category.$id.getState()).toBe(2);
  });

  it("throws when connecting to non-existent instance", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "con2-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "con2-todo",
    refs: { category: () => catModel },
  });
   
    todoModel.create({ id: 1, title: "Task" });

    expect(() => {
      todoModel.update(1, { category: { connect: 999 } });
    }).toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. "one" ref: create
// ─────────────────────────────────────────────────────────────────────────────

describe("update: one ref create", () => {
  it("creates new target and connects", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cre1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cre1-todo",
    refs: { category: () => catModel },
  });
   
    const todo = todoModel.create({ id: 1, title: "Task" });

    todoModel.update(1, { category: { create: { id: 5, title: "New Category" } } });

    // create() returns instance with string PK "5"
    expect(todo.category.$id.getState()).toBe("5");
    expect(catModel.get("5")!.$title.getState()).toBe("New Category");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. "one" ref: connectOrCreate
// ─────────────────────────────────────────────────────────────────────────────

describe("update: one ref connectOrCreate", () => {
  it("connects to existing when target exists", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "coc1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "coc1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 3, title: "Existing" });
    const todo = todoModel.create({ id: 1, title: "Task" });

    todoModel.update(1, { category: { connectOrCreate: { id: 3, title: "Should Not Replace" } } });

    // PK resolver returns string "3"
    expect(todo.category.$id.getState()).toBe("3");
    // Original category title preserved (didn't create/replace)
    expect(catModel.get("3")!.$title.getState()).toBe("Existing");
  });

  it("creates target when it does not exist", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "coc2-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "coc2-todo",
    refs: { category: () => catModel },
  });
   
    const todo = todoModel.create({ id: 1, title: "Task" });

    todoModel.update(1, { category: { connectOrCreate: { id: 99, title: "Brand New" } } });

    // PK resolver returns string "99"
    expect(todo.category.$id.getState()).toBe("99");
    expect(catModel.get("99")!.$title.getState()).toBe("Brand New");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. "one" ref: disconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("update: one ref disconnect", () => {
  it("clears the ref", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "dis1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "dis1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });
    const todo = todoModel.create({ id: 1, title: "Task", categoryId: 1 });
    todo.category.set(1);

    todoModel.update(1, { category: { disconnect: true } });

    expect(todo.category.$id.getState()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. "many" ref: set (replace)
// ─────────────────────────────────────────────────────────────────────────────

describe("update: many ref set", () => {
  function makeModels() {
    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");
    const tagModel = createModel({ contract: tagContract, name: "set-tag" });

    const postContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");
    const postModel = createModel({ contract: postContract, name: "set-post",
    refs: { tags: () => tagModel },
  });
   
    return { tagModel, postModel };
  }

  it("replaces entire list with scalar IDs", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    tagModel.create({ id: "t2", label: "ts" });
    tagModel.create({ id: "t3", label: "rust" });

    const post = postModel.create({ id: "p1", title: "Hello" });
    post.tags.add("t1");
    post.tags.add("t2");

    postModel.update("p1", { tags: { set: ["t2", "t3"] } });

    expect(post.tags.$ids.getState()).toEqual(["t2", "t3"]);
  });

  it("clears list with empty set", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    const post = postModel.create({ id: "p2", title: "Hello" });
    post.tags.add("t1");

    postModel.update("p2", { tags: { set: [] } });

    expect(post.tags.$ids.getState()).toEqual([]);
  });

  it("throws when combined with add", () => {
    const { postModel } = makeModels();
    postModel.create({ id: "p3", title: "Hello" });

    expect(() => {
      postModel.update("p3", { tags: { set: ["t1"], add: ["t2"] } as never });
    }).toThrow(/mutually exclusive/);
  });

  it("set with { create } elements", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    const post = postModel.create({ id: "p4", title: "Hello" });
    post.tags.add("t1");

    postModel.update("p4", {
      tags: { set: ["t1", { create: { id: "t2", label: "new-tag" } }] },
    });

    expect(post.tags.$ids.getState()).toEqual(["t1", "t2"]);
    expect(tagModel.get("t2")!.$label.getState()).toBe("new-tag");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. "many" ref: add
// ─────────────────────────────────────────────────────────────────────────────

describe("update: many ref add", () => {
  function makeModels() {
    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");
    const tagModel = createModel({ contract: tagContract, name: "add-tag" });

    const postContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");
    const postModel = createModel({ contract: postContract, name: "add-post",
    refs: { tags: () => tagModel },
  });
   
    return { tagModel, postModel };
  }

  it("adds to existing list", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    tagModel.create({ id: "t2", label: "ts" });
    tagModel.create({ id: "t3", label: "rust" });

    const post = postModel.create({ id: "p1", title: "Hello" });
    post.tags.add("t1");

    postModel.update("p1", { tags: { add: ["t2", "t3"] } });

    expect(post.tags.$ids.getState()).toEqual(["t1", "t2", "t3"]);
  });

  it("add with { connectOrCreate } elements", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    const post = postModel.create({ id: "p2", title: "Hello" });
    post.tags.add("t1");

    postModel.update("p2", {
      tags: { add: [{ connectOrCreate: { id: "t2", label: "maybe-new" } }] },
    });

    expect(post.tags.$ids.getState()).toEqual(["t1", "t2"]);
    expect(tagModel.get("t2")!.$label.getState()).toBe("maybe-new");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. "many" ref: disconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("update: many ref disconnect", () => {
  function makeModels() {
    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");
    const tagModel = createModel({ contract: tagContract, name: "disc-tag" });

    const postContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");
    const postModel = createModel({ contract: postContract, name: "disc-post",
    refs: { tags: () => tagModel },
  });
   
    return { tagModel, postModel };
  }

  it("removes specific IDs from list", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    tagModel.create({ id: "t2", label: "ts" });
    tagModel.create({ id: "t3", label: "rust" });

    const post = postModel.create({ id: "p1", title: "Hello" });
    post.tags.add("t1");
    post.tags.add("t2");
    post.tags.add("t3");

    postModel.update("p1", { tags: { disconnect: ["t1", "t3"] } });

    expect(post.tags.$ids.getState()).toEqual(["t2"]);
  });

  it("add + disconnect in same operation", () => {
    const { tagModel, postModel } = makeModels();

    tagModel.create({ id: "t1", label: "js" });
    tagModel.create({ id: "t2", label: "ts" });
    tagModel.create({ id: "t3", label: "rust" });

    const post = postModel.create({ id: "p2", title: "Hello" });
    post.tags.add("t1");
    post.tags.add("t2");

    postModel.update("p2", { tags: { add: ["t3"], disconnect: ["t1"] } });

    expect(post.tags.$ids.getState()).toEqual(["t2", "t3"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FK ↔ ref sync
// ─────────────────────────────────────────────────────────────────────────────

describe("update: FK ↔ ref sync", () => {
  it("FK field update syncs ref", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "fk1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "fk1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });
    catModel.create({ id: 2, title: "Personal" });
    const todo = todoModel.create({ id: 1, title: "Task", categoryId: 1 });
    todo.category.set(1);

    // Update via FK field → ref should sync
    todoModel.update(1, { categoryId: 2 });

    expect(todo.category.$id.getState()).toBe(2);
  });

  it("ref connect syncs FK store", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "fk2-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "fk2-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });
    catModel.create({ id: 2, title: "Personal" });
    const todo = todoModel.create({ id: 1, title: "Task", categoryId: 1 });

    // Update via ref → FK store should sync
    todoModel.update(1, { category: { connect: 2 } });

    expect(todo.$categoryId.getState()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Inverse ref operations
// ─────────────────────────────────────────────────────────────────────────────

describe("update: inverse ref operations", () => {
  function makeModels() {
    const categoryContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("todos", "many")
      .pk("id");
    const categoryModel = createModel({ contract: categoryContract, name: "inv-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .inverse("category", "todos")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "inv-todo",
    refs: { category: () => categoryModel },
  });
   
    return { categoryModel, todoModel };
  }

  it("connect: links via inverse", () => {
    const { categoryModel, todoModel } = makeModels();

    const cat = categoryModel.create({ id: "cat-1", name: "Work" });
    todoModel.create({ id: "t1", title: "Task 1" });

    todoModel.update("t1", { category: { connect: "cat-1" } });

    expect(cat.todos.$ids.getState()).toContain("t1");
  });

  it("create: creates source and links", () => {
    const { categoryModel, todoModel } = makeModels();

    todoModel.create({ id: "t1", title: "Task 1" });

    todoModel.update("t1", {
      category: { create: { id: "cat-new", name: "New Cat" } },
    });

    const cat = categoryModel.get("cat-new")!;
    expect(cat.$name.getState()).toBe("New Cat");
    expect(cat.todos.$ids.getState()).toContain("t1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. query.update with ref operations
// ─────────────────────────────────────────────────────────────────────────────

describe("query.update with ref operations", () => {
  it("updates refs on all matching instances", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "qu1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "qu1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });
    catModel.create({ id: 2, title: "Personal" });

    const t1 = todoModel.create({ id: 1, title: "Task 1", categoryId: 1 });
    const t2 = todoModel.create({ id: 2, title: "Task 2", categoryId: 1 });
    t1.category.set(1);
    t2.category.set(1);

    const query = todoModel.query();
    query.update({ category: { connect: 2 } });

    expect(t1.category.$id.getState()).toBe(2);
    expect(t2.category.$id.getState()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Edge case: model with only id
// ─────────────────────────────────────────────────────────────────────────────

describe("update: model with only id", () => {
  it("connectOrCreate creates when not exists", () => {
    const simpleContract = createContract()
      .store("id", (s) => s<number>())
      .pk("id");
    const simpleModel = createModel({ contract: simpleContract, name: "oid1-simple" });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("target", "one")
      .pk("id");
    const parentModel = createModel({ contract: parentContract, name: "oid1-parent",
    refs: { target: () => simpleModel },
  });
   
    const parent = parentModel.create({ id: "p1" });

    parentModel.update("p1", { target: { connectOrCreate: { id: 42 } } });

    // PK resolver returns string
    expect(parent.target.$id.getState()).toBe("42");
    expect(simpleModel.get("42")).not.toBeNull();
  });

  it("connectOrCreate connects when exists", () => {
    const simpleContract = createContract()
      .store("id", (s) => s<number>())
      .pk("id");
    const simpleModel = createModel({ contract: simpleContract, name: "oid2-simple" });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("target", "one")
      .pk("id");
    const parentModel = createModel({ contract: parentContract, name: "oid2-parent",
    refs: { target: () => simpleModel },
  });
   
    simpleModel.create({ id: 7 });
    const parent = parentModel.create({ id: "p1" });

    parentModel.update("p1", { target: { connectOrCreate: { id: 7 } } });

    // PK resolver returns string "7"
    expect(parent.target.$id.getState()).toBe("7");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Mixed: store fields + ref operations in one update
// ─────────────────────────────────────────────────────────────────────────────

describe("update: mixed store + ref update", () => {
  it("updates stores and refs in single call", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "mix1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "mix1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });
    catModel.create({ id: 2, title: "Personal" });
    const todo = todoModel.create({ id: 1, title: "Old Title", categoryId: 1 });
    todo.category.set(1);

    todoModel.update(1, { title: "New Title", category: { connect: 2 } });

    expect(todo.$title.getState()).toBe("New Title");
    expect(todo.category.$id.getState()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12b. update: plain object/array shortcuts (connectOrCreate / add+connectOrCreate)
// ─────────────────────────────────────────────────────────────────────────────

describe("update: plain object shortcut", () => {
  it("one ref: plain object = connectOrCreate", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "ups1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "ups1-todo",
    refs: { category: () => catModel },
  });
   
    const todo = todoModel.create({ id: 1, title: "Task" });

    // Creates category (doesn't exist yet)
    todoModel.update(1, { category: { id: 3, title: "New" } });
    expect(todo.category.$id.getState()).toBe("3");
    expect(catModel.get("3")!.$title.getState()).toBe("New");

    // Connects to existing (doesn't replace)
    todoModel.update(1, { category: { id: 3, title: "Ignored" } });
    expect(catModel.get("3")!.$title.getState()).toBe("New");
  });

  it("many ref: plain array = add + connectOrCreate", () => {
    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");
    const tagModel = createModel({ contract: tagContract, name: "ups2-tag" });

    const postContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");
    const postModel = createModel({ contract: postContract, name: "ups2-post",
    refs: { tags: () => tagModel },
  });
   
    const post = postModel.create({ id: "p1", title: "Hello" });
    tagModel.create({ id: "t1", label: "existing" });
    post.tags.add("t1");

    // Plain array adds via connectOrCreate (t1 exists, t2 created)
    postModel.update("p1", { tags: [{ id: "t1", label: "IGNORED" }, { id: "t2", label: "new" }] });

    expect(post.tags.$ids.getState()).toContain("t1");
    expect(post.tags.$ids.getState()).toContain("t2");
    expect(tagModel.get("t1")!.$label.getState()).toBe("existing");
    expect(tagModel.get("t2")!.$label.getState()).toBe("new");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. create() with ref operations
// ─────────────────────────────────────────────────────────────────────────────

describe("create: one ref operations", () => {
  it("connect: links to existing instance", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cc1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cc1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });

    const todo = todoModel.create({ id: 1, title: "Task", category: { connect: 1 } });

    expect(todo.category.$id.getState()).toBe(1);
  });

  it("connect: throws if target does not exist", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cc2-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cc2-todo",
    refs: { category: () => catModel },
  });
   
    expect(() => {
      todoModel.create({ id: 1, title: "Task", category: { connect: 999 } });
    }).toThrow(/not found/);
  });

  it("create: creates target and links", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cc3-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cc3-todo",
    refs: { category: () => catModel },
  });
   
    const todo = todoModel.create({
      id: 1,
      title: "Task",
      category: { create: { id: 5, title: "New" } },
    });

    expect(todo.category.$id.getState()).toBe("5");
    expect(catModel.get("5")!.$title.getState()).toBe("New");
  });

  it("connectOrCreate: connects if exists, creates if not", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cc4-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cc4-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 3, title: "Existing" });

    // Connects to existing
    const t1 = todoModel.create({
      id: 1,
      title: "Task 1",
      category: { connectOrCreate: { id: 3, title: "Ignored" } },
    });
    expect(t1.category.$id.getState()).toBe("3");
    expect(catModel.get("3")!.$title.getState()).toBe("Existing");

    // Creates new
    const t2 = todoModel.create({
      id: 2,
      title: "Task 2",
      category: { connectOrCreate: { id: 99, title: "Brand New" } },
    });
    expect(t2.category.$id.getState()).toBe("99");
    expect(catModel.get("99")!.$title.getState()).toBe("Brand New");
  });

  it("plain object shortcut = connectOrCreate", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cc5-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cc5-todo",
    refs: { category: () => catModel },
  });
   
    // Plain object = connectOrCreate (creates if not exists)
    const todo = todoModel.create({ id: 1, title: "Task", category: { id: 7, title: "Inline" } });
    expect(todo.category.$id.getState()).toBe("7");
    expect(catModel.get("7")!.$title.getState()).toBe("Inline");

    // Second call with same data = connects to existing
    const todo2 = todoModel.create({ id: 2, title: "Task2", category: { id: 7, title: "Ignored" } });
    expect(todo2.category.$id.getState()).toBe("7");
    // Original title preserved
    expect(catModel.get("7")!.$title.getState()).toBe("Inline");
  });
});

describe("create: many ref operations", () => {
  it("object syntax: connect, create, connectOrCreate", () => {
    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");
    const tagModel = createModel({ contract: tagContract, name: "cm1-tag" });

    const postContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");
    const postModel = createModel({ contract: postContract, name: "cm1-post",
    refs: { tags: () => tagModel },
  });
   
    tagModel.create({ id: "t1", label: "existing" });

    const post = postModel.create({
      id: "p1",
      title: "Hello",
      tags: {
        connect: ["t1"],
        create: [
          { id: "t2", label: "created" },
          { id: "t4", label: "explicit" },
        ],
        connectOrCreate: [{ id: "t3", label: "upserted" }],
      },
    });

    const ids = post.tags.$ids.getState();
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).toContain("t3");
    expect(ids).toContain("t4");

    expect(tagModel.get("t2")!.$label.getState()).toBe("created");
    expect(tagModel.get("t3")!.$label.getState()).toBe("upserted");
    expect(tagModel.get("t4")!.$label.getState()).toBe("explicit");
  });

  it("plain array shortcut = connectOrCreate for each element", () => {
    const tagContract = createContract()
      .store("id", (s) => s<string>())
      .store("label", (s) => s<string>())
      .pk("id");
    const tagModel = createModel({ contract: tagContract, name: "cm2-tag" });

    const postContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("tags", "many")
      .pk("id");
    const postModel = createModel({ contract: postContract, name: "cm2-post",
    refs: { tags: () => tagModel },
  });
   
    // First call: creates all tags
    const post = postModel.create({
      id: "p1",
      title: "Hello",
      tags: [
        { id: "t1", label: "js" },
        { id: "t2", label: "ts" },
      ],
    });

    expect(post.tags.$ids.getState()).toContain("t1");
    expect(post.tags.$ids.getState()).toContain("t2");
    expect(tagModel.get("t1")!.$label.getState()).toBe("js");

    // Second call: connects to existing (doesn't replace)
    const post2 = postModel.create({
      id: "p2",
      title: "World",
      tags: [{ id: "t1", label: "IGNORED" }],
    });

    expect(post2.tags.$ids.getState()).toContain("t1");
    // Original label preserved
    expect(tagModel.get("t1")!.$label.getState()).toBe("js");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14b. connect with object (PK extraction)
// ─────────────────────────────────────────────────────────────────────────────

describe("connect with object", () => {
  it("extracts PK from object in connect", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cobj1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .ref("category", "one")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "cobj1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });

    const todo = todoModel.create({
      id: 1,
      title: "Task",
      category: { connect: { id: 1, title: "Work" } },
    });

    expect(todo.category.$id.getState()).toBe("1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14c. Compound PK with FK + ref operation (reverse FK mapping)
// ─────────────────────────────────────────────────────────────────────────────

describe("compound PK with FK ref", () => {
  it("derives FK from ref operation for compound PK", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cpk1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("categoryId", "id");
    const todoModel = createModel({ contract: todoContract, name: "cpk1-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 1, title: "Work" });

    // Pass ref operation instead of FK value — PK should still resolve
    const todo = todoModel.create({
      id: 5,
      title: "Task",
      category: { connect: 1 },
    });

    // PK = [categoryId=1, id=5] → "1\05"
    expect(todo.__id).toBe("1\x005");
    expect(todo.$categoryId.getState()).toBe(1);
    expect(todo.category.$id.getState()).toBe(1);
  });

  it("derives FK from connect with object", () => {
    const catContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const catModel = createModel({ contract: catContract, name: "cpk2-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("categoryId", "id");
    const todoModel = createModel({ contract: todoContract, name: "cpk2-todo",
    refs: { category: () => catModel },
  });
   
    catModel.create({ id: 2, title: "Personal" });

    const todo = todoModel.create({
      id: 3,
      title: "Task",
      category: { connect: { id: 2, title: "Personal" } },
    });

    expect(todo.__id).toBe("2\x003");
  });
});

describe("create: inverse ref operations", () => {
  it("connect: links via inverse on create", () => {
    const categoryContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("todos", "many")
      .pk("id");
    const categoryModel = createModel({ contract: categoryContract, name: "ci1-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .inverse("category", "todos")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "ci1-todo",
    refs: { category: () => categoryModel },
  });
   
    const cat = categoryModel.create({ id: "cat-1", name: "Work" });

    todoModel.create({ id: "t1", title: "Task", category: { connect: "cat-1" } });

    expect(cat.todos.$ids.getState()).toContain("t1");
  });

  it("create: creates source and links via inverse", () => {
    const categoryContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("todos", "many")
      .pk("id");
    const categoryModel = createModel({ contract: categoryContract, name: "ci2-cat" });

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .inverse("category", "todos")
      .pk("id");
    const todoModel = createModel({ contract: todoContract, name: "ci2-todo",
    refs: { category: () => categoryModel },
  });
   
    todoModel.create({
      id: "t1",
      title: "Task",
      category: { create: { id: "cat-new", name: "New Cat" } },
    });

    const cat = categoryModel.get("cat-new")!;
    expect(cat.$name.getState()).toBe("New Cat");
    expect(cat.todos.$ids.getState()).toContain("t1");
  });
});
