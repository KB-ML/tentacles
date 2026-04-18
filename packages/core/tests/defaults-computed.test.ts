import { describe, expect, it } from "vitest";
import { createContract, createModel, eq } from "../index";
import { type Store, allSettled, combine, fork, serialize } from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS AND COMPUTED FIELDS
// ─────────────────────────────────────────────────────────────────────────────

describe("Defaults: static defaults", () => {
  it("applies static default when field is omitted", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<"draft" | "published">().default("draft"))
      .store("viewCount", (s) => s<number>().default(0))
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "p1" });
    expect(instance.$status.getState()).toBe("draft");
    expect(instance.$viewCount.getState()).toBe(0);
  });

  it("allows overriding static defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<"draft" | "published">().default("draft"))
      .store("viewCount", (s) => s<number>().default(0))
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "p2", status: "published", viewCount: 42 });
    expect(instance.$status.getState()).toBe("published");
    expect(instance.$viewCount.getState()).toBe(42);
  });
});

describe("Defaults: factory defaults", () => {
  it("applies factory default from other fields", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .store("slug", (s) => s<string>().default((data) => data.title.toLowerCase().replace(/ /g, "-")))
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "p1", title: "Hello World" });
    expect(instance.$slug.getState()).toBe("hello-world");
  });

  it("allows overriding factory defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .store("slug", (s) => s<string>().default((data) => data.title.toLowerCase().replace(/ /g, "-")))
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "p1", title: "Hello", slug: "custom-slug" });
    expect(instance.$slug.getState()).toBe("custom-slug");
  });

  it("factory default receives resolved static defaults", () => {
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

  it("factory default with dynamic value (Date.now)", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("createdAt", (s) => s<number>().default(() => Date.now()))
      .pk("id");

    const model = createModel({ contract });

    const before = Date.now();
    const instance = model.create({ id: "p1" });
    const after = Date.now();
    const value = instance.$createdAt.getState();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});

describe("Defaults: createMany", () => {
  it("resolves defaults independently for each item", () => {
    let callCount = 0;
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("seq", (s) => s<number>().default(() => ++callCount))
      .pk("id");

    const model = createModel({ contract });

    const items = model.createMany([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(items[0]!.$seq.getState()).toBe(1);
    expect(items[1]!.$seq.getState()).toBe(2);
    expect(items[2]!.$seq.getState()).toBe(3);
  });
});

describe("Defaults: pk with defaulted fields", () => {
  it("pk function sees resolved defaults", () => {
    const contract = createContract()
      .store("name", (s) => s<string>())
      .store("version", (s) => s<number>().default(1))
      .pk("name", "version");

    const model = createModel({ contract });

    const instance = model.create({ name: "app" });
    expect(instance.__id).toBe("app\x001");
    expect(instance.$version.getState()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAINED MODIFIERS WITH DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Defaults: unique().default() chain", () => {
  it("unique field with static default", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("slug", (s) => s<string>().unique().default("untitled"))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "a" });
    expect(a.$slug.getState()).toBe("untitled");
  });

  it("unique field with factory default", () => {
    let counter = 0;
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("email", (s) => s<string>().unique().default((data) => `${data.id}@auto.gen`))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "alice" });
    const b = model.create({ id: "bob" });
    expect(a.$email.getState()).toBe("alice@auto.gen");
    expect(b.$email.getState()).toBe("bob@auto.gen");
  });

  it("unique field with default can be overridden", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("code", (s) => s<string>().unique().default("DEFAULT"))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "a", code: "CUSTOM" });
    expect(a.$code.getState()).toBe("CUSTOM");
  });

  it("unique constraint still enforced with defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("token", (s) => s<string>().unique().default("same-token"))
      .pk("id");

    const model = createModel({ contract });

    model.create({ id: "a" });
    expect(() => model.create({ id: "b" })).toThrow(/[Uu]nique/);
  });

  it("$unique lookup works with defaulted value", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("slug", (s) => s<string>().unique().default((data) => `slug-${data.id}`))
      .pk("id");

    const model = createModel({ contract });

    model.create({ id: "x" });
    const found = model.query().where("slug", eq("slug-x")).$first.getState();
    expect(found).not.toBeNull();
    expect(found!.id).toBe("x");
  });
});

