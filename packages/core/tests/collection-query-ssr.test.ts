import { describe, expect, it } from "vitest";
import { allSettled, createEvent, createStore, fork, serialize } from "effector";
import { createContract, createModel } from "../index";
import { eq, gt, gte } from "../layers/query";

// ─── Helpers ───

let modelCounter = 0;
function uniqueName(prefix: string) {
  return `${prefix}-${++modelCounter}`;
}

function createUserModel(name?: string) {
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
// SSR: BASIC — instances created in scope
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: basic scope reads", () => {
  it("query.$ids reads from scope after scoped creation", async () => {
    const model = createUserModel();
    // Create globally so graph nodes exist
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const query = model.query().where("age", gt(30));
    const scope = fork();

    // Populate scope
    await model.create({ id: "1", name: "Alice", age: 25 }, { scope });
    await model.create({ id: "2", name: "Bob", age: 35 }, { scope });

    expect(scope.getState(query.$count)).toBe(1);
    expect(scope.getState(query.$ids)).toEqual(["2"]);
  });

  it("query.$ids reads non-empty from scope", async () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const query = model.query().where("age", gt(30));
    const scope = fork();
    await model.create({ id: "1", name: "Alice", age: 25 }, { scope });
    await model.create({ id: "2", name: "Bob", age: 35 }, { scope });

    const ids = scope.getState(query.$ids);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("$totalCount works in scope with pagination", async () => {
    const model = createUserModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: `${i}`, name: `User${i}`, age: 20 + i });
    }

    const query = model.query().where("age", gte(25)).limit(3);
    const scope = fork();
    for (let i = 0; i < 10; i++) {
      await model.create({ id: `${i}`, name: `User${i}`, age: 20 + i }, { scope });
    }

    expect(scope.getState(query.$count)).toBe(3);
    expect(scope.getState(query.$totalCount)).toBe(5); // ages 25-29
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: SCOPED MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: scoped mutations", () => {
  it("query.delete removes matching global instances", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 40 });

    const over30 = model.query().where("age", gt(30));
    over30.delete();

    expect(model.$count.getState()).toBe(1);
  });

  it("query.update updates matching global instances", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25, score: 100 });
    model.create({ id: "2", name: "Bob", age: 35, score: 200 });

    const over30 = model.query().where("age", gt(30));
    over30.update({ score: 0 });

    expect(model.instance("2").getState()?.$score.getState()).toBe(0);
    expect(model.instance("1").getState()?.$score.getState()).toBe(100);
  });

  it("field.update updates matching global field", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, score: 10 });
    model.create({ id: "2", name: "B", age: 35, score: 20 });

    const over30 = model.query().where("age", gt(30));
    over30.field("score").update(0);

    expect(model.instance("2").getState()?.$score.getState()).toBe(0);
    expect(model.instance("1").getState()?.$score.getState()).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: SCOPE ISOLATION — different scopes see different data
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: scope isolation", () => {
  it("two scopes can have different instance data", async () => {
    const model = createUserModel();
    // Create globally to establish graph
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 35 });

    const query = model.query().where("age", gt(30));

    const scope1 = fork();
    await model.create({ id: "1", name: "A", age: 25 }, { scope: scope1 });
    await model.create({ id: "2", name: "B", age: 35 }, { scope: scope1 });

    const scope2 = fork();
    await model.create({ id: "1", name: "A", age: 45 }, { scope: scope2 }); // different age!
    await model.create({ id: "2", name: "B", age: 50 }, { scope: scope2 }); // different age!

    expect(scope1.getState(query.$count)).toBe(1); // only B > 30
    expect(scope2.getState(query.$count)).toBe(2); // both > 30
  });

  it("scoped instance creation visible in query", async () => {
    const model = createUserModel();
    // Create globally to have graph nodes
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 35 });

    const query = model.query();
    const scope = fork();
    // Scope starts empty — create within scope
    await model.create({ id: "1", name: "A", age: 25 }, { scope });
    await model.create({ id: "2", name: "B", age: 35 }, { scope });

    expect(scope.getState(query.$count)).toBe(2);
    expect(query.$count.getState()).toBe(2); // global also has 2 (graph is shared)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: SERIALIZATION + HYDRATION
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: serialization", () => {
  it("serialize includes $dataMap for SSR hydration (no per-instance SIDs)", async () => {
    const model = createUserModel();

    const query = model.query().where("age", gt(20));
    query.$ids; // materialize

    const scope = fork();
    await model.create({ id: "1", name: "Alice", age: 25 }, { scope });

    const values = serialize(scope);
    const keys = Object.keys(values);
    // $dataMap is the serialized source of truth — no per-instance store duplication
    expect(keys.some((key) => key.includes("__dataMap__"))).toBe(true);
  });

  it("hydration round-trip preserves individual store values", async () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25, score: 10 });

    const inst = model.instance("1").getState()!;
    const query = model.query();

    const scope1 = fork();
    await model.create({ id: "1", name: "Alice", age: 25, score: 10 }, { scope: scope1 });
    await allSettled(inst.$score.set, { scope: scope1, params: 99 });

    const values = serialize(scope1);

    // Hydrate
    const scope2 = fork({ values });
    expect(scope2.getState(inst.$score)).toBe(99);
  });

  it("hydration round-trip preserves query results", async () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 15 });

    const query = model.query().where("age", gt(20));
    query.$ids; // materialize

    const scope1 = fork();
    await model.create({ id: "1", name: "Alice", age: 25 }, { scope: scope1 });
    await model.create({ id: "2", name: "Bob", age: 35 }, { scope: scope1 });
    await model.create({ id: "3", name: "Charlie", age: 15 }, { scope: scope1 });

    const values = serialize(scope1);

    // Hydrate into a new scope — queries should work without re-creating instances
    const scope2 = fork({ values });
    expect(scope2.getState(query.$count)).toBe(2);
    expect(scope2.getState(query.$ids)).toEqual(["1", "2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: GROUPED QUERIES
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: grouped queries", () => {
  it("groupBy works in scope", async () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "admin" });

    const grouped = model.query().groupBy("role");
    const scope = fork();
    await model.create({ id: "1", name: "A", age: 25, role: "admin" }, { scope });
    await model.create({ id: "2", name: "B", age: 30, role: "user" }, { scope });
    await model.create({ id: "3", name: "C", age: 35, role: "admin" }, { scope });

    expect(scope.getState(grouped.$count)).toBe(2);
    expect(scope.getState(grouped.$keys)).toEqual(["admin", "user"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: FIELD ACCESSOR
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: field accessor in scope", () => {
  it("field().$values reads from scope", async () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const query = model.query();
    const scope = fork();
    await model.create({ id: "1", name: "Alice", age: 25 }, { scope });
    await model.create({ id: "2", name: "Bob", age: 35 }, { scope });

    const names = scope.getState(query.field("name").$values);
    expect(names).toEqual(["Alice", "Bob"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: derived fields in $dataMap
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY SSR: derived field sorting", () => {
  it("scoped $dataMap includes computed fields for sorting", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("priority", (s) => s<"low" | "medium" | "high">())
      .store("createdAt", (s) => s<string>())
      .derived("priorityNumber", (s) =>
        s.$priority.map((p) => (p === "low" ? 1 : p === "medium" ? 2 : 3)),
      )
      .pk("id");

    const model = createModel({ contract });

    const $sortField = createStore<"createdAt" | "priorityNumber">("createdAt");
    const $sortDir = createStore<"asc" | "desc">("desc");
    const query = model.query().orderBy($sortField, $sortDir);

    // Server-side: create in scope
    const scope = fork();
    await model.create({ id: "1", priority: "high", createdAt: "2026-03-25" }, { scope });
    await model.create({ id: "2", priority: "low", createdAt: "2026-03-27" }, { scope });
    await model.create({ id: "3", priority: "medium", createdAt: "2026-03-26" }, { scope });

    // Verify scoped $dataMap has priorityNumber
    const dm = scope.getState((model as any)._$dataMap) as Record<string, Record<string, unknown>>;
    expect(dm["1"]?.priorityNumber).toBe(3);
    expect(dm["2"]?.priorityNumber).toBe(1);
    expect(dm["3"]?.priorityNumber).toBe(2);

    // Default: sorted by createdAt desc
    expect(scope.getState(query.$ids)).toEqual(["2", "3", "1"]);

    // Switch sort field in scope
    const setSortField = createEvent<"createdAt" | "priorityNumber">();
    $sortField.on(setSortField, (_, v) => v);
    await allSettled(setSortField, { scope, params: "priorityNumber" });

    // Should be sorted by priorityNumber desc
    expect(scope.getState(query.$ids)).toEqual(["1", "3", "2"]);
  });
});
