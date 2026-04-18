import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { gt, gte } from "../layers/query";

// ─── Helpers ───

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

function createUserModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("age", (s) => s<number>())
    .store("role", (s) => s<string>().default("user"))
    .store("score", (s) => s<number>().default(0))
    .pk("id");

  return createModel({ contract });
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY: MEMOIZATION — no store growth on repeated access
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY MEMORY: memoization prevents store growth", () => {
  it("accessing $ids 100 times returns same store instance (memoization)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const query = model.query().where("age", gt(20));
    const first = query.$ids;

    for (let i = 0; i < 100; i++) {
      expect(query.$ids).toBe(first);
    }
  });

  it("accessing $count 100 times returns same store instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const query = model.query().where("age", gt(20));
    const first = query.$count;

    for (let i = 0; i < 100; i++) {
      expect(query.$count).toBe(first);
    }
  });

  it("accessing $totalCount 100 times returns same store instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const query = model.query().where("age", gt(20)).limit(5);
    const first = query.$totalCount;

    for (let i = 0; i < 100; i++) {
      expect(query.$totalCount).toBe(first);
    }
  });

  it("accessing field() 100 times returns same QueryField instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const query = model.query();
    const first = query.field("name");

    for (let i = 0; i < 100; i++) {
      expect(query.field("name")).toBe(first);
    }
  });

  it("field().$values 100 times returns same store instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const field = model.query().field("name");
    const first = field.$values;

    for (let i = 0; i < 100; i++) {
      expect(field.$values).toBe(first);
    }
  });

  it("field().update 100 times returns same event instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const field = model.query().field("score");
    const first = field.update;

    for (let i = 0; i < 100; i++) {
      expect(field.update).toBe(first);
    }
  });

  it("field().updated 100 times returns same event instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const field = model.query().field("score");
    const first = field.updated;

    for (let i = 0; i < 100; i++) {
      expect(field.updated).toBe(first);
    }
  });

  it("query.update 100 times returns same event instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const query = model.query();
    const first = query.update;

    for (let i = 0; i < 100; i++) {
      expect(query.update).toBe(first);
    }
  });

  it("query.delete 100 times returns same event instance", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const query = model.query();
    const first = query.delete;

    for (let i = 0; i < 100; i++) {
      expect(query.delete).toBe(first);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY: QUERY MEMOIZATION — same descriptor = same query
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY MEMORY: query registry memoization", () => {
  it("same where() chain returns identical query object", () => {
    const model = createUserModel();

    for (let i = 0; i < 50; i++) {
      const q = model.query().where("age", gt(30));
      expect(q).toBe(model.query().where("age", gt(30)));
    }
  });

  it("same where().orderBy().limit() chain returns identical query", () => {
    const model = createUserModel();

    const q1 = model.query().where("age", gt(30)).orderBy("name", "asc").limit(10);
    const q2 = model.query().where("age", gt(30)).orderBy("name", "asc").limit(10);
    expect(q1).toBe(q2);
  });

  it("query() always returns same root query", () => {
    const model = createUserModel();

    for (let i = 0; i < 100; i++) {
      expect(model.query()).toBe(model.query());
    }
  });

  it("groupBy returns same GroupedQuery for same field", () => {
    const model = createUserModel();

    const g1 = model.query().groupBy("role");
    const g2 = model.query().groupBy("role");
    expect(g1).toBe(g2);
  });

  it("group() returns same sub-query for same key", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });

    const grouped = model.query().groupBy("role");
    const a1 = grouped.group("admin");
    const a2 = grouped.group("admin");
    expect(a1).toBe(a2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY: HEAP GROWTH — instance churn doesn't leak via query
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY MEMORY: heap growth", () => {
  it("replacing instances with active query — bounded heap", () => {
    const model = createUserModel();
    const query = model.query().where("age", gt(20));

    // Access all terminals to create stores
    query.$ids;
    query.$count;

    // Warmup
    for (let i = 0; i < 50; i++) {
      model.create({ id: "churn", name: `W${i}`, age: 25 });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 300; i++) {
      model.create({ id: "churn", name: `R${i}`, age: 25 });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[query-churn] heap growth: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(15);
  });

  it("creating and querying many instances — bounded heap", () => {
    const model = createUserModel();
    const query = model.query().where("age", gte(0)).orderBy("age", "asc").limit(10);
    query.$ids;

    // Warmup
    for (let i = 0; i < 50; i++) {
      model.create({ id: `w${i}`, name: `W${i}`, age: i });
    }
    model.clear();

    const heapBefore = measureHeap();
    for (let i = 0; i < 200; i++) {
      model.create({ id: `i${i}`, name: `I${i}`, age: i });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[query-many] heap growth: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(20);

    model.clear();
  });

  it("accessing many different field() names — does not explode", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin", score: 100 });

    const query = model.query();

    // Access all queryable fields
    query.field("name");
    query.field("age");
    query.field("role");
    query.field("score");

    // Access terminals on each
    query.field("name").$values;
    query.field("age").$values;
    query.field("role").$values;
    query.field("score").$values;

    // Should not create duplicate fields
    expect(query.field("name")).toBe(query.field("name"));
    expect(query.field("age")).toBe(query.field("age"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY: BEHAVIORAL — old watcher cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY MEMORY: behavioral cleanup", () => {
  it("query.delete followed by re-create — query updates correctly", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 35 });

    const query = model.query();
    expect(query.$count.getState()).toBe(2);

    // Delete all
    query.delete();
    expect(query.$count.getState()).toBe(0);

    // Re-create
    model.create({ id: "3", name: "C", age: 40 });
    expect(query.$count.getState()).toBe(1);
  });

  it("instance replacement updates query without growing watchers", () => {
    const model = createUserModel();
    const query = model.query().where("age", gt(20));
    const updates: number[] = [];

    // Track how many times $count changes
    query.$count.watch((c) => updates.push(c));

    // Replace same ID many times
    for (let i = 0; i < 20; i++) {
      model.create({ id: "x", name: `V${i}`, age: 25 });
    }

    // $count should always be 1 (replacing same ID, always matches)
    expect(query.$count.getState()).toBe(1);
  });

  it("model.clear() empties all query results", () => {
    const model = createUserModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: `${i}`, name: `U${i}`, age: i * 10 });
    }

    const over30 = model.query().where("age", gt(30));
    const all = model.query();

    expect(all.$count.getState()).toBe(10);
    expect(over30.$count.getState()).toBeGreaterThan(0);

    model.clear();

    expect(all.$count.getState()).toBe(0);
    expect(over30.$count.getState()).toBe(0);
    expect(over30.$ids.getState()).toEqual([]);
  });
});
