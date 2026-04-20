import { describe, expect, it } from "vitest";
import { createEvent, createStore, fork } from "effector";
import { createContract, createModel } from "../index";
import { eq, gt, gte, lt, lte, neq, oneOf, includes, startsWith, endsWith, matches, contains } from "../layers/query";

// ─── Shared test contract ───

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

// ─── WHERE ───

describe("COLLECTION QUERY: where", () => {
  it("query().$ids returns all instance ids", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const query = model.query();
    expect(query.$count.getState()).toBe(2);
  });

  it("where filters by field", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 40 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(2);
    expect(over30.field("name").$values.getState()).toEqual(["Bob", "Charlie"]);
  });

  it("where().where() composes with AND", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25, role: "admin" });
    model.create({ id: "2", name: "Bob", age: 35, role: "admin" });
    model.create({ id: "3", name: "Charlie", age: 40, role: "user" });

    const adminOver30 = model.query().where("age", gt(30)).where("role", eq("admin"));
    expect(adminOver30.$count.getState()).toBe(1);
    expect(adminOver30.field("name").$values.getState()[0]).toBe("Bob");
  });

  it("$count, $ids, $first derive correctly", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(1);
    expect(over30.$ids.getState()).toEqual(["2"]);
    expect(over30.$first.getState()).toEqual({ id: "2", name: "Bob", age: 35, role: "user", score: 0 });
  });

  it("$first returns null when no matches", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });

    const over100 = model.query().where("age", gt(100));
    expect(over100.$first.getState()).toBeNull();
  });

  it("$first reacts to reactive where operand", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const $targetId = createStore("1");
    const query = model.query().where("id", eq($targetId));

    expect(query.$first.getState()).toEqual({ id: "1", name: "Alice", age: 25, role: "user", score: 0 });

    // Change target → $first reactively updates
    ($targetId as any).setState("2");
    expect(query.$first.getState()).toEqual({ id: "2", name: "Bob", age: 35, role: "user", score: 0 });

    // Non-existent ID → null
    ($targetId as any).setState("999");
    expect(query.$first.getState()).toBeNull();
  });

  it("$first reacts to field value changes", () => {
    const model = createUserModel();
    const alice = model.create({ id: "1", name: "Alice", age: 25 });

    const query = model.query().where("id", eq("1"));
    expect(query.$first.getState()).toEqual({ id: "1", name: "Alice", age: 25, role: "user", score: 0 });

    // Update a field → $first reflects updated data
    alice.$name.set("Alicia");
    expect(query.$first.getState()).toEqual({ id: "1", name: "Alicia", age: 25, role: "user", score: 0 });
  });

  it("empty result returns empty list", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });

    const over100 = model.query().where("age", gt(100));
    expect(over100.$ids.getState()).toEqual([]);
    expect(over100.$count.getState()).toBe(0);
    expect(over100.$ids.getState().length).toBe(0);
  });
});

// ─── OPERATORS ───

describe("COLLECTION QUERY: operators", () => {
  it("gt, gte, lt, lte", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10 });
    model.create({ id: "2", name: "B", age: 20 });
    model.create({ id: "3", name: "C", age: 30 });

    expect(model.query().where("age", gt(20)).$count.getState()).toBe(1);
    expect(model.query().where("age", gte(20)).$count.getState()).toBe(2);
    expect(model.query().where("age", lt(20)).$count.getState()).toBe(1);
    expect(model.query().where("age", lte(20)).$count.getState()).toBe(2);
  });

  it("eq, neq", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10, role: "admin" });
    model.create({ id: "2", name: "B", age: 20, role: "user" });

    expect(model.query().where("role", eq("admin")).$count.getState()).toBe(1);
    expect(model.query().where("role", neq("admin")).$count.getState()).toBe(1);
  });

  it("oneOf", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10, role: "admin" });
    model.create({ id: "2", name: "B", age: 20, role: "user" });
    model.create({ id: "3", name: "C", age: 30, role: "moderator" });

    expect(
      model.query().where("role", oneOf(["admin", "moderator"])).$count.getState(),
    ).toBe(2);
  });

  it("includes (string)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    expect(model.query().where("name", includes("ali")).$count.getState()).toBe(1);
  });

  it("startsWith, endsWith", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Alfred", age: 35 });
    model.create({ id: "3", name: "Bob", age: 30 });

    expect(model.query().where("name", startsWith("Al")).$count.getState()).toBe(2);
    expect(model.query().where("name", endsWith("ce")).$count.getState()).toBe(1);
  });

  it("matches (custom predicate)", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 15 });
    model.create({ id: "2", name: "B", age: 25 });
    model.create({ id: "3", name: "C", age: 35 });

    const teens = model.query().where("age", matches((v: number) => v >= 13 && v <= 19));
    expect(teens.$count.getState()).toBe(1);
  });
});

