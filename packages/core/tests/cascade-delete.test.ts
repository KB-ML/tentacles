import { describe, expect, it } from "vitest";
import { allSettled, fork } from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// CASCADE DELETE POLICY TESTS
//
// Tests for onDelete: "cascade" | "restrict" | "nullify" on ref declarations.
// Policy direction: when the OWNER instance is deleted, what happens to targets.
// ─────────────────────────────────────────────────────────────────────────────

function makeItemModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .pk("id");
  return createModel({ contract });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CASCADE — MANY
// ─────────────────────────────────────────────────────────────────────────────

describe("CASCADE: many ref", () => {
  const itemModel = makeItemModel();

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .ref("items", "many", { onDelete: "cascade" })
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { items: () => itemModel },
  });
 
  it("delete owner cascades to all targets", () => {
    itemModel.create({ id: "ci1", name: "a" });
    itemModel.create({ id: "ci2", name: "b" });
    const todo = todoModel.create({ id: "ct1" });
    todo.items.add("ci1");
    todo.items.add("ci2");

    todoModel.delete("ct1");

    expect(itemModel.$ids.getState()).not.toContain("ci1");
    expect(itemModel.$ids.getState()).not.toContain("ci2");
    expect(todoModel.$ids.getState()).not.toContain("ct1");
  });

  it("cascade on empty ref is no-op", () => {
    const todo = todoModel.create({ id: "ct2" });
    expect(() => todoModel.delete("ct2")).not.toThrow();
    expect(todoModel.$ids.getState()).not.toContain("ct2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CASCADE — ONE
// ─────────────────────────────────────────────────────────────────────────────

describe("CASCADE: one ref (SQL direction)", () => {
  const itemModel = makeItemModel();

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .ref("current", "one", { onDelete: "cascade" })
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { current: () => itemModel },
  });

  it("delete target cascades to owner (SQL: ON DELETE CASCADE on FK)", () => {
    itemModel.create({ id: "co1", name: "x" });
    const todo = todoModel.create({ id: "cot1" });
    todo.current.set("co1");

    // Delete the TARGET (item). In SQL direction, cascade on the owner's
    // `current` FK fires here: the owning `todo` goes with it.
    itemModel.delete("co1");

    expect(itemModel.$ids.getState()).not.toContain("co1");
    expect(todoModel.$ids.getState()).not.toContain("cot1");
  });

  it("deleting owner leaves target untouched (cascade is on the FK, not the ref holder)", () => {
    itemModel.create({ id: "co2", name: "x" });
    const todo = todoModel.create({ id: "cot3" });
    todo.current.set("co2");

    todoModel.delete("cot3");

    expect(itemModel.$ids.getState()).toContain("co2");
    expect(todoModel.$ids.getState()).not.toContain("cot3");
  });

  it("cascade one with null ref is no-op", () => {
    const todo = todoModel.create({ id: "cot2" });
    expect(() => todoModel.delete("cot2")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RESTRICT — MANY
// ─────────────────────────────────────────────────────────────────────────────

describe("RESTRICT: many ref", () => {
  const itemModel = makeItemModel();

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .ref("items", "many", { onDelete: "restrict" })
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { items: () => itemModel },
  });
 
  it("restrict blocks deletion when ref is non-empty", () => {
    itemModel.create({ id: "ri1", name: "a" });
    const todo = todoModel.create({ id: "rt1" });
    todo.items.add("ri1");

    expect(() => todoModel.delete("rt1")).toThrow(/restrict policy/);
    // Nothing was deleted
    expect(todoModel.$ids.getState()).toContain("rt1");
    expect(itemModel.$ids.getState()).toContain("ri1");
  });

  it("restrict allows deletion when ref is empty", () => {
    const todo = todoModel.create({ id: "rt2" });
    expect(() => todoModel.delete("rt2")).not.toThrow();
    expect(todoModel.$ids.getState()).not.toContain("rt2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESTRICT — ONE
// ─────────────────────────────────────────────────────────────────────────────

describe("RESTRICT: one ref (SQL direction)", () => {
  const itemModel = makeItemModel();

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .ref("current", "one", { onDelete: "restrict" })
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { current: () => itemModel },
  });

  it("restrict blocks deletion of a target while it's still referenced", () => {
    itemModel.create({ id: "roi1", name: "x" });
    const todo = todoModel.create({ id: "rot1" });
    todo.current.set("roi1");

    // Deleting the TARGET is blocked because a source (todo) still points at it.
    expect(() => itemModel.delete("roi1")).toThrow(/restrict policy/);
    expect(itemModel.$ids.getState()).toContain("roi1");
    expect(todoModel.$ids.getState()).toContain("rot1");
  });

  it("deleting the owner is always allowed (it holds the FK, not the target)", () => {
    itemModel.create({ id: "roi2", name: "x" });
    const todo = todoModel.create({ id: "rot3" });
    todo.current.set("roi2");

    expect(() => todoModel.delete("rot3")).not.toThrow();
    expect(todoModel.$ids.getState()).not.toContain("rot3");
    // Target survives — now unreferenced — and can be deleted.
    expect(() => itemModel.delete("roi2")).not.toThrow();
  });

  it("restrict allows target deletion when no source references it", () => {
    itemModel.create({ id: "roi3", name: "x" });
    expect(() => itemModel.delete("roi3")).not.toThrow();
    expect(itemModel.$ids.getState()).not.toContain("roi3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. NULLIFY — DEFAULT BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────

describe("NULLIFY: default behavior", () => {
  const itemModel = makeItemModel();

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .ref("items", "many")
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { items: () => itemModel },
  });
 
  it("targets are untouched when owner is deleted (backward compat)", () => {
    itemModel.create({ id: "ni1", name: "a" });
    itemModel.create({ id: "ni2", name: "b" });
    const todo = todoModel.create({ id: "nt1" });
    todo.items.add("ni1");
    todo.items.add("ni2");

    todoModel.delete("nt1");

    expect(itemModel.$ids.getState()).toContain("ni1");
    expect(itemModel.$ids.getState()).toContain("ni2");
    expect(todoModel.$ids.getState()).not.toContain("nt1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. MIXED POLICIES
// ─────────────────────────────────────────────────────────────────────────────

describe("MIXED: restrict + cascade on same model", () => {
  const itemModel = makeItemModel();
  const tagModel = (() => {
    const c = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    return createModel({ contract: c });
  })();

  const todoContract = createContract()
    .store("id", (s) => s<string>())
    .ref("items", "many", { onDelete: "cascade" })
    .ref("tags", "many", { onDelete: "restrict" })
    .pk("id");
  const todoModel = createModel({ contract: todoContract,
    refs: { items: () => itemModel, tags: () => tagModel },
  });
 
  it("restrict blocks deletion even if other refs are cascade", () => {
    itemModel.create({ id: "mi1", name: "a" });
    tagModel.create({ id: "mt1" });
    const todo = todoModel.create({ id: "mx1" });
    todo.items.add("mi1");
    todo.tags.add("mt1");

    expect(() => todoModel.delete("mx1")).toThrow(/restrict policy/);
    // Nothing was deleted — atomicity
    expect(todoModel.$ids.getState()).toContain("mx1");
    expect(itemModel.$ids.getState()).toContain("mi1");
    expect(tagModel.$ids.getState()).toContain("mt1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CASCADE CHAIN A → B → C
// ─────────────────────────────────────────────────────────────────────────────

describe("CASCADE CHAIN: A → B → C", () => {
  it("delete A cascades through B to C", () => {
    const cContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const cModel = createModel({ contract: cContract });

    const bContract = createContract()
      .store("id", (s) => s<string>())
      .ref("children", "many", { onDelete: "cascade" })
      .pk("id");
    const bModel = createModel({ contract: bContract,
    refs: { children: () => cModel },
  });
   
    const aContract = createContract()
      .store("id", (s) => s<string>())
      .ref("children", "many", { onDelete: "cascade" })
      .pk("id");
    const aModel = createModel({ contract: aContract,
    refs: { children: () => bModel },
  });
   
    cModel.create({ id: "c1" });
    cModel.create({ id: "c2" });
    const b = bModel.create({ id: "b1" });
    b.children.add("c1");
    b.children.add("c2");
    const a = aModel.create({ id: "a1" });
    a.children.add("b1");

    aModel.delete("a1");

    expect(aModel.$ids.getState()).toEqual([]);
    expect(bModel.$ids.getState()).toEqual([]);
    expect(cModel.$ids.getState()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. RESTRICT BLOCKS CASCADE CHAIN
// ─────────────────────────────────────────────────────────────────────────────

describe("RESTRICT BLOCKS CASCADE CHAIN", () => {
  it("restrict on B blocks deletion of A (atomicity)", () => {
    const leafContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const leafModel = createModel({ contract: leafContract });

    const bContract = createContract()
      .store("id", (s) => s<string>())
      .ref("deps", "many", { onDelete: "restrict" })
      .pk("id");
    const bModel = createModel({ contract: bContract,
    refs: { deps: () => leafModel },
  });
   
    const aContract = createContract()
      .store("id", (s) => s<string>())
      .ref("children", "many", { onDelete: "cascade" })
      .pk("id");
    const aModel = createModel({ contract: aContract,
    refs: { children: () => bModel },
  });
   
    leafModel.create({ id: "leaf1" });
    const b = bModel.create({ id: "b1" });
    b.deps.add("leaf1");
    const a = aModel.create({ id: "a1" });
    a.children.add("b1");

    // A cascades to B, but B has restrict on non-empty deps → blocks
    expect(() => aModel.delete("a1")).toThrow(/restrict policy/);
    // Nothing deleted
    expect(aModel.$ids.getState()).toContain("a1");
    expect(bModel.$ids.getState()).toContain("b1");
    expect(leafModel.$ids.getState()).toContain("leaf1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CIRCULAR CASCADE
// ─────────────────────────────────────────────────────────────────────────────

describe("CIRCULAR CASCADE: A ↔ B", () => {
  it("cycle guard prevents infinite loop", () => {
    const aContract = createContract()
      .store("id", (s) => s<string>())
      .ref("partner", "one", { onDelete: "cascade" })
      .pk("id");
    const aModel = createModel({ contract: aContract,
    refs: { partner: () => bModel },
  });

    const bContract = createContract()
      .store("id", (s) => s<string>())
      .ref("partner", "one", { onDelete: "cascade" })
      .pk("id");
    const bModel = createModel({ contract: bContract,
    refs: { partner: () => aModel },
  });

      
    const a = aModel.create({ id: "a1" });
    const b = bModel.create({ id: "b1" });
    a.partner.set("b1");
    b.partner.set("a1");

    // Should not infinite loop
    aModel.delete("a1");

    expect(aModel.$ids.getState()).toEqual([]);
    expect(bModel.$ids.getState()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SELF-REFERENCING CASCADE (TREE)
// ─────────────────────────────────────────────────────────────────────────────

describe("SELF-REF CASCADE: tree deletion", () => {
  it("deleting root cascades to all descendants", () => {
    const treeContract = createContract()
      .store("id", (s) => s<string>())
      .ref("children", "many", { onDelete: "cascade" })
      .pk("id");
    const treeModel = createModel({ contract: treeContract });
    // Self-ref: no bind needed (defaults to self)

    const grandchild = treeModel.create({ id: "grandchild1" });
    const child1 = treeModel.create({ id: "child1" });
    const child2 = treeModel.create({ id: "child2" });
    child1.children.add("grandchild1");

    const root = treeModel.create({ id: "root" });
    root.children.add("child1");
    root.children.add("child2");

    treeModel.delete("root");

    expect(treeModel.$ids.getState()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10b. DELETE WITH NUMBER ID + INVERSE CHILDREN — regression for ghost-row bug
// ─────────────────────────────────────────────────────────────────────────────

describe("NUMBER IDs + inverse children: delete removes owner and nulls back-FK", () => {
  it("deleting a tree node with inverse('children') clears $ids, $count, and children's parentId", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("title", (s) => s<string>().default(""))
      .store("parentId", (s) => s<number | null>().default(null))
      .ref("parent", "one", { fk: "parentId" })
      .inverse("children", "parent")
      .pk("id");
    const m = createModel({ contract });
    const p = m.create({ title: "P" });
    const pid = p.$id.getState() as number;
    m.create({ title: "C1", parentId: pid });
    m.create({ title: "C2", parentId: pid });
    expect(m.$count.getState()).toBe(3);

    // User code may call delete with the raw (number) id from `$id.getState()`.
    // Pre-fix, this missed the stringified cache/registry and left a ghost.
    m.delete(pid);

    expect(m.$count.getState()).toBe(2);
    expect(m.$ids.getState().map(String)).not.toContain(String(pid));

    // Children are now orphans — their FK to the deleted parent must be null
    // so queries like `where("parentId", eq(null))` surface them as roots.
    const remaining = m.$ids.getState();
    const dataMap = (m as unknown as { _$dataMap: { getState: () => Record<string, Record<string, unknown>> } })
      ._$dataMap.getState();
    for (const cid of remaining) {
      expect(dataMap[String(cid)]?.parentId).toBeNull();
      expect(dataMap[String(cid)]?.parent).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. MODEL.CLEAR() WITH CASCADE
// ─────────────────────────────────────────────────────────────────────────────

describe("CLEAR with cascade (SQL direction)", () => {
  it("clearing the target side cascades through source FKs", () => {
    const childContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const childModel = createModel({ contract: childContract });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("child", "one", { onDelete: "cascade" })
      .pk("id");
    const parentModel = createModel({ contract: parentContract,
    refs: { child: () => childModel },
  });

    childModel.create({ id: "c1" });
    childModel.create({ id: "c2" });
    const p1 = parentModel.create({ id: "p1" });
    p1.child.set("c1");
    const p2 = parentModel.create({ id: "p2" });
    p2.child.set("c2");

    // Clear the targets: every parent whose FK pointed at a cleared child
    // cascade-deletes.
    childModel.clear();

    expect(childModel.$ids.getState()).toEqual([]);
    expect(parentModel.$ids.getState()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. DELETEFX INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteFx integration", () => {
  it("deleteFx triggers SQL-direction cascade (delete target → delete owners)", async () => {
    const childContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const childModel = createModel({ contract: childContract });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("child", "one", { onDelete: "cascade" })
      .pk("id");
    const parentModel = createModel({ contract: parentContract,
    refs: { child: () => childModel },
  });

    childModel.create({ id: "c1" });
    const p = parentModel.create({ id: "p1" });
    p.child.set("c1");

    await childModel.deleteFx("c1");

    expect(parentModel.$ids.getState()).toEqual([]);
    expect(childModel.$ids.getState()).toEqual([]);
  });

  it("deleteFx throws on restrict", async () => {
    const childContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const childModel = createModel({ contract: childContract });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("deps", "many", { onDelete: "restrict" })
      .pk("id");
    const parentModel = createModel({ contract: parentContract,
    refs: { deps: () => childModel },
  });
   
    childModel.create({ id: "c1" });
    const p = parentModel.create({ id: "p1" });
    p.deps.add("c1");

    try {
      await parentModel.deleteFx("p1");
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect((err as Error).message).toMatch(/restrict policy/);
    }
    expect(parentModel.$ids.getState()).toContain("p1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. ERROR MESSAGE DETAILS
// ─────────────────────────────────────────────────────────────────────────────

describe("RESTRICT error message", () => {
  it("includes model name, instance ID, and field name", () => {
    const depContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const depModel = createModel({ contract: depContract });

    const ownerContract = createContract()
      .store("id", (s) => s<string>())
      .ref("deps", "many", { onDelete: "restrict" })
      .pk("id");
    const ownerModel = createModel({ contract: ownerContract, name: "errOwner",
    refs: { deps: () => depModel },
  });
   
    depModel.create({ id: "d1" });
    const o = ownerModel.create({ id: "o1" });
    o.deps.add("d1");

    try {
      ownerModel.delete("o1");
      expect(true).toBe(false);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("errOwner");
      expect(msg).toContain("o1");
      expect(msg).toContain("deps");
      expect(msg).toContain("restrict");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. DELETE NON-EXISTENT ID
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE non-existent", () => {
  it("deleting non-existent ID is a no-op", () => {
    const c = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "cascade" })
      .pk("id");
    const m = createModel({ contract: c });
    expect(() => m.delete("doesnt-exist")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. SSR — SCOPED CASCADE
// ─────────────────────────────────────────────────────────────────────────────

describe("SSR: scoped cascade", () => {
  it("scoped delete cascades via scope reset, not global delete", async () => {
    const childContract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");
    const childModel = createModel({ contract: childContract });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("child", "one", { onDelete: "cascade" })
      .pk("id");
    const parentModel = createModel({ contract: parentContract,
    refs: { child: () => childModel },
  });
   
    const child = childModel.create({ id: "sc1", value: 10 });
    const parent = parentModel.create({ id: "sp1" });
    parent.child.set("sc1");

    const scope = fork();

    // Modify in scope
    await allSettled(child.$value.set, { scope, params: 99 });

    // Scoped delete — should reset scope values, not globally delete
    await parentModel.delete("sp1", scope);

    // Global state untouched
    expect(parentModel.$ids.getState()).toContain("sp1");
    expect(childModel.$ids.getState()).toContain("sc1");
    expect(child.$value.getState()).toBe(10);
  });

  it("scoped restrict throws", async () => {
    const depContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const depModel = createModel({ contract: depContract });

    const ownerContract = createContract()
      .store("id", (s) => s<string>())
      .ref("deps", "many", { onDelete: "restrict" })
      .pk("id");
    const ownerModel = createModel({ contract: ownerContract,
    refs: { deps: () => depModel },
  });
   
    depModel.create({ id: "sd1" });
    const o = ownerModel.create({ id: "so1" });
    o.deps.add("sd1");

    const scope = fork();

    try {
      await ownerModel.delete("so1", scope);
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toMatch(/restrict policy/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. MEMORY LEAK
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("MEMORY: cascade delete leak check", () => {
  it("cascade create/delete N pairs — bounded heap", () => {
    const childContract = createContract()
      .store("id", (s) => s<string>())
      .store("data", (s) => s<string>())
      .pk("id");
    const childModel = createModel({ contract: childContract });

    const parentContract = createContract()
      .store("id", (s) => s<string>())
      .ref("child", "one", { onDelete: "cascade" })
      .pk("id");
    const parentModel = createModel({ contract: parentContract,
    refs: { child: () => childModel },
  });
   
    // Warmup
    for (let i = 0; i < 50; i++) {
      childModel.create({ id: `wc${i}`, data: "x".repeat(1000) });
      const p = parentModel.create({ id: `wp${i}` });
      p.child.set(`wc${i}`);
      parentModel.delete(`wp${i}`);
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      childModel.create({ id: `mc${i}`, data: "x".repeat(1000) });
      const p = parentModel.create({ id: `mp${i}` });
      p.child.set(`mc${i}`);
      parentModel.delete(`mp${i}`);
    }

    const heapAfter = measureHeap();
    const growth = heapAfter - heapBefore;

    // Bounded growth: should not grow linearly with N
    // Allow 10MB slack for GC timing variance
    expect(growth).toBeLessThan(10 * 1024 * 1024);
  });
});