describe("Defaults: index().default() chain", () => {
  it("indexed field with static default", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().index().default("pending"))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "a" });
    expect(a.$status.getState()).toBe("pending");
  });

  it("indexed field with factory default", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("category", (s) => s<string>().index().default((data) => `cat-${data.id}`))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "x" });
    expect(a.$category.getState()).toBe("cat-x");
  });

  it("indexed field with default can be overridden", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().index().default("pending"))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "a", status: "active" });
    expect(a.$status.getState()).toBe("active");
  });

  it("$indexed lookup works with defaulted value", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("role", (s) => s<string>().index().default("viewer"))
      .pk("id");

    const model = createModel({ contract });

    model.create({ id: "a" });
    model.create({ id: "b" });
    model.create({ id: "c", role: "admin" });

    const viewers = model.query().where("role", eq("viewer")).$ids.getState();
    expect(viewers.length).toBe(2);

    const admins = model.query().where("role", eq("admin")).$ids.getState();
    expect(admins.length).toBe(1);
    expect(admins[0]).toBe("c");
  });
});

describe("Defaults: reverse chain order (default().unique(), default().index())", () => {
  it("default().unique() works", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("code", (s) => s<string>().default("CODE").unique())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "a" });
    expect(a.$code.getState()).toBe("CODE");

    const found = model.query().where("code", eq("CODE")).$first.getState();
    expect(found).not.toBeNull();
    expect(found!.id).toBe("a");
  });

  it("default().index() works", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("tier", (s) => s<string>().default("free").index())
      .pk("id");

    const model = createModel({ contract });

    model.create({ id: "a" });
    model.create({ id: "b", tier: "pro" });

    const freeUsers = model.query().where("tier", eq("free")).$ids.getState();
    expect(freeUsers.length).toBe(1);
    expect(freeUsers[0]).toBe("a");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: CHAINED MODIFIERS WITH DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

describe("SSR: unique().default()", () => {
  it("unique field with default works in scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("slug", (s) => s<string>().unique().default((data) => `slug-${data.id}`))
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const inst = await model.create({ id: "s1" }, { scope });
    expect(scope.getState(inst.$slug)).toBe("slug-s1");
  });
});

describe("SSR: index().default()", () => {
  it("indexed field with default works in scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().index().default("pending"))
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const inst = await model.create({ id: "s1" }, { scope });
    expect(scope.getState(inst.$status)).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY: CHAINED MODIFIERS WITH DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: chained modifiers with defaults", () => {
  it("bounded heap with unique().default()", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("token", (s) => s<string>().unique().default((data) => `tok-${data.id}`))
      .pk("id");

    const model = createModel({ contract });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "leak-unique" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });

  it("bounded heap with index().default()", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().index().default("pending"))
      .pk("id");

    const model = createModel({ contract });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "leak-index" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTED STORES
// ─────────────────────────────────────────────────────────────────────────────

describe("Computed: basic", () => {
  it("derives value from other stores", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("firstName", (s) => s<string>())
      .store("lastName", (s) => s<string>())
      .derived("fullName", (stores) =>
        combine(
          stores.$firstName as Store<string>,
          stores.$lastName as Store<string>,
          (f, l) => `${f} ${l}`,
        ),
      )
      .pk("id");

    const model = createModel({ contract });

    const user = model.create({ id: "u1", firstName: "Alice", lastName: "Smith" });
    expect(user.$fullName.getState()).toBe("Alice Smith");
  });

  it("updates reactively when source stores change", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("firstName", (s) => s<string>())
      .store("lastName", (s) => s<string>())
      .derived("fullName", (stores) =>
        combine(
          stores.$firstName as Store<string>,
          stores.$lastName as Store<string>,
          (f, l) => `${f} ${l}`,
        ),
      )
      .pk("id");

    const model = createModel({ contract });

    const user = model.create({ id: "u1", firstName: "Alice", lastName: "Smith" });
    expect(user.$fullName.getState()).toBe("Alice Smith");

    user.$firstName.set("Bob");
    expect(user.$fullName.getState()).toBe("Bob Smith");

    user.$lastName.set("Jones");
    expect(user.$fullName.getState()).toBe("Bob Jones");
  });

  it("computed store is read-only (no set method)", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .derived("doubled", (stores) =>
        (stores.$count as Store<number>).map((n) => n * 2),
      )
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "r1", count: 5 });
    expect(instance.$doubled.getState()).toBe(10);
    expect((instance.$doubled as any).set).toBeUndefined();
  });

  it("computed store excluded from create data", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .derived("sum", (stores) =>
        combine(
          stores.$a as Store<number>,
          stores.$b as Store<number>,
          (a, b) => a + b,
        ),
      )
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "e1", a: 3, b: 7 });
    expect(instance.$sum.getState()).toBe(10);
  });
});

