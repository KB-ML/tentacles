import { bench, describe } from "vitest";
import { createContract, createModel, eq, gt } from "../index";

// Reusable contract factory — keeps each suite independent
function makeUserContract() {
  return createContract()
    .store("id", (s) => s<number>().autoincrement())
    .store("name", (s) => s<string>())
    .store("age", (s) => s<number>())
    .store("role", (s) => s<string>().default("user"))
    .store("score", (s) => s<number>().default(0))
    .store("active", (s) => s<boolean>().default(true))
    .pk("id");
}

function makeUserModel(name: string) {
  return createModel({ name, contract: makeUserContract() });
}

// ─────────────────────────────────────────────────────────────────────
// Hot paths — must show 0% regression after refactor
// ─────────────────────────────────────────────────────────────────────

describe("HOT: field mutation", () => {
  // 1k instances pre-created, then measure rapid .set() calls
  const model = makeUserModel("hot-field-set");
  const insts = Array.from({ length: 1_000 }, (_, i) =>
    model.create({ name: `U${i}`, age: 20 + (i % 60) }),
  );
  let counter = 0;

  bench("score.set() across 1k instances", () => {
    insts[counter % 1_000]!.$score.set(counter);
    counter++;
  });
});

describe("HOT: field read", () => {
  const model = makeUserModel("hot-field-get");
  const insts = Array.from({ length: 1_000 }, (_, i) =>
    model.create({ name: `U${i}`, age: 20 + (i % 60) }),
  );
  let counter = 0;

  bench("name.getState() across 1k instances", () => {
    insts[counter % 1_000]!.$name.getState();
    counter++;
  });
});

describe("HOT: query recompute on field change", () => {
  const model = makeUserModel("hot-query-recompute");
  const insts = Array.from({ length: 1_000 }, (_, i) =>
    model.create({ name: `U${i}`, age: 20 + (i % 60), score: i }),
  );
  const query = model.query().where("age", gt(40));
  // touch the store so it's materialized
  query.$count.getState();
  let counter = 0;

  bench("score.set() with active query", () => {
    insts[counter % 1_000]!.$score.set(counter);
    counter++;
  });
});

describe("HOT: query recompute on structural change", () => {
  const model = makeUserModel("hot-query-structural");
  for (let i = 0; i < 500; i++) {
    model.create({ name: `U${i}`, age: 20 + (i % 60) });
  }
  const query = model.query().where("age", gt(30)).orderBy("age", "desc").limit(10);
  query.$list.getState();

  let counter = 0;
  bench("create then delete (query attached)", () => {
    const i = model.create({ name: `temp${counter}`, age: 50 });
    model.delete(i.__id);
    counter++;
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cold paths — budget allows ≤2% regression (refactor target)
// ─────────────────────────────────────────────────────────────────────

describe("COLD: create one", () => {
  const model = makeUserModel("cold-create-one");
  let counter = 0;

  bench("model.create()", () => {
    model.create({ name: `U${counter}`, age: 25 });
    counter++;
  });
});

describe("COLD: create then delete", () => {
  const model = makeUserModel("cold-create-delete");
  let counter = 0;

  bench("create + delete", () => {
    const inst = model.create({ name: `U${counter}`, age: 25 });
    model.delete(inst.__id);
    counter++;
  });
});

describe("COLD: createMany 100", () => {
  const items = Array.from({ length: 100 }, (_, i) => ({
    name: `U${i}`,
    age: 20 + (i % 60),
  }));

  bench("createMany(100)", () => {
    const model = makeUserModel(`cold-many-${Math.random()}`);
    model.createMany(items);
  });
});

describe("COLD: createMany 10k", () => {
  const items = Array.from({ length: 10_000 }, (_, i) => ({
    name: `U${i}`,
    age: 20 + (i % 60),
  }));

  bench("createMany(10000)", () => {
    const model = makeUserModel(`cold-many-10k-${Math.random()}`);
    model.createMany(items);
  });
});

describe("COLD: cache lookup", () => {
  const model = makeUserModel("cold-cache-get");
  const ids: (string | number)[] = [];
  for (let i = 0; i < 1_000; i++) {
    const inst = model.create({ name: `U${i}`, age: 25 });
    ids.push(inst.__id);
  }
  let counter = 0;

  bench("getSync(id) on 1k pool", () => {
    model.getSync(ids[counter % 1_000]!);
    counter++;
  });
});

describe("COLD: instance(id) reactive", () => {
  const model = makeUserModel("cold-instance-store");
  const ids: (string | number)[] = [];
  for (let i = 0; i < 1_000; i++) {
    const inst = model.create({ name: `U${i}`, age: 25 });
    ids.push(inst.__id);
  }
  let counter = 0;

  bench("instance(id).getState() on 1k pool", () => {
    model.get(ids[counter % 1_000]!);
    counter++;
  });
});

// ─────────────────────────────────────────────────────────────────────
// Query layer — broad sanity check
// ─────────────────────────────────────────────────────────────────────

describe("QUERY: filter", () => {
  const model = makeUserModel("query-filter");
  for (let i = 0; i < 1_000; i++) {
    model.create({ name: `U${i}`, age: 20 + (i % 60), score: i });
  }

  bench("eq filter ($count)", () => {
    model.query().where("role", eq("user")).$count.getState();
  });

  bench("gt filter + orderBy + limit ($list)", () => {
    model.query().where("age", gt(40)).orderBy("score", "desc").limit(20).$list.getState();
  });
});
