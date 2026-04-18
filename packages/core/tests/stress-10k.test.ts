import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { gt, lt } from "../layers/query";

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

const MB = 1024 * 1024;

function makeUserModel(name: string) {
  return createModel({
    name,
    contract: createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .store("age", (s) => s<number>())
      .store("role", (s) => s<string>().default("user"))
      .store("score", (s) => s<number>().default(0))
      .store("active", (s) => s<boolean>().default(true))
      .pk("id"),
  });
}

// ─── Bulk creation benchmarks ────────────────────────────────────────────────

describe("STRESS: bulk creation", () => {
  it("500 instances — create + set + verify", () => {
    const model = makeUserModel("s500");
    const insts = Array.from({ length: 500 }, (_, i) =>
      model.create({ name: `U${i}`, age: 20 + (i % 60) }),
    );
    expect(model.$ids.getState()).toHaveLength(500);
    insts[0]!.$score.set(42);
    insts[499]!.$score.set(77);
    expect(insts[0]!.$score.getState()).toBe(42);
    expect(insts[499]!.$score.getState()).toBe(77);
  });

  it("1000 instances — create loop timing", () => {
    const model = makeUserModel("s1k");
    const start = performance.now();
    for (let i = 0; i < 1_000; i++) model.create({ name: `U${i}`, age: 20 + (i % 60) });
    const ms = performance.now() - start;
    expect(model.$ids.getState()).toHaveLength(1_000);
    console.log(`[1K create loop] ${ms.toFixed(0)}ms`);
  });

  it("200 instances — createMany batched timing", () => {
    const model = makeUserModel("s200b");
    const items = Array.from({ length: 200 }, (_, i) => ({ name: `U${i}`, age: 20 + (i % 60) }));
    const start = performance.now();
    model.createMany(items);
    console.log(`[200 createMany] ${(performance.now() - start).toFixed(0)}ms`);
    expect(model.$ids.getState()).toHaveLength(200);
  });

  it("1000 instances — createMany batched timing", () => {
    const model = makeUserModel("s1kb");
    const items = Array.from({ length: 1_000 }, (_, i) => ({
      name: `U${i}`,
      age: 20 + (i % 60),
    }));
    const start = performance.now();
    const insts = model.createMany(items);
    const ms = performance.now() - start;
    expect(model.$ids.getState()).toHaveLength(1_000);
    expect(insts).toHaveLength(1_000);
    expect(insts[500]!.$name.getState()).toBe("U500");
    console.log(`[1K createMany] ${ms.toFixed(0)}ms`);
  });
});

// ─── Field updates ───────────────────────────────────────────────────────────

describe("STRESS: field updates", () => {
  it("500 .set() calls", () => {
    const model = makeUserModel("u500");
    const insts = Array.from({ length: 500 }, (_, i) =>
      model.create({ name: `U${i}`, age: 20 }),
    );
    const start = performance.now();
    for (const inst of insts) inst.$score.set(42);
    const ms = performance.now() - start;
    expect(insts[250]!.$score.getState()).toBe(42);
    console.log(`[500 set] ${ms.toFixed(0)}ms`);
  });
});

// ─── Query pipeline ──────────────────────────────────────────────────────────

describe("STRESS: query", () => {
  it("WHERE on 500 instances", () => {
    const model = makeUserModel("q500");
    for (let i = 0; i < 500; i++) model.create({ name: `U${i}`, age: 18 + (i % 60) });

    const q = model.query().where("age", gt(50));
    const ages = q.field("age").$values.getState();
    expect(ages.length).toBeGreaterThan(0);
    for (const age of ages) expect(age).toBeGreaterThan(50);
    console.log(`[500 WHERE] ${ages.length} results`);
  });

  it("WHERE + ORDER BY + LIMIT on 500", () => {
    const model = makeUserModel("q500c");
    for (let i = 0; i < 500; i++) {
      model.create({ name: `U${String(i).padStart(4, "0")}`, age: 18 + (i % 60) });
    }
    const q = model.query().where("age", gt(30)).where("age", lt(50)).orderBy("name", "asc").limit(50);
    const names = q.field("name").$values.getState();
    expect(names.length).toBeLessThanOrEqual(50);
    expect(names.length).toBeGreaterThan(0);
    for (let i = 1; i < names.length; i++) {
      expect(names[i - 1]! <= names[i]!).toBe(true);
    }
  });

  it("query memoization", () => {
    const model = makeUserModel("q500m");
    for (let i = 0; i < 500; i++) model.create({ name: `U${i}`, age: 20 + (i % 60) });
    expect(model.query().where("age", gt(40))).toBe(model.query().where("age", gt(40)));
  });
});

// ─── Handler pooling ─────────────────────────────────────────────────────────

describe("STRESS: handler pooling", () => {
  it(".set events route through pooled fieldUpdated — not per-instance $dataMap.on()", () => {
    const model = makeUserModel("hp500");
    const insts = Array.from({ length: 500 }, (_, i) =>
      model.create({ name: `U${i}`, age: 20 }),
    );

    // Verify .set still works
    insts[0]!.$score.set(99);
    expect(insts[0]!.$score.getState()).toBe(99);

    // The .set event is created via fieldUpdated.prepend() — check it's an event
    const set = insts[0]!.$score.set;
    expect(typeof set).toBe("function");
    expect((set as { kind?: string }).kind).toBe("event");
  });
});

// ─── Heap ────────────────────────────────────────────────────────────────────

describe("STRESS: heap", () => {
  it("create/delete 500 × 5 cycles — bounded heap", () => {
    const model = makeUserModel("h500");
    const before = measureHeap();
    for (let batch = 0; batch < 5; batch++) {
      for (let i = 0; i < 500; i++) model.create({ name: `U${batch * 500 + i}`, age: 25 });
      model.clear();
    }
    const growth = (measureHeap() - before) / MB;
    console.log(`[500×5 create/delete] heap growth: ${growth.toFixed(2)} MB`);
    expect(growth).toBeLessThan(20);
  });
});

// ─── $idSet O(1) lookup ─────────────────────────────────────────────────────

describe("STRESS: $idSet lookup", () => {
  it("instance() lookups on 1K model — O(1)", () => {
    const model = makeUserModel("id1k");
    const insts = Array.from({ length: 1_000 }, (_, i) =>
      model.create({ name: `U${i}`, age: 20 }),
    );

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      const id = insts[(i * 7) % 1_000]!.__id;
      const $inst = model.instance(id);
      expect($inst.getState()).not.toBeNull();
    }
    const ms = performance.now() - start;
    console.log(`[200 lookups on 1K] ${ms.toFixed(0)}ms`);
  });
});

// ─── Rapid create/delete ────────────────────────────────────────────────────

describe("STRESS: rapid create/delete cycles", () => {
  it("100 × 10 cycles — no leaks", () => {
    const model = makeUserModel("rcd");
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 100; i++) model.create({ name: `C${cycle}-U${i}`, age: 20 });
      expect(model.$ids.getState()).toHaveLength(100);
      model.clear();
      expect(model.$ids.getState()).toHaveLength(0);
    }
  });
});