describe("Computed: with refs", () => {
  it("derives from ref $ids", () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .store("text", (s) => s<string>())
      .pk("id");

    const itemModel = createModel({ contract: itemContract });

    const todoContract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("items", "many")
      .derived("itemCount", (stores) =>
        (stores.items as any).$ids.map((ids: string[]) => ids.length),
      )
      .pk("id");

    const todoModel = createModel({ contract: todoContract });
    todoModel.bind({ items: () => itemModel });

    const todo = todoModel.create({ id: "t1", title: "My List" });
    expect(todo.$itemCount.getState()).toBe(0);

    todo.items.add("i1");
    expect(todo.$itemCount.getState()).toBe(1);

    todo.items.add("i2");
    expect(todo.$itemCount.getState()).toBe(2);

    todo.items.remove("i1");
    expect(todo.$itemCount.getState()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("SSR: defaults", () => {
  it("defaults work with scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .store("count", (s) => s<number>().default(0))
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const instance = await model.create({ id: "s1" }, { scope });
    expect(scope.getState(instance.$status)).toBe("draft");
    expect(scope.getState(instance.$count)).toBe(0);
  });

  it("serializes defaulted values normally", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .pk("id");

    const model = createModel({ contract, name: "ssr-serialize-defaults" });

    const serverScope = fork();
    await model.create({ id: "s1" }, { scope: serverScope });
    const values = serialize(serverScope);

    const dataMap = values["tentacles:ssr-serialize-defaults:__dataMap__"] as Record<string, Record<string, unknown>>;
    expect(dataMap["s1"]?.status).toBe("draft");
  });

  it("factory defaults work with scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .store("slug", (s) => s<string>().default((data) => data.title.toLowerCase().replace(/ /g, "-")))
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const instance = await model.create({ id: "s1", title: "Hello World" }, { scope });
    expect(scope.getState(instance.$slug)).toBe("hello-world");
  });
});

describe("SSR: computed stores", () => {
  it("computed stores recompute in fork scopes", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .derived("sum", (stores) =>
        combine(
          stores.$a as Store<number>,
          stores.$b as Store<number>,
          (a, b) => a + b,
        ),
      )
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const instance = await model.create({ id: "c1", a: 10, b: 20 }, { scope });
    expect(scope.getState(instance.$sum)).toBe(30);
  });

  it("computed stores hydrate correctly from serialized scope", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .derived("doubled", (stores) =>
        (stores.$count as Store<number>).map((n) => n * 2),
      )
      .pk("id");

    const model = createModel({ contract });

    const serverScope = fork();
    const serverInstance = await model.create({ id: "c1", count: 7 }, { scope: serverScope });
    expect(serverScope.getState(serverInstance.$doubled)).toBe(14);

    const values = serialize(serverScope);

    const clientScope = fork({ values });
    expect(clientScope.getState(serverInstance.$count)).toBe(7);
    expect(clientScope.getState(serverInstance.$doubled)).toBe(14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY LEAK TESTS
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("MEMORY: defaults and computed", () => {
  it("bounded heap on repeated create with defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .store("count", (s) => s<number>().default(0))
      .store("label", (s) => s<string>().default((data) => `item-${data.id}`))
      .pk("id");

    const model = createModel({ contract });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-defaults" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "leak-defaults" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });

  it("bounded heap on repeated create with computed stores", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .derived("sum", (stores) =>
        combine(
          stores.$a as Store<number>,
          stores.$b as Store<number>,
          (a, b) => a + b,
        ),
      )
      .pk("id");

    const model = createModel({ contract });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-computed", a: i, b: i });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "leak-computed", a: i, b: i });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});
