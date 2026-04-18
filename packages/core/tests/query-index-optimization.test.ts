import { describe, expect, it, test } from "vitest";
import { allSettled, createStore, fork, serialize } from "effector";
import { createContract, createModel } from "../index";
import { eq, gt, oneOf } from "../layers/query";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

function createIndexedModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("email", (s) => s<string>().unique())
    .store("role", (s) => s<string>().index())
    .store("name", (s) => s<string>())
    .store("age", (s) => s<number>())
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $email, $role, $name, $age }) => ({ $id, $email, $role, $name, $age }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("query index optimization", () => {
  describe("eq on unique field", () => {
    test("returns correct single result", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "alice@test.com", role: "admin", name: "Alice", age: 30 });
      model.create({ id: "u2", email: "bob@test.com", role: "user", name: "Bob", age: 25 });

      const q = model.query().where("email", eq("alice@test.com"));
      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u1"]);

      model.clear();
    });

    test("returns empty for non-existent value", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "alice@test.com", role: "admin", name: "Alice", age: 30 });

      const q = model.query().where("email", eq("nobody@test.com"));
      expect(q.$count.getState()).toBe(0);
      expect(q.$ids.getState()).toEqual([]);

      model.clear();
    });

    test("updates reactively when matching instance created", () => {
      const model = createIndexedModel();
      const q = model.query().where("email", eq("alice@test.com"));
      expect(q.$count.getState()).toBe(0);

      model.create({ id: "u1", email: "alice@test.com", role: "admin", name: "Alice", age: 30 });
      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u1"]);

      model.clear();
    });

    test("updates reactively when matching instance deleted", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "alice@test.com", role: "admin", name: "Alice", age: 30 });
      const q = model.query().where("email", eq("alice@test.com"));
      expect(q.$count.getState()).toBe(1);

      model.delete("u1");
      expect(q.$count.getState()).toBe(0);

      model.clear();
    });

    test("updates when unique field value changes", () => {
      const model = createIndexedModel();
      const alice = model.create({ id: "u1", email: "old@test.com", role: "admin", name: "Alice", age: 30 });
      const qOld = model.query().where("email", eq("old@test.com"));
      const qNew = model.query().where("email", eq("new@test.com"));

      expect(qOld.$count.getState()).toBe(1);
      expect(qNew.$count.getState()).toBe(0);

      alice.$email.set("new@test.com");

      expect(qOld.$count.getState()).toBe(0);
      expect(qNew.$count.getState()).toBe(1);

      model.clear();
    });
  });

  describe("eq on indexed (non-unique) field", () => {
    test("returns correct filtered set", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "admin", name: "B", age: 25 });
      model.create({ id: "u3", email: "c@t.com", role: "user", name: "C", age: 35 });

      const q = model.query().where("role", eq("admin"));
      expect(q.$count.getState()).toBe(2);
      expect(q.$ids.getState()).toEqual(["u1", "u2"]);

      model.clear();
    });

    test("updates when indexed field value changes", () => {
      const model = createIndexedModel();
      const a = model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "user", name: "B", age: 25 });

      const qAdmin = model.query().where("role", eq("admin"));
      const qUser = model.query().where("role", eq("user"));

      expect(qAdmin.$count.getState()).toBe(1);
      expect(qUser.$count.getState()).toBe(1);

      a.$role.set("user");

      expect(qAdmin.$count.getState()).toBe(0);
      expect(qUser.$count.getState()).toBe(2);

      model.clear();
    });
  });

  describe("oneOf on indexed field", () => {
    test("returns union of matching instances", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "editor", name: "B", age: 25 });
      model.create({ id: "u3", email: "c@t.com", role: "user", name: "C", age: 35 });

      const q = model.query().where("role", oneOf(["admin", "editor"]));
      expect(q.$count.getState()).toBe(2);
      expect(q.$ids.getState()).toEqual(expect.arrayContaining(["u1", "u2"]));

      model.clear();
    });

    test("oneOf with empty array returns empty", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });

      const q = model.query().where("role", oneOf([] as string[]));
      expect(q.$count.getState()).toBe(0);

      model.clear();
    });
  });

  describe("multiple WHERE clauses with one indexed", () => {
    test("indexed + non-indexed filters compose correctly", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "admin", name: "B", age: 40 });
      model.create({ id: "u3", email: "c@t.com", role: "user", name: "C", age: 50 });

      const q = model.query().where("role", eq("admin")).where("age", gt(35));
      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u2"]);

      model.clear();
    });

    test("non-indexed + indexed filters compose correctly", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "admin", name: "B", age: 40 });
      model.create({ id: "u3", email: "c@t.com", role: "user", name: "C", age: 50 });

      // Non-indexed clause first, then indexed — optimizer should still pick the indexed one
      const q = model.query().where("age", gt(35)).where("role", eq("admin"));
      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u2"]);

      model.clear();
    });
  });

  describe("reactive operand on indexed field", () => {
    test("updates when reactive operand store changes", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "user", name: "B", age: 25 });

      const $roleFilter = createStore("admin");
      const q = model.query().where("role", eq($roleFilter));

      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u1"]);

      ($roleFilter as any).setState("user");
      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u2"]);

      model.clear();
    });

    test("reactive oneOf on indexed field", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "A", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "editor", name: "B", age: 25 });
      model.create({ id: "u3", email: "c@t.com", role: "user", name: "C", age: 35 });

      const $roles = createStore(["admin", "editor"]);
      const q = model.query().where("role", oneOf($roles));

      expect(q.$count.getState()).toBe(2);

      ($roles as any).setState(["user"]);
      expect(q.$count.getState()).toBe(1);
      expect(q.$ids.getState()).toEqual(["u3"]);

      model.clear();
    });
  });

  describe("non-indexed field fallback", () => {
    test("query on non-indexed field still works (full scan)", () => {
      const model = createIndexedModel();
      model.create({ id: "u1", email: "a@t.com", role: "admin", name: "Alice", age: 30 });
      model.create({ id: "u2", email: "b@t.com", role: "user", name: "Bob", age: 25 });

      const q = model.query().where("name", eq("Alice"));
      expect(q.$count.getState()).toBe(1);
      expect(q.field("name").$values.getState()).toEqual(["Alice"]);

      model.clear();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("query index optimization: SSR", () => {
  it("indexed query returns correct results in fork scope", async () => {
    const model = createIndexedModel();
    const scope = fork();

    await model.create(
      { id: "s1", email: "s1@ssr.com", role: "admin", name: "S1", age: 30 },
      { scope },
    );
    await model.create(
      { id: "s2", email: "s2@ssr.com", role: "user", name: "S2", age: 25 },
      { scope },
    );

    const q = model.query().where("role", eq("admin"));
    expect(q.$count.getState()).toBe(1);

    model.clear();
  });

  it("serialize/hydrate preserves indexed query behavior", async () => {
    const model = createIndexedModel();
    const inst = model.create({ id: "h1", email: "h1@ssr.com", role: "admin", name: "H1", age: 30 });
    model.create({ id: "h2", email: "h2@ssr.com", role: "user", name: "H2", age: 25 });

    const scope = fork();
    await allSettled(inst.$role, { scope, params: "editor" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.$role)).toBe("editor");

    // Global query still sees admin
    const q = model.query().where("role", eq("admin"));
    expect(q.$count.getState()).toBe(1);

    model.clear();
  });

  it("indexed query returns correct results when client scope was hydrated via fork({values}) with empty $index", async () => {
    // Simulates the real two-process SSR pattern: server fires events, client
    // gets a fresh fork({values}) where $index was never populated by events.
    // The query layer must fall back to full scan and still return correct
    // results — the index is an optimization, never a correctness requirement.
    const model = createIndexedModel();

    // 1. "Server" — populate via scoped events
    const serverScope = fork();
    await model.create(
      { id: "u1", email: "alice@x.com", role: "admin", name: "Alice", age: 30 },
      { scope: serverScope },
    );
    await model.create(
      { id: "u2", email: "bob@x.com", role: "user", name: "Bob", age: 25 },
      { scope: serverScope },
    );
    await model.create(
      { id: "u3", email: "carol@x.com", role: "admin", name: "Carol", age: 35 },
      { scope: serverScope },
    );

    // 2. Serialize and hydrate into a fresh client scope
    const values = serialize(serverScope);
    const clientScope = fork({ values });

    // 3. eq on unique field — must find the hydrated row
    const qUnique = model.query().where("email", eq("alice@x.com"));
    expect(clientScope.getState(qUnique.$count)).toBe(1);
    expect(clientScope.getState(qUnique.$ids).map(String)).toEqual(["u1"]);

    // 4. eq on non-unique indexed field — must return all matches
    const qIndexed = model.query().where("role", eq("admin"));
    expect(clientScope.getState(qIndexed.$count)).toBe(2);
    expect(clientScope.getState(qIndexed.$ids).map(String).sort()).toEqual(["u1", "u3"]);

    // 5. oneOf on indexed field — must union all matching ids
    const qOneOf = model.query().where("role", oneOf(["admin", "user"]));
    expect(clientScope.getState(qOneOf.$count)).toBe(3);

    model.clear();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("query index optimization: PERFORMANCE", () => {
  test("eq on indexed field evaluates faster than eq on non-indexed field", () => {
    const model = createIndexedModel();

    // 1000 instances — 10 admins, rest users
    for (let i = 0; i < 1_000; i++) {
      model.create({
        id: `p${i}`,
        email: `p${i}@perf.com`,
        role: i < 10 ? "admin" : "user",
        name: `Name${i}`,
        age: 20 + (i % 50),
      });
    }

    // Warmup: force $dataMap and query registry initialization
    model.query().where("age", gt(0)).$count.getState();

    // Measure FIRST evaluation of indexed query (role is .index())
    const startIndexed = performance.now();
    model.query().where("role", eq("admin")).$count.getState();
    const indexedTime = performance.now() - startIndexed;

    // Measure FIRST evaluation of non-indexed query (name has no index)
    const startFull = performance.now();
    model.query().where("name", eq("Name5")).$count.getState();
    const fullTime = performance.now() - startFull;

    console.log(
      `[perf eq] indexed: ${indexedTime.toFixed(2)}ms, non-indexed: ${fullTime.toFixed(2)}ms, ` +
      `speedup: ${(fullTime / indexedTime).toFixed(1)}x`,
    );

    expect(indexedTime).toBeLessThan(fullTime);

    model.clear();
  });

  test("eq on unique field evaluates faster than eq on non-indexed field", () => {
    const model = createIndexedModel();

    for (let i = 0; i < 1_000; i++) {
      model.create({
        id: `p${i}`,
        email: `p${i}@perf.com`,
        role: i < 10 ? "admin" : "user",
        name: `Name${i}`,
        age: 20 + (i % 50),
      });
    }

    model.query().where("age", gt(0)).$count.getState();

    const startUnique = performance.now();
    model.query().where("email", eq("p500@perf.com")).$count.getState();
    const uniqueTime = performance.now() - startUnique;

    const startFull = performance.now();
    model.query().where("name", eq("Name500")).$count.getState();
    const fullTime = performance.now() - startFull;

    console.log(
      `[perf unique] unique: ${uniqueTime.toFixed(2)}ms, non-indexed: ${fullTime.toFixed(2)}ms, ` +
      `speedup: ${(fullTime / uniqueTime).toFixed(1)}x`,
    );

    expect(uniqueTime).toBeLessThan(fullTime);

    model.clear();
  });

  test("oneOf on indexed field evaluates faster than oneOf on non-indexed field", () => {
    const model = createIndexedModel();

    const roles = ["admin", "editor", "mod", "user", "guest"];
    for (let i = 0; i < 1_000; i++) {
      model.create({
        id: `p${i}`,
        email: `p${i}@perf.com`,
        role: roles[i % 5]!,
        name: `Name${i % 5}`,
        age: 20 + (i % 50),
      });
    }

    model.query().where("age", gt(0)).$count.getState();

    const startIndexed = performance.now();
    model.query().where("role", oneOf(["admin", "editor"])).$count.getState();
    const indexedTime = performance.now() - startIndexed;

    const startFull = performance.now();
    model.query().where("name", oneOf(["Name0", "Name1"])).$count.getState();
    const fullTime = performance.now() - startFull;

    console.log(
      `[perf oneOf] indexed: ${indexedTime.toFixed(2)}ms, non-indexed: ${fullTime.toFixed(2)}ms, ` +
      `speedup: ${(fullTime / indexedTime).toFixed(1)}x`,
    );

    expect(indexedTime).toBeLessThan(fullTime);

    model.clear();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("query index optimization: MEMORY", () => {
  it("indexed queries with many instances — bounded heap", () => {
    const model = createIndexedModel();

    // Warmup
    for (let i = 0; i < 50; i++) {
      model.create({ id: `w${i}`, email: `w${i}@m.com`, role: "admin", name: "W", age: 20 });
    }
    model.query().where("role", eq("admin")).$count.getState();
    model.clear();

    const heapBefore = measureHeap();
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < 100; i++) {
        model.create({
          id: `r${round}-${i}`,
          email: `r${round}-${i}@m.com`,
          role: i < 10 ? "admin" : "user",
          name: `N${i}`,
          age: 20,
        });
      }
      model.query().where("role", eq("admin")).$count.getState();
      model.query().where("email", eq(`r${round}-5@m.com`)).$count.getState();
      model.clear();
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[idx query mem] heap growth over 10 rounds: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(25);
  });
});