// ─── REACTIVE OPERATORS ───

describe("COLLECTION QUERY: reactive operators", () => {
  it("where with Store operand recomputes", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 20 });
    model.create({ id: "2", name: "B", age: 30 });
    model.create({ id: "3", name: "C", age: 40 });

    const $ageMin = createStore(25);
    const query = model.query().where("age", gt($ageMin));

    expect(query.$count.getState()).toBe(2); // 30, 40

    const setAgeMin = createEvent<number>();
    $ageMin.on(setAgeMin, (_, v) => v);
    setAgeMin(35);
    expect(query.$count.getState()).toBe(1); // 40
  });
});

// ─── ORDER BY ───

describe("COLLECTION QUERY: orderBy", () => {
  it("sorts ascending", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Charlie", age: 30 });
    model.create({ id: "2", name: "Alice", age: 25 });
    model.create({ id: "3", name: "Bob", age: 35 });

    const sorted = model.query().orderBy("name", "asc");
    const names = sorted.field("name").$values.getState();
    expect(names).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts descending", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10 });
    model.create({ id: "2", name: "B", age: 20 });
    model.create({ id: "3", name: "C", age: 30 });

    const sorted = model.query().orderBy("age", "desc");
    const ages = sorted.field("age").$values.getState();
    expect(ages).toEqual([30, 20, 10]);
  });

  it("multi-level sort", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 30, score: 100 });
    model.create({ id: "2", name: "Bob", age: 30, score: 200 });
    model.create({ id: "3", name: "Charlie", age: 25, score: 150 });

    const sorted = model.query().orderBy("age", "asc").orderBy("score", "desc");
    const names = sorted.field("name").$values.getState();
    expect(names).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("reactive direction", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10 });
    model.create({ id: "2", name: "B", age: 20 });

    const setDir = createEvent<"asc" | "desc">();
    const $dir = createStore<"asc" | "desc">("asc").on(setDir, (_, v) => v);
    const sorted = model.query().orderBy("age", $dir);

    expect(sorted.field("age").$values.getState()).toEqual([10, 20]);

    setDir("desc");
    expect(sorted.field("age").$values.getState()).toEqual([20, 10]);
  });
});

// ─── LIMIT / OFFSET ───

describe("COLLECTION QUERY: limit / offset", () => {
  it("limit returns first N", () => {
    const model = createUserModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: `${i}`, name: `User${i}`, age: i * 10 });
    }

    expect(model.query().limit(3).$count.getState()).toBe(3);
  });

  it("offset + limit for pagination", () => {
    const model = createUserModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: `${i}`, name: `User${i}`, age: i });
    }

    const page = model.query().orderBy("age", "asc").offset(3).limit(3);
    const ages = page.field("age").$values.getState();
    expect(ages).toEqual([3, 4, 5]);
  });

  it("$totalCount vs $count with pagination", () => {
    const model = createUserModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: `${i}`, name: `User${i}`, age: i });
    }

    const query = model.query().where("age", gte(3)).limit(2);
    expect(query.$count.getState()).toBe(2);
    expect(query.$totalCount.getState()).toBe(7); // ages 3-9
  });

  it("reactive limit", () => {
    const model = createUserModel();
    for (let i = 0; i < 5; i++) {
      model.create({ id: `${i}`, name: `User${i}`, age: i });
    }

    const setLimit = createEvent<number>();
    const $limit = createStore(2).on(setLimit, (_, v) => v);
    const query = model.query().limit($limit);

    expect(query.$count.getState()).toBe(2);

    setLimit(4);
    expect(query.$count.getState()).toBe(4);
  });

  it("reactive offset", () => {
    const model = createUserModel();
    for (let i = 0; i < 5; i++) {
      model.create({ id: `${i}`, name: `User${i}`, age: i });
    }

    const setOffset = createEvent<number>();
    const $offset = createStore(0).on(setOffset, (_, v) => v);
    const query = model.query().orderBy("age", "asc").offset($offset).limit(2);

    expect(query.field("age").$values.getState()).toEqual([0, 1]);

    setOffset(2);
    expect(query.field("age").$values.getState()).toEqual([2, 3]);
  });

  it("offset beyond length returns empty", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10 });

    expect(model.query().offset(100).$ids.getState()).toEqual([]);
  });

  it("limit(0) returns empty", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10 });

    expect(model.query().limit(0).$ids.getState()).toEqual([]);
  });
});

