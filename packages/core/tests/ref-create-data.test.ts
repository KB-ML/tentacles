import { describe, expect, it } from "vitest";
import { allSettled, fork } from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// REF CREATE DATA TESTS
//
// Tests for passing ref data in create():
// 1. FK field mapping (schedule_id → schedule ref)
// 2. Inverse ref data (todo.create({ category: "cat-work" }))
// 3. onDelete interactions with ref-created links
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared models ──────────────────────────────────────────────────────────

function makeScheduleModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("time", (s) => s<string>())
    .pk("id");
  return createModel({ contract });
}

function makeTagModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("label", (s) => s<string>())
    .pk("id");
  return createModel({ contract });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FK FIELD MAPPING — "one" ref
// ─────────────────────────────────────────────────────────────────────────────

describe("FK mapping: one ref", () => {
  const scheduleModel = makeScheduleModel();

  const userContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("schedule_id", (s) => s<string>().default(""))
    .ref("schedule", "one", { fk: "schedule_id" })
    .pk("id");
  const userModel = createModel({ contract: userContract,
    refs: { schedule: () => scheduleModel },
  });
 
  it("links via FK field name", () => {
    scheduleModel.create({ id: "s1", time: "12-15" });

    const user = userModel.create({ id: "u1", name: "oleg", schedule_id: "s1" });

    expect(user.schedule.$id.getState()).toBe("s1");
  });

  it("links via ref field name (still works)", () => {
    scheduleModel.create({ id: "s2", time: "9-12" });

    const user = userModel.create({ id: "u2", name: "ivan", schedule: "s2" });

    expect(user.schedule.$id.getState()).toBe("s2");
  });

  it("omitted FK stays null", () => {
    const user = userModel.create({ id: "u3", name: "no-schedule" });

    expect(user.schedule.$id.getState()).toBeNull();
  });

  it("populates FK store from inline ref object", () => {
    const user = userModel.create({
      id: "u4",
      name: "inline",
      schedule: { id: "s-inline", time: "10-11" },
    });

    expect(user.schedule.$id.getState()).toBe("s-inline");
    expect(user.$schedule_id.getState()).toBe("s-inline");
  });

  it("populates numeric FK store from inline ref object (todo/category case)", () => {
    const categoryContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .pk("id");
    const categoryModel = createModel({ contract: categoryContract });

    const todoContract = createContract()
      .store("id", (s) => s<number>())
      .store("title", (s) => s<string>())
      .store("categoryId", (s) => s<number>())
      .ref("category", "one", { fk: "categoryId" })
      .pk("categoryId", "id");
    const todoModel = createModel({ contract: todoContract,
    refs: { category: () => categoryModel },
  });
   
    const todo = todoModel.create({
      id: 42,
      title: "buy milk",
      category: { id: 99, title: "shopping" },
    });

    expect(todo.$categoryId.getState()).toBe(99);
    expect(todo.category.$id.getState()).toBe("99");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FK FIELD MAPPING — "many" ref
// ─────────────────────────────────────────────────────────────────────────────

describe("FK mapping: many ref", () => {
  const tagModel = makeTagModel();

  const postContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("tag_ids", (s) => s<string>().default(""))
    .ref("tags", "many", { fk: "tag_ids" })
    .pk("id");
  const postModel = createModel({ contract: postContract,
    refs: { tags: () => tagModel },
  });
 
  it("links many via FK field name", () => {
    tagModel.create({ id: "t1", label: "ts" });
    tagModel.create({ id: "t2", label: "js" });

    const post = postModel.create({ id: "p1", title: "Hello", tag_ids: ["t1", "t2"] });

    expect(post.tags.$ids.getState()).toEqual(["t1", "t2"]);
  });

  it("links many via ref field name (still works)", () => {
    tagModel.create({ id: "t3", label: "rust" });

    const post = postModel.create({ id: "p2", title: "World", tags: { connect: ["t3"] } });

    expect(post.tags.$ids.getState()).toEqual(["t3"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. INVERSE REF DATA — link by ID
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse create: link by ID", () => {
  const categoryContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("todos", "many")
    .pk("id");
  const categoryModel = createModel({ contract: categoryContract });

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .inverse("category", "todos")
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { category: () => categoryModel },
  });
 
  it("links to existing source instance by ID", () => {
    const cat = categoryModel.create({ id: "cat-work", name: "Work" });

    todoModel.create({ id: "t1", title: "Review PRs", category: "cat-work" });

    expect(cat.todos.$ids.getState()).toContain("t1");
  });

  it("multiple todos linked to same category", () => {
    const cat = categoryModel.create({ id: "cat-home", name: "Home" });

    todoModel.create({ id: "t2", title: "Clean", category: "cat-home" });
    todoModel.create({ id: "t3", title: "Cook", category: "cat-home" });

    expect(cat.todos.$ids.getState()).toContain("t2");
    expect(cat.todos.$ids.getState()).toContain("t3");
  });

  it("omitted inverse data is no-op (backward compat)", () => {
    todoModel.create({ id: "t4", title: "Standalone" });

    // No error, no link
    expect(todoModel.get("t4")?.$title.getState()).toBe("Standalone");
  });

  it("throws when source instance doesn't exist", () => {
    expect(() => {
      todoModel.create({ id: "t5", title: "Bad", category: "nonexistent" });
    }).toThrow(/source instance "nonexistent" not found/);
  });

  it("throws when inverse is not bound", () => {
    const unboundContract = createContract()
      .store("id", (s) => s<string>())
      .inverse("owner", "items")
      .pk("id");
    const unboundModel = createModel({ contract: unboundContract });
    // No .bind() call — resolveInverses falls back to self which lacks "items" ref

    expect(() => {
      unboundModel.create({ id: "x1", owner: "someone" });
    }).toThrow(/source model has no ref field "items"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. INVERSE REF DATA — inline create source
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse create: inline create source", () => {
  const categoryContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("todos", "many")
    .pk("id");
  const categoryModel = createModel({ contract: categoryContract });

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .inverse("category", "todos")
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { category: () => categoryModel },
  });
 
  it("creates source instance inline and links", () => {
    todoModel.create({
      id: "t1",
      title: "Review PRs",
      category: { create: { id: "cat-new", name: "New Category" } },
    });

    const cat = categoryModel.get("cat-new");
    expect(cat?.$name.getState()).toBe("New Category");
    expect(cat?.todos.$ids.getState()).toContain("t1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. INVERSE REF DATA — "one" ref source
// ─────────────────────────────────────────────────────────────────────────────

describe("Inverse create: one ref source", () => {
  const taskContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .ref("assignedTo", "one")
    .pk("id");
  const taskModel = createModel({ contract: taskContract });

  const workerContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .inverse("task", "assignedTo")
    .pk("id");
  const workerModel = createModel({ contract: workerContract,
    refs: { task: () => taskModel },
  });
 
  it("links via one ref source", () => {
    const task = taskModel.create({ id: "task-1", title: "Build" });

    workerModel.create({ id: "w1", name: "Alice", task: "task-1" });

    expect(task.assignedTo.$id.getState()).toBe("w1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. onDelete INTERACTIONS with ref-created links
// ─────────────────────────────────────────────────────────────────────────────

describe("onDelete after inverse-created link", () => {
  it("cascade: deleting source cascades to target linked via inverse", () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const itemModel = createModel({ contract: itemContract });

    const boxContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "cascade" })
      .pk("id");
    const boxModel = createModel({ contract: boxContract,
    refs: { items: () => itemModel },
  });
   
    const invContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .inverse("box", "items")
      .pk("id");
    const invModel = createModel({ contract: invContract,
    refs: { box: () => boxModel },
  });
   
    boxModel.create({ id: "box1" });
    invModel.create({ id: "i1", name: "A", box: "box1" });

    expect(boxModel.get("box1")?.items.$ids.getState()).toContain("i1");

    // Deleting box should cascade-delete i1 from itemModel (the ref target)
    boxModel.delete("box1");
    expect(itemModel.$ids.getState()).not.toContain("i1");
  });

  it("restrict: prevents delete when inverse-created link exists", () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const itemModel = createModel({ contract: itemContract });

    const boxContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "restrict" })
      .pk("id");
    const boxModel = createModel({ contract: boxContract,
    refs: { items: () => itemModel },
  });
   
    const invContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .inverse("box", "items")
      .pk("id");
    const invModel = createModel({ contract: invContract,
    refs: { box: () => boxModel },
  });
   
    boxModel.create({ id: "box1" });
    invModel.create({ id: "i1", name: "A", box: "box1" });

    expect(() => boxModel.delete("box1")).toThrow(/restrict/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MIXED — ref data + FK data + inverse data
// ─────────────────────────────────────────────────────────────────────────────

describe("Mixed: ref + FK + inverse in single create", () => {
  const tagContract = createContract()
    .store("id", (s) => s<string>())
    .store("label", (s) => s<string>())
    .pk("id");
  const tagModel = createModel({ contract: tagContract });

  const scheduleContract = createContract()
    .store("id", (s) => s<string>())
    .store("time", (s) => s<string>())
    .pk("id");
  const scheduleModel = createModel({ contract: scheduleContract });

  const teamContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("members", "many")
    .pk("id");
  const teamModel = createModel({ contract: teamContract });

  const userContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("schedule_id", (s) => s<string>().default(""))
    .ref("tags", "many")
    .ref("schedule", "one", { fk: "schedule_id" })
    .inverse("team", "members")
    .pk("id");
  const userModel = createModel({ contract: userContract,
    refs: { tags: () => tagModel, schedule: () => scheduleModel, team: () => teamModel },
  });
 
  it("combines ref, FK, and inverse in one create", () => {
    tagModel.create({ id: "tag-ts", label: "TypeScript" });
    scheduleModel.create({ id: "sched-1", time: "9-17" });
    const team = teamModel.create({ id: "team-a", name: "Alpha" });

    const user = userModel.create({
      id: "u1",
      name: "oleg",
      tags: { connect: ["tag-ts"] },
      schedule_id: "sched-1",
      team: "team-a",
    });

    expect(user.tags.$ids.getState()).toEqual(["tag-ts"]);
    expect(user.schedule.$id.getState()).toBe("sched-1");
    expect(team.members.$ids.getState()).toContain("u1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SSR TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("SSR: FK mapping with scope", () => {
  const scheduleModel = makeScheduleModel();

  const userContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("schedule_id", (s) => s<string>().default(""))
    .ref("schedule", "one", { fk: "schedule_id" })
    .pk("id");
  const userModel = createModel({ contract: userContract,
    refs: { schedule: () => scheduleModel },
  });
 
  it("FK mapping works in scoped create", async () => {
    const scope = fork();

    await scheduleModel.create({ id: "s1", time: "12-15" }, { scope });
    await userModel.create({ id: "u1", name: "oleg", schedule_id: "s1" }, { scope });

    const user = userModel.get("u1")!;
    expect(scope.getState(user.schedule.$id)).toBe("s1");
  });
});

describe("SSR: inverse linking with scope", () => {
  const categoryContract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("todos", "many")
    .pk("id");
  const categoryModel = createModel({ contract: categoryContract });

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .inverse("category", "todos")
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { category: () => categoryModel },
  });
 
  it("inverse linking works in scoped create", async () => {
    const scope = fork();

    await categoryModel.create({ id: "cat-1", name: "Work" }, { scope });
    await todoModel.create({ id: "t1", title: "Review", category: "cat-1" }, { scope });

    const cat = categoryModel.get("cat-1")!;
    expect(scope.getState(cat.todos.$ids)).toContain("t1");
  });

  it("two scopes with different inverse data", async () => {
    const scope1 = fork();
    const scope2 = fork();

    await categoryModel.create({ id: "cat-s", name: "Shared" }, { scope: scope1 });
    await categoryModel.create({ id: "cat-s", name: "Shared" }, { scope: scope2 });

    await todoModel.create({ id: "ts1", title: "Todo A", category: "cat-s" }, { scope: scope1 });
    await todoModel.create({ id: "ts2", title: "Todo B", category: "cat-s" }, { scope: scope2 });

    const cat = categoryModel.get("cat-s")!;
    expect(scope1.getState(cat.todos.$ids)).toContain("ts1");
    expect(scope2.getState(cat.todos.$ids)).toContain("ts2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. MEMORY LEAK TESTS
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("MEMORY: FK create/delete cycle", () => {
  it("bounded heap growth with FK mapping", () => {
    const scheduleContract = createContract()
      .store("id", (s) => s<string>())
      .store("time", (s) => s<string>())
      .pk("id");
    const scheduleModel = createModel({ contract: scheduleContract });

    const userContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .store("schedule_id", (s) => s<string>().default(""))
      .ref("schedule", "one", { fk: "schedule_id" })
      .pk("id");
    const userModel = createModel({ contract: userContract,
    refs: { schedule: () => scheduleModel },
  });
   
    scheduleModel.create({ id: "fixed-sched", time: "9-17" });

    // Warmup
    for (let i = 0; i < 50; i++) {
      userModel.create({ id: "warmup-fk", name: "w", schedule_id: "fixed-sched" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      userModel.create({ id: "fk-leak-test", name: "u", schedule_id: "fixed-sched" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[FK create] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);
  });
});

describe("MEMORY: inverse create/delete cycle", () => {
  it("bounded heap growth with inverse linking", () => {
    const categoryContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("todos", "many")
      .pk("id");
    const categoryModel = createModel({ contract: categoryContract });

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .inverse("category", "todos")
      .pk("id");
    const todoModel = createModel({ contract: todoContract,
    refs: { category: () => categoryModel },
  });
   
    categoryModel.create({ id: "mem-cat", name: "Persistent" });

    // Warmup
    for (let i = 0; i < 50; i++) {
      todoModel.create({ id: "warmup-inv", title: `w${i}`, category: "mem-cat" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      todoModel.create({ id: "inv-leak-test", title: `t${i}`, category: "mem-cat" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[inverse create] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    // With virtual stores backed by $dataMap, inverse linking adds overhead
    // from combine() derivations and ref subscriptions per replacement cycle.
    expect(growthMB).toBeLessThan(55);
  });
});
