import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { type Store, allSettled, combine, fork, serialize } from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: Basic stores + events
// ─────────────────────────────────────────────────────────────────────────────

describe("Chain: basic creation", () => {
  it("creates model with stores and events", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({ id: "c1", count: 0 });
    expect(instance.$count.getState()).toBe(0);
    instance.increment();
    expect(instance.$count.getState()).toBe(1);
  });

  it("creates model without fn", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "n1", value: 42 });
    expect(instance.$value.getState()).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: Static defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("Chain: static defaults", () => {
  it("applies static default when field omitted", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .store("count", (s) => s<number>().default(0))
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "s1" });
    expect(instance.$status.getState()).toBe("draft");
    expect(instance.$count.getState()).toBe(0);
  });

  it("allows overriding static defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "s2", status: "published" });
    expect(instance.$status.getState()).toBe("published");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: Factory defaults — strictly typed data
// ─────────────────────────────────────────────────────────────────────────────

describe("Chain: factory defaults", () => {
  it("factory default receives previous stores typed", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .store("slug", (s) =>
        s<string>().default((data) => data.title.toLowerCase().replace(/ /g, "-")),
      )
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "f1", title: "Hello World" });
    expect(instance.$slug.getState()).toBe("hello-world");
  });

  it("factory default sees resolved static defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("prefix", (s) => s<string>().default("post"))
      .store("label", (s) => s<string>().default((data) => `${data.prefix}-${data.id}`))
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "123" });
    expect(instance.$prefix.getState()).toBe("post");
    expect(instance.$label.getState()).toBe("post-123");
  });

  it("factory default can be overridden", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .store("slug", (s) =>
        s<string>().default((data) => data.title.toLowerCase()),
      )
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "f2", title: "Hello", slug: "custom" });
    expect(instance.$slug.getState()).toBe("custom");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: Derived (computed) stores
// ─────────────────────────────────────────────────────────────────────────────

describe("Chain: derived stores", () => {
  it("derives value from other stores", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("firstName", (s) => s<string>())
      .store("lastName", (s) => s<string>())
      .derived("fullName", (s) =>
        combine(s.$firstName, s.$lastName, (f, l) => `${f} ${l}`),
      )
      .pk("id");

    const model = createModel({ contract });
    const user = model.create({ id: "u1", firstName: "Alice", lastName: "Smith" });
    expect(user.$fullName.getState()).toBe("Alice Smith");
  });

  it("derived updates reactively", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .derived("doubled", (s) => s.$count.map((n) => n * 2))
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "r1", count: 5 });
    expect(instance.$doubled.getState()).toBe(10);

    instance.$count.set(7);
    expect(instance.$doubled.getState()).toBe(14);
  });

  it("derived is read-only (no set)", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("n", (s) => s<number>())
      .derived("doubled", (s) => s.$n.map((x) => x * 2))
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "ro1", n: 3 });
    expect((instance.$doubled as any).set).toBeUndefined();
  });

  it("derived excluded from create data", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .derived("sum", (s) => combine(s.$a, s.$b, (a, b) => a + b))
      .pk("id");

    const model = createModel({ contract });
    const instance = model.create({ id: "e1", a: 3, b: 7 });
    expect(instance.$sum.getState()).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: Refs
// ─────────────────────────────────────────────────────────────────────────────

describe("Chain: refs", () => {
  it("ref many works", () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .store("text", (s) => s<string>())
      .pk("id");

    const itemModel = createModel({ contract: itemContract });

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("items", "many")
      .pk("id");

    const todoModel = createModel({ contract: todoContract });
    todoModel.bind({ items: () => itemModel });

    const todo = todoModel.create({ id: "t1", title: "List" });
    expect(todo.items.$ids.getState()).toEqual([]);

    todo.items.add("i1");
    expect(todo.items.$ids.getState()).toEqual(["i1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("Chain: SSR", () => {
  it("fork + serialize + hydrate", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc };
      },
    });

    const instance = model.create({ id: "ssr1", count: 0 });
    const scope = fork();
    await allSettled(instance.inc, { scope });
    await allSettled(instance.inc, { scope });

    expect(scope.getState(instance.$count)).toBe(2);
    expect(instance.$count.getState()).toBe(0);

    const values = serialize(scope);
    const clientScope = fork({ values });
    expect(clientScope.getState(instance.$count)).toBe(2);
  });

  it("defaults work with scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .pk("id");

    const model = createModel({ contract });
    const scope = fork();
    const instance = await model.create({ id: "sd1" }, { scope });
    expect(scope.getState(instance.$status)).toBe("draft");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN API: Memory leak
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("Chain: memory", () => {
  it("bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup", count: i });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "leak", count: i });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});