// ─── DISTINCT ───

describe("COLLECTION QUERY: distinct", () => {
  it("deduplicates by field value", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "admin" });

    const unique = model.query().distinct("role");
    expect(unique.$count.getState()).toBe(2);
  });
});

// ─── GROUP BY / HAVING ───

describe("COLLECTION QUERY: groupBy / having", () => {
  it("groups by field value", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "admin" });

    const grouped = model.query().groupBy("role");
    const groups = grouped.$groups.getState();

    expect(groups.size).toBe(2);
    expect(groups.get("admin")?.length).toBe(2);
    expect(groups.get("user")?.length).toBe(1);
    expect(grouped.$keys.getState()).toEqual(["admin", "user"]);
    expect(grouped.$count.getState()).toBe(2);
  });

  it("having filters groups by count", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "admin" });

    const bigGroups = model.query().groupBy("role").having("count", gt(1));
    expect(bigGroups.$count.getState()).toBe(1);
    expect(bigGroups.$keys.getState()).toEqual(["admin"]);
  });

  it("group() returns a sub-query", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });
    model.create({ id: "3", name: "C", age: 35, role: "admin" });

    const grouped = model.query().groupBy("role");
    const admins = grouped.group("admin");
    expect(admins.$count.getState()).toBe(2);
  });
});

// ─── FIELD ACCESSOR ───

describe("COLLECTION QUERY: field", () => {
  it("$values extracts field values", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });

    const values = model.query().field("name").$values.getState();
    expect(values).toEqual(["Alice", "Bob"]);
  });

  it("field().update sets value on all matching", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, score: 10 });
    model.create({ id: "2", name: "B", age: 35, score: 20 });
    model.create({ id: "3", name: "C", age: 40, score: 30 });

    const over30 = model.query().where("age", gt(30));
    over30.field("score").update(0);

    const inst1 = model.get("1");
    const inst2 = model.get("2");
    const inst3 = model.get("3");
    expect(inst1?.$score.getState()).toBe(10); // not matched
    expect(inst2?.$score.getState()).toBe(0);
    expect(inst3?.$score.getState()).toBe(0);
  });

  it("field().updated fires for matching instances", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, score: 10 });
    model.create({ id: "2", name: "B", age: 35, score: 20 });

    const over30 = model.query().where("age", gt(30));
    const updates: Array<{ id: string | number; value: unknown }> = [];
    over30.field("score").updated.watch((payload) => updates.push(payload));

    // Update matching instance
    const inst2 = model.get("2")!;
    inst2.$score.set(99);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.value).toBe(99);
  });
});

// ─── WRITE TERMINALS ───

describe("COLLECTION QUERY: update / delete", () => {
  it("query.update partially updates matching", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, score: 10 });
    model.create({ id: "2", name: "B", age: 35, score: 20 });

    const over30 = model.query().where("age", gt(30));
    over30.update({ score: 0 });

    expect(model.get("1")?.$score.getState()).toBe(10);
    expect(model.get("2")?.$score.getState()).toBe(0);
  });

  it("query.delete removes matching instances", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 35 });
    model.create({ id: "3", name: "C", age: 40 });

    const over30 = model.query().where("age", gt(30));
    over30.delete();

    expect(model.$count.getState()).toBe(1);
    expect(model.get("1")?.$name.getState()).toBe("A");
  });
});

// ─── REACTIVITY ───

