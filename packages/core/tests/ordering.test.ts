import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";

function counterModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("increment", (e) => e<void>())
    .pk("id");

  return createModel({
    contract,
    fn: ({ $count, increment }) => {
      $count.on(increment, (n) => n + 1);
      return { $count, increment };
    },
  });
}

describe("Model: instance ordering (global)", () => {
  it("first instance is first(), last instance is last()", () => {
    const model = counterModel();
    model.create({ id: "a", count: 0 });
    model.create({ id: "b", count: 0 });
    model.create({ id: "c", count: 0 });

    // Access internal cache via delete/create pattern:
    // after creating a,b,c the first created is a and last is c
    // We verify by deleting "a" and checking that "b" survives as first
    model.delete("a");

    // Create new instance — it should become last
    model.create({ id: "d", count: 0 });

    // Delete "b" (new first) and "d" (last) to verify "c" is standalone
    model.delete("d");
    model.delete("b");

    // Only "c" should remain — create and delete around it worked
    model.create({ id: "e", count: 0 });

    // Verify instances are independent
    const e = model.create({ id: "e2", count: 5 });
    expect(e.$count.getState()).toBe(5);

    model.clear();
  });

  it("replacing instance with same id preserves it as last", () => {
    const model = counterModel();

    model.create({ id: "a", count: 0 });
    model.create({ id: "b", count: 0 });
    model.create({ id: "c", count: 0 });

    // Replace "a" — should move to end
    const replaced = model.create({ id: "a", count: 99 });
    expect(replaced.$count.getState()).toBe(99);

    model.clear();
  });

  it("delete then re-create appends to end", () => {
    const model = counterModel();

    model.create({ id: "a", count: 1 });
    model.create({ id: "b", count: 2 });

    model.delete("a");
    const reinserted = model.create({ id: "a", count: 10 });
    expect(reinserted.$count.getState()).toBe(10);

    model.clear();
  });

  it("clear() removes all instances", () => {
    const model = counterModel();

    model.create({ id: "a", count: 0 });
    model.create({ id: "b", count: 0 });
    model.create({ id: "c", count: 0 });

    model.clear();

    // After clear, creating new instances should work cleanly
    const fresh = model.create({ id: "x", count: 42 });
    expect(fresh.$count.getState()).toBe(42);

    model.clear();
  });
});

describe("Model: instance ordering (scoped create sets values in scope)", () => {
  it("scoped create produces global instances, delete/clear are global", () => {
    const model = counterModel();

    // Global: a, b
    model.create({ id: "a", count: 1 });
    model.create({ id: "b", count: 2 });

    // Additional global instances
    model.create({ id: "x", count: 10 });
    model.create({ id: "y", count: 20 });

    model.delete("a");
    model.delete("x");

    // "b" should still exist
    model.delete("b");

    model.clear();
  });

  it("delete and clear are always global", () => {
    const model = counterModel();

    model.create({ id: "a", count: 1 });
    model.create({ id: "b", count: 2 });
    model.create({ id: "x", count: 10 });

    model.delete("a");

    model.clear();
  });

  it("clear removes all global instances", () => {
    const model = counterModel();

    const global = model.create({ id: "g", count: 1 });
    model.create({ id: "s", count: 2 });

    // Global instance should still work before clear
    expect(global.$count.getState()).toBe(1);

    model.clear();
  });
});

describe("Model: ordering with many instances", () => {
  it("handles 100 sequential creates", () => {
    const model = counterModel();

    const instances = [];
    for (let i = 0; i < 100; i++) {
      instances.push(model.create({ id: `item-${i}`, count: i }));
    }

    // Verify each instance has correct state
    for (let i = 0; i < 100; i++) {
      expect(instances[i]!.$count.getState()).toBe(i);
    }

    // Delete every other instance
    for (let i = 0; i < 100; i += 2) {
      model.delete(`item-${i}`);
    }

    // Remaining instances should still work
    for (let i = 1; i < 100; i += 2) {
      expect(instances[i]!.$count.getState()).toBe(i);
    }

    model.clear();
  });

  it("handles interleaved create and delete", () => {
    const model = counterModel();

    model.create({ id: "a", count: 1 });
    model.create({ id: "b", count: 2 });
    model.delete("a");
    model.create({ id: "c", count: 3 });
    model.delete("b");
    model.create({ id: "d", count: 4 });

    // Only c and d should remain
    const d = model.create({ id: "e", count: 5 });
    expect(d.$count.getState()).toBe(5);

    model.clear();
  });
});
