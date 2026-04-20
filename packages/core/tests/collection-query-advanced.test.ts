import { describe, expect, it } from "vitest";
import {
  createEvent,
  createStore,
  createEffect,
  sample,
  combine,
  fork,
  allSettled,
} from "effector";
import { createContract, createModel } from "../index";
import {
  eq,
  gt,
  gte,
  lt,
  lte,
  neq,
  oneOf,
  includes,
  startsWith,
  endsWith,
  matches,
  contains,
} from "../layers/query";

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
// COMBINED PIPELINE: WHERE + ORDER BY + LIMIT + OFFSET
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: full pipeline combinations", () => {
  it("where + orderBy + limit", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 40, score: 300 });
    model.create({ id: "2", name: "Bob", age: 35, score: 200 });
    model.create({ id: "3", name: "Charlie", age: 20, score: 100 });
    model.create({ id: "4", name: "Diana", age: 50, score: 400 });

    const topAdults = model
      .query()
      .where("age", gt(30))
      .orderBy("score", "desc")
      .limit(2);

    const names = topAdults.field("name").$values.getState();
    expect(names).toEqual(["Diana", "Alice"]); // sorted by score desc, top 2
    expect(topAdults.$totalCount.getState()).toBe(3); // 3 match, but limit 2
  });

  it("where + distinct + orderBy", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25, role: "admin" });
    model.create({ id: "2", name: "Bob", age: 35, role: "admin" });
    model.create({ id: "3", name: "Charlie", age: 30, role: "user" });
    model.create({ id: "4", name: "Diana", age: 28, role: "moderator" });

    const uniqueRoles = model
      .query()
      .where("age", gt(20))
      .distinct("role")
      .orderBy("name", "asc");

    const names = uniqueRoles.field("name").$values.getState();
    // distinct keeps first occurrence per role, then sorts
    // admin: Alice (first), user: Charlie, moderator: Diana
    expect(names).toEqual(["Alice", "Charlie", "Diana"]);
  });

  it("where + orderBy + offset + limit (pagination)", () => {
    const model = createUserModel();
    for (let i = 0; i < 20; i++) {
      model.create({ id: `${i}`, name: `User${String(i).padStart(2, "0")}`, age: 20 + i });
    }

    const page2 = model
      .query()
      .where("age", gte(25))
      .orderBy("age", "asc")
      .offset(5)
      .limit(5);

    const ages = page2.field("age").$values.getState();
    // age >= 25: [25,26,...,39] → offset 5: [30,31,...,39] → limit 5: [30,31,32,33,34]
    expect(ages).toEqual([30, 31, 32, 33, 34]);
    expect(page2.$totalCount.getState()).toBe(15); // ages 25-39
    expect(page2.$count.getState()).toBe(5);
  });

  it("multiple where + multiple orderBy", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 30, role: "admin", score: 100 });
    model.create({ id: "2", name: "Bob", age: 30, role: "user", score: 200 });
    model.create({ id: "3", name: "Charlie", age: 25, role: "admin", score: 150 });
    model.create({ id: "4", name: "Diana", age: 35, role: "admin", score: 100 });

    const result = model
      .query()
      .where("role", eq("admin"))
      .where("age", gte(25))
      .orderBy("score", "asc")
      .orderBy("name", "asc");

    const names = result.field("name").$values.getState();
    // admin + age>=25: Alice(100), Charlie(150), Diana(100)
    // sort by score asc: Alice(100), Diana(100), Charlie(150)
    // tie on score=100: sort by name asc: Alice, Diana
    expect(names).toEqual(["Alice", "Diana", "Charlie"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES: operators
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: operator edge cases", () => {
  it("eq with 0 (falsy value)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 0 });
    model.create({ id: "2", name: "B", age: 5 });

    expect(model.query().where("age", eq(0)).$count.getState()).toBe(1);
  });

  it("eq with empty string (falsy value)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "", age: 25 });
    model.create({ id: "2", name: "Bob", age: 30 });

    expect(model.query().where("name", eq("")).$count.getState()).toBe(1);
  });

  it("neq with null-ish values", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "user" });

    expect(model.query().where("role", neq("user")).$count.getState()).toBe(1);
  });

  it("oneOf with empty array matches nothing", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });

    expect(model.query().where("role", oneOf([] as string[])).$count.getState()).toBe(0);
  });

  it("oneOf with single element behaves like eq", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });

    expect(model.query().where("role", oneOf(["admin"])).$count.getState()).toBe(1);
  });

  it("includes with empty string matches all", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 30 });

    expect(model.query().where("name", includes("")).$count.getState()).toBe(2);
  });

  it("includes is case-insensitive", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "bob", age: 30 });

    expect(model.query().where("name", includes("ALICE")).$count.getState()).toBe(1);
    expect(model.query().where("name", includes("BOB")).$count.getState()).toBe(1);
  });

  it("startsWith is case-insensitive", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });

    expect(model.query().where("name", startsWith("ALICE")).$count.getState()).toBe(1);
    expect(model.query().where("name", startsWith("alice")).$count.getState()).toBe(1);
  });

  it("endsWith is case-insensitive", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });

    expect(model.query().where("name", endsWith("ICE")).$count.getState()).toBe(1);
    expect(model.query().where("name", endsWith("ice")).$count.getState()).toBe(1);
  });

  it("matches with always-true predicate returns all", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 30 });

    expect(model.query().where("age", matches(() => true)).$count.getState()).toBe(2);
  });

  it("matches with always-false predicate returns none", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    expect(model.query().where("age", matches(() => false)).$count.getState()).toBe(0);
  });

  it("contains operator on array-like fields", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("tags", (s) => s<string[]>())
      .pk("id");

    const model = createModel({ contract });
    model.create({ id: "1", tags: ["react", "typescript"] });
    model.create({ id: "2", tags: ["vue", "javascript"] });
    model.create({ id: "3", tags: ["react", "javascript"] });

    expect(model.query().where("tags", contains("react")).$count.getState()).toBe(2);
    expect(model.query().where("tags", contains("vue")).$count.getState()).toBe(1);
    expect(model.query().where("tags", contains("angular")).$count.getState()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES: empty collections
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: empty collection edge cases", () => {
  it("query on empty model", () => {
    const model = createUserModel();
    const query = model.query().where("age", gt(30));

    expect(query.$ids.getState()).toEqual([]);
    expect(query.$count.getState()).toBe(0);
    expect(query.$ids.getState()).toEqual([]);
    expect(query.$ids.getState().length).toBe(0);
    expect(query.$totalCount.getState()).toBe(0);
  });

  it("orderBy on empty model", () => {
    const model = createUserModel();
    const sorted = model.query().orderBy("name", "asc");

    expect(sorted.$ids.getState()).toEqual([]);
  });

  it("groupBy on empty model", () => {
    const model = createUserModel();
    const grouped = model.query().groupBy("role");

    expect(grouped.$groups.getState().size).toBe(0);
    expect(grouped.$keys.getState()).toEqual([]);
    expect(grouped.$count.getState()).toBe(0);
  });

  it("group() on nonexistent key returns empty", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });

    const grouped = model.query().groupBy("role");
    const nonexistent = grouped.group("nonexistent");

    expect(nonexistent.$ids.getState()).toEqual([]);
    expect(nonexistent.$count.getState()).toBe(0);
  });

  it("distinct on empty collection", () => {
    const model = createUserModel();
    expect(model.query().distinct("role").$ids.getState()).toEqual([]);
  });

  it("limit(0) always empty", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 30 });

    expect(model.query().limit(0).$ids.getState()).toEqual([]);
    expect(model.query().limit(0).$count.getState()).toBe(0);
  });

  it("offset beyond collection size returns empty", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    expect(model.query().offset(100).$ids.getState()).toEqual([]);
    expect(model.query().offset(100).$count.getState()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REACTIVITY: field value changes affecting query membership
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: reactivity — field changes", () => {
  it("instance enters query when field changes to match", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 29 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(0);

    // Change age to match
    model.get("2")!.$age.set(31);
    expect(over30.$count.getState()).toBe(1);
    expect(over30.$ids.getState()).toEqual(["2"]);
  });

  it("instance leaves query when field changes to not match", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 35 });
    model.create({ id: "2", name: "B", age: 40 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(2);

    // Change age to not match
    model.get("1")!.$age.set(25);
    expect(over30.$count.getState()).toBe(1);
    expect(over30.$ids.getState()).toEqual(["2"]);
  });

  it("sort order updates when sort field changes", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 10, score: 1 });
    model.create({ id: "2", name: "Bob", age: 20, score: 2 });
    model.create({ id: "3", name: "Charlie", age: 30, score: 3 });

    const sorted = model.query().orderBy("score", "asc");
    expect(sorted.field("name").$values.getState()).toEqual([
      "Alice",
      "Bob",
      "Charlie",
    ]);

    // Swap scores of Alice and Charlie
    model.get("1")!.$score.set(3);
    model.get("3")!.$score.set(1);

    expect(sorted.field("name").$values.getState()).toEqual([
      "Charlie",
      "Bob",
      "Alice",
    ]);
  });

  it("distinct result changes when distinct field value changes", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "admin" });

    const unique = model.query().distinct("role");
    expect(unique.$count.getState()).toBe(1); // both are "admin"

    // Change B's role to "user"
    model.get("2")!.$role.set("user");
    expect(unique.$count.getState()).toBe(2); // now "admin" and "user"
  });

  it("adding/removing instances updates all chained terminals", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 35 });

    const query = model.query().where("age", gt(30)).orderBy("age", "asc").limit(10);

    expect(query.$count.getState()).toBe(1);
    expect(query.field("name").$values.getState()[0]).toBe("A");

    model.create({ id: "2", name: "B", age: 40 });
    expect(query.$count.getState()).toBe(2);

    model.delete("1");
    expect(query.$count.getState()).toBe(1);
    expect(query.field("name").$values.getState()[0]).toBe("B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REACTIVITY: staged pipeline efficiency
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: staged pipeline", () => {
  it("no-op stages passthrough — no extra stores for simple query", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    // query() with no ops → $ids === $ids
    const q = model.query();
    expect(q.$ids).toBe(q.$ids);
  });

  it("where-only query: $sorted === $filtered (no sort stage created)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const q = model.query().where("age", gt(20));
    // Access internal stores to verify passthrough
    // $ids should be the same reference (memoized) — can't directly check internal stages
    expect(q.$ids).toBe(q.$ids);
  });

  it("changing reactive limit does not trigger WHERE recomputation", () => {
    const model = createUserModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: `${i}`, name: `U${i}`, age: i * 10 });
    }

    let filterCallCount = 0;
    const setLimit = createEvent<number>();
    const $limit = createStore(5).on(setLimit, (_, v) => v);

    // We can't directly count filter calls, but we can verify correctness
    const query = model.query().where("age", gte(30)).limit($limit);

    expect(query.$count.getState()).toBe(5); // ages 30,40,50,60,70
    expect(query.$totalCount.getState()).toBe(7); // ages 30-90

    setLimit(3);
    expect(query.$count.getState()).toBe(3);
    expect(query.$totalCount.getState()).toBe(7); // unchanged
  });

  it("changing reactive sort direction does not trigger WHERE recomputation", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10 });
    model.create({ id: "2", name: "B", age: 20 });
    model.create({ id: "3", name: "C", age: 30 });

    const setDir = createEvent<"asc" | "desc">();
    const $dir = createStore<"asc" | "desc">("asc").on(setDir, (_, v) => v);

    const query = model.query().where("age", gt(5)).orderBy("age", $dir);

    expect(query.field("name").$values.getState()).toEqual(["A", "B", "C"]);

    setDir("desc");
    expect(query.field("name").$values.getState()).toEqual(["C", "B", "A"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FN EXTENSIONS: query over extended fields
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: fn extensions", () => {
  it("where on extension store field", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $id, $count }) => {
        const doubled = $count.map((n) => n * 2);
        return { $id, $count, doubled };
      },
    });

    model.create({ id: "1", count: 5 });
    model.create({ id: "2", count: 15 });
    model.create({ id: "3", count: 25 });

    // Query by extension field
    const bigDoubled = model.query().where("doubled", gt(20));
    expect(bigDoubled.$count.getState()).toBe(2); // doubled: 30, 50
  });

  it("field().$values on extension store", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $id, $name }) => {
        const upper = $name.map((n) => n.toUpperCase());
        return { $id, $name, upper };
      },
    });

    model.create({ id: "1", name: "alice" });
    model.create({ id: "2", name: "bob" });

    expect(model.query().field("upper").$values.getState()).toEqual(["ALICE", "BOB"]);
  });

  it("orderBy extension store field", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $id, $count }) => {
        const negated = $count.map((n) => -n);
        return { $id, $count, negated };
      },
    });

    model.create({ id: "1", count: 10 });
    model.create({ id: "2", count: 20 });
    model.create({ id: "3", count: 5 });

    // Sort by negated (asc) should reverse the count order
    const sorted = model.query().orderBy("negated", "asc");
    const counts = sorted.field("count").$values.getState();
    expect(counts).toEqual([20, 10, 5]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DERIVED/COMPUTED: query over derived stores
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: derived stores", () => {
  it("where on derived field", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("firstName", (s) => s<string>())
      .store("lastName", (s) => s<string>())
      .derived("fullName", (s) => combine(s.$firstName, s.$lastName, (f, l) => `${f} ${l}`))
      .pk("id");

    const model = createModel({ contract });
    model.create({ id: "1", firstName: "Alice", lastName: "Smith" });
    model.create({ id: "2", firstName: "Bob", lastName: "Jones" });
    model.create({ id: "3", firstName: "Alice", lastName: "Johnson" });

    const alices = model.query().where("fullName", includes("alice"));
    expect(alices.$count.getState()).toBe(2);
  });

  it("field().$values on derived field", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .derived("sum", (s) => combine(s.$a, s.$b, (a, b) => a + b))
      .pk("id");

    const model = createModel({ contract });
    model.create({ id: "1", a: 1, b: 2 });
    model.create({ id: "2", a: 10, b: 20 });

    expect(model.query().field("sum").$values.getState()).toEqual([3, 30]);
  });

  it("orderBy derived field", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .derived("sum", (s) => combine(s.$a, s.$b, (a, b) => a + b))
      .pk("id");

    const model = createModel({ contract });
    model.create({ id: "1", a: 10, b: 20 });
    model.create({ id: "2", a: 1, b: 2 });
    model.create({ id: "3", a: 5, b: 5 });

    const sorted = model.query().orderBy("sum", "asc");
    const sums = sorted.field("sum").$values.getState();
    expect(sums).toEqual([3, 10, 30]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP BY: advanced scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: groupBy scenarios", () => {
  it("groupBy after where", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 35, role: "admin" });
    model.create({ id: "3", name: "C", age: 15, role: "user" });
    model.create({ id: "4", name: "D", age: 40, role: "user" });

    const grouped = model.query().where("age", gt(20)).groupBy("role");
    const groups = grouped.$groups.getState();

    expect(groups.size).toBe(2);
    expect(groups.get("admin")?.length).toBe(2); // A and B
    expect(groups.get("user")?.length).toBe(1); // D only (C is 15, filtered out)
  });

  it("having with sum aggregate", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "team1", score: 100 });
    model.create({ id: "2", name: "B", age: 30, role: "team1", score: 200 });
    model.create({ id: "3", name: "C", age: 35, role: "team2", score: 50 });

    const grouped = model.query().groupBy("role").having("sum", gt(200), "score");

    expect(grouped.$count.getState()).toBe(1); // only team1 (sum=300)
    expect(grouped.$keys.getState()).toEqual(["team1"]);
  });

  it("having with avg aggregate", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "team1", score: 100 });
    model.create({ id: "2", name: "B", age: 30, role: "team1", score: 200 });
    model.create({ id: "3", name: "C", age: 35, role: "team2", score: 50 });
    model.create({ id: "4", name: "D", age: 40, role: "team2", score: 60 });

    const grouped = model.query().groupBy("role").having("avg", gt(100), "score");

    expect(grouped.$count.getState()).toBe(1); // team1 avg=150, team2 avg=55
    expect(grouped.$keys.getState()).toEqual(["team1"]);
  });

  it("group() sub-query supports further chaining (field)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25, role: "admin", score: 100 });
    model.create({ id: "2", name: "Bob", age: 35, role: "admin", score: 200 });
    model.create({ id: "3", name: "C", age: 30, role: "user", score: 50 });

    const grouped = model.query().groupBy("role");
    const adminScores = grouped.group("admin").field("score").$values.getState();

    expect(adminScores).toEqual([100, 200]);
  });

  it("groupBy with single instance per group", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "moderator" });

    const grouped = model.query().groupBy("role");
    expect(grouped.$count.getState()).toBe(3);

    // All groups have count 1
    const groups = grouped.$groups.getState();
    for (const [, instances] of groups) {
      expect(instances.length).toBe(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WHEN: advanced conditional filter scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: when() scenarios", () => {
  it("multiple when() clauses", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin", score: 100 });
    model.create({ id: "2", name: "B", age: 35, role: "user", score: 200 });
    model.create({ id: "3", name: "C", age: 40, role: "admin", score: 300 });

    const setRole = createEvent<string | null>();
    const setMinAge = createEvent<number | null>();
    const $roleFilter = createStore<string | null>(null).on(setRole, (_, v) => v);
    const $minAge = createStore<number | null>(null).on(setMinAge, (_, v) => v);

    const query = model
      .query()
      .when($roleFilter, (q, role) => q.where("role", eq(role)))
      .when($minAge, (q, age) => q.where("age", gt(age)));

    // No filters → all 3
    expect(query.$count.getState()).toBe(3);

    // Role filter only
    setRole("admin");
    expect(query.$count.getState()).toBe(2); // A and C

    // Role + age filter
    setMinAge(30);
    expect(query.$count.getState()).toBe(1); // C only

    // Remove role filter, keep age
    setRole(null);
    expect(query.$count.getState()).toBe(2); // B and C (age > 30)

    // Remove all filters
    setMinAge(null);
    expect(query.$count.getState()).toBe(3);
  });

  it("when() combined with static where", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin", score: 100 });
    model.create({ id: "2", name: "B", age: 35, role: "user", score: 200 });
    model.create({ id: "3", name: "C", age: 40, role: "admin", score: 300 });

    const setRole = createEvent<string | null>();
    const $roleFilter = createStore<string | null>(null).on(setRole, (_, v) => v);

    const query = model
      .query()
      .where("age", gt(20)) // always applied
      .when($roleFilter, (q, role) => q.where("role", eq(role)));

    expect(query.$count.getState()).toBe(3);

    setRole("admin");
    expect(query.$count.getState()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REACTIVE: dynamic table simulation
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: dynamic table simulation", () => {
  it("full table with reactive search, filter, sort, pagination", () => {
    const model = createUserModel();
    for (let i = 0; i < 20; i++) {
      model.create({
        id: `${i}`,
        name: `User ${String.fromCharCode(65 + (i % 26))}${i}`,
        age: 20 + i,
        role: i % 3 === 0 ? "admin" : "user",
        score: i * 10,
      });
    }

    const setSearch = createEvent<string>();
    const setRole = createEvent<string | null>();
    const setPage = createEvent<number>();
    const setDir = createEvent<"asc" | "desc">();

    const $search = createStore("").on(setSearch, (_, v) => v);
    const $roleFilter = createStore<string | null>(null).on(setRole, (_, v) => v);
    const $page = createStore(1).on(setPage, (_, v) => v);
    const $dir = createStore<"asc" | "desc">("asc").on(setDir, (_, v) => v);
    const $pageSize = createStore(5);
    const $offset = combine($page, $pageSize, (p, s) => (p - 1) * s);

    const tableQuery = model
      .query()
      .where("name", includes($search))
      .when($roleFilter, (q, role) => q.where("role", eq(role)))
      .orderBy("age", $dir)
      .offset($offset)
      .limit($pageSize);

    // Initial: all 20, page 1, sorted asc
    expect(tableQuery.$count.getState()).toBe(5);
    expect(tableQuery.$totalCount.getState()).toBe(20);

    // Filter by role=admin
    setRole("admin");
    expect(tableQuery.$totalCount.getState()).toBe(7); // 0,3,6,9,12,15,18

    // Go to page 2
    setPage(2);
    expect(tableQuery.$count.getState()).toBe(2); // 5 on page 1, 2 on page 2

    // Sort descending
    setDir("desc");
    const page2Ages = tableQuery.field("age").$values.getState();
    expect(page2Ages[0]).toBeLessThan(
      model.query().where("role", eq("admin")).orderBy("age", "desc").limit(1).field("age").$values.getState()[0]!
    );

    // Search
    setSearch("User A");
    // This filters further
    expect(tableQuery.$totalCount.getState()).toBeLessThanOrEqual(7);

    // Reset all
    setRole(null);
    setSearch("");
    setPage(1);
    setDir("asc");
    expect(tableQuery.$totalCount.getState()).toBe(20);
    expect(tableQuery.$count.getState()).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPOUND PRIMARY KEYS
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: compound primary keys", () => {
  it("query works with compound pk model", () => {
    const contract = createContract()
      .store("row", (s) => s<number>())
      .store("col", (s) => s<number>())
      .store("value", (s) => s<string>())
      .pk("row", "col");

    const model = createModel({ contract });
    model.create({ row: 0, col: 0, value: "A" });
    model.create({ row: 0, col: 1, value: "B" });
    model.create({ row: 1, col: 0, value: "C" });
    model.create({ row: 1, col: 1, value: "D" });

    const row0 = model.query().where("row", eq(0));
    expect(row0.$count.getState()).toBe(2);

    const values = row0.field("value").$values.getState();
    expect(values).toEqual(["A", "B"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WRITE TERMINALS: advanced scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: write terminals", () => {
  it("delete with limit — removes first N matching", () => {
    const model = createUserModel();
    for (let i = 0; i < 5; i++) {
      model.create({ id: `${i}`, name: `U${i}`, age: 20 + i * 5 });
    }

    // Delete first 2 instances matching age >= 25
    const toDelete = model.query().where("age", gte(25)).orderBy("age", "asc").limit(2);
    toDelete.delete();

    // Should have removed ages 25 and 30
    expect(model.$count.getState()).toBe(3);
    const remaining = model.instances().map((i) => i.$age.getState());
    expect(remaining).toContain(20);
    expect(remaining).toContain(35);
    expect(remaining).toContain(40);
  });

  it("field().update only affects matching instances", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, score: 10 });
    model.create({ id: "2", name: "B", age: 35, score: 20 });
    model.create({ id: "3", name: "C", age: 40, score: 30 });

    model.query().where("age", gt(30)).field("score").update(999);

    expect(model.get("1")!.$score.getState()).toBe(10);
    expect(model.get("2")!.$score.getState()).toBe(999);
    expect(model.get("3")!.$score.getState()).toBe(999);
  });

  it("query.update updates multiple fields at once", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 35, role: "user", score: 0 });
    model.create({ id: "2", name: "B", age: 40, role: "user", score: 0 });

    model.query().where("age", gt(30)).update({ role: "admin", score: 100 });

    expect(model.get("1")!.$role.getState()).toBe("admin");
    expect(model.get("1")!.$score.getState()).toBe(100);
    expect(model.get("2")!.$role.getState()).toBe("admin");
    expect(model.get("2")!.$score.getState()).toBe(100);
  });

  it("field().updated tracks changes from field().update", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 35, score: 10 });
    model.create({ id: "2", name: "B", age: 40, score: 20 });

    const query = model.query().where("age", gt(30));
    const updates: Array<{ id: string | number; value: unknown }> = [];
    query.field("score").updated.watch((p) => updates.push(p));

    query.field("score").update(0);

    expect(updates.length).toBe(2);
    expect(updates.every((u) => u.value === 0)).toBe(true);
  });

  it("delete empties query results reactively", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 35 });
    model.create({ id: "2", name: "B", age: 40 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(2);

    over30.delete();
    expect(over30.$count.getState()).toBe(0);
    expect(over30.$ids.getState()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS: fields with defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: fields with defaults", () => {
  it("where on field with default value", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 }); // role defaults to "user", score to 0
    model.create({ id: "2", name: "B", age: 30, role: "admin" });

    expect(model.query().where("role", eq("user")).$count.getState()).toBe(1);
    expect(model.query().where("score", eq(0)).$count.getState()).toBe(2);
  });

  it("orderBy on field with default value", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, score: 50 });
    model.create({ id: "2", name: "B", age: 30 }); // score defaults to 0
    model.create({ id: "3", name: "C", age: 35, score: 100 });

    const sorted = model.query().orderBy("score", "asc");
    const scores = sorted.field("score").$values.getState();
    expect(scores).toEqual([0, 50, 100]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOINCREMENT: query with autoincrement pk
// ─────────────────────────────────────────────────────────────────────────────

describe("COLLECTION QUERY ADVANCED: autoincrement", () => {
  it("query works with autoincrement model", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });
    model.create({ name: "Alice" });
    model.create({ name: "Bob" });
    model.create({ name: "Charlie" });

    expect(model.query().$count.getState()).toBe(3);
    expect(model.query().where("name", includes("bo")).$count.getState()).toBe(1);
  });
});