describe("COLLECTION QUERY: reactivity", () => {
  it("adding instance updates query", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(0);

    model.create({ id: "2", name: "B", age: 35 });
    expect(over30.$count.getState()).toBe(1);
  });

  it("removing instance updates query", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 35 });

    const all = model.query();
    expect(all.$count.getState()).toBe(2);

    model.delete("2");
    expect(all.$count.getState()).toBe(1);
  });

  it("changing field value updates query results", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 29 });
    model.create({ id: "2", name: "B", age: 35 });

    const over30 = model.query().where("age", gt(30));
    expect(over30.$count.getState()).toBe(1);

    // Change age from 29 to 31 — should now match
    model.get("1")!.$age.set(31);
    expect(over30.$count.getState()).toBe(2);
  });

  it("changing sort field updates order", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 10, score: 2 });
    model.create({ id: "2", name: "B", age: 20, score: 1 });

    const sorted = model.query().orderBy("score", "asc");
    expect(sorted.field("name").$values.getState()).toEqual(["B", "A"]);

    model.get("2")!.$score.set(10);
    expect(sorted.field("name").$values.getState()).toEqual(["A", "B"]);
  });
});

// ─── MEMOIZATION ───

describe("COLLECTION QUERY: memoization", () => {
  it("same where returns same query", () => {
    const model = createUserModel();
    const q1 = model.query().where("age", gt(30));
    const q2 = model.query().where("age", gt(30));
    expect(q1).toBe(q2);
  });

  it("commutative where returns same query", () => {
    const model = createUserModel();
    const q1 = model.query().where("age", gt(30)).where("role", eq("admin"));
    const q2 = model.query().where("role", eq("admin")).where("age", gt(30));
    expect(q1).toBe(q2);
  });

  it("same terminals return same store", () => {
    const model = createUserModel();
    const q = model.query().where("age", gt(30));
    expect(q.$ids).toBe(q.$ids);
    expect(q.$count).toBe(q.$count);
  });
});

// ─── WHEN ───

describe("COLLECTION QUERY: when", () => {
  it("applies filter when non-null", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });

    const $roleFilter = createStore<string | null>("admin");
    const query = model.query().when($roleFilter, (q, role) => q.where("role", eq(role)));

    expect(query.$count.getState()).toBe(1);
  });

  it("skips filter when null", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });

    const $roleFilter = createStore<string | null>(null);
    const query = model.query().when($roleFilter, (q, role) => q.where("role", eq(role)));

    expect(query.$count.getState()).toBe(2);
  });

  it("reactive toggle", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25, role: "admin" });
    model.create({ id: "2", name: "B", age: 30, role: "user" });

    const setRoleFilter = createEvent<string | null>();
    const $roleFilter = createStore<string | null>(null).on(setRoleFilter, (_, v) => v);
    const query = model.query().when($roleFilter, (q, role) => q.where("role", eq(role)));

    expect(query.$count.getState()).toBe(2);

    setRoleFilter("admin");
    expect(query.$count.getState()).toBe(1);

    setRoleFilter(null);
    expect(query.$count.getState()).toBe(2);
  });
});

// ─── FN EXTENSIONS ───

describe("COLLECTION QUERY: fn extensions", () => {
  it("field() works for fn-added stores", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $id, $name }) => {
        const $upper = $name.map((n) => n.toUpperCase());
        return { $id, $name, upper: $upper };
      },
    });

    model.create({ id: "1", name: "Alice" });
    model.create({ id: "2", name: "Bob" });

    const values = model.query().field("upper").$values.getState();
    expect(values).toEqual(["ALICE", "BOB"]);
  });
});

// ─── SSR ───

describe("COLLECTION QUERY: SSR", () => {
  it("works with forked scopes", async () => {
    const model = createUserModel();
    model.create({ id: "1", name: "A", age: 25 });
    model.create({ id: "2", name: "B", age: 35 });

    const query = model.query().where("age", gt(30));
    const scope = fork();

    // Create instances within scope (fork starts with empty stores)
    await model.create({ id: "1", name: "A", age: 25 }, { scope });
    await model.create({ id: "2", name: "B", age: 35 }, { scope });

    expect(scope.getState(query.$count)).toBe(1);
  });
});
