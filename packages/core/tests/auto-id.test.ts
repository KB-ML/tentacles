import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// PK STRING SHORTHAND
// ─────────────────────────────────────────────────────────────────────────────

describe("pk string shorthand", () => {
  it("pk('id') works identically to pk((d) => d.id)", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ id: "note-1", title: "Hello" });
    expect(instance.__id).toBe("note-1");
    expect(instance.$title.getState()).toBe("Hello");
  });

  it("pk shorthand with numeric field", () => {
    const contract = createContract()
      .store("num", (s) => s<number>())
      .store("value", (s) => s<string>())
      .pk("num");

    const model = createModel({ contract });

    const instance = model.create({ num: 42, value: "test" });
    expect(instance.__id).toBe("42");
  });

  it("pk shorthand: multiple instances with different IDs", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ id: "a", name: "Alice" });
    const b = model.create({ id: "b", name: "Bob" });

    expect(a.__id).toBe("a");
    expect(b.__id).toBe("b");
    expect(model.$ids.getState()).toEqual(["a", "b"]);
  });

  it("pk shorthand: replaces instance with same id", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    model.create({ id: "x", value: "first" });
    const second = model.create({ id: "x", value: "second" });

    expect(second.$value.getState()).toBe("second");
    expect(model.$count.getState()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOINCREMENT
// ─────────────────────────────────────────────────────────────────────────────

describe("Autoincrement: basic", () => {
  it("generates sequential IDs starting from 1", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("title", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ title: "First" });
    const b = model.create({ title: "Second" });
    const c = model.create({ title: "Third" });

    expect(a.$id.getState()).toBe(1);
    expect(b.$id.getState()).toBe(2);
    expect(c.$id.getState()).toBe(3);
    expect(a.__id).toBe("1");
    expect(b.__id).toBe("2");
    expect(c.__id).toBe("3");
  });

  it("id field is optional in create() data", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    // No id provided — auto-generated
    const instance = model.create({ name: "test" });
    expect(instance.$id.getState()).toBe(1);
  });

  it("explicit id overrides autoincrement", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ name: "auto" });
    const b = model.create({ id: 100, name: "manual" });
    const c = model.create({ name: "auto-again" });

    expect(a.$id.getState()).toBe(1);
    expect(b.$id.getState()).toBe(100);
    expect(b.__id).toBe("100");
    // Counter bumps past explicit value to avoid collisions
    expect(c.$id.getState()).toBe(101);
  });

  it("IDs are never reused after delete", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ value: "first" });
    expect(a.__id).toBe("1");

    model.delete("1");

    const b = model.create({ value: "second" });
    expect(b.__id).toBe("2"); // Not "1"
  });

  it("counter resets on clear()", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    model.create({ value: "a" });
    model.create({ value: "b" });
    model.create({ value: "c" });

    model.clear();

    const fresh = model.create({ value: "fresh" });
    expect(fresh.__id).toBe("1"); // Counter reset
    expect(fresh.$id.getState()).toBe(1);
  });

  it("works with createMany", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const items = model.createMany([
      { name: "Alice" },
      { name: "Bob" },
      { name: "Charlie" },
    ]);

    expect(items[0]!.$id.getState()).toBe(1);
    expect(items[1]!.$id.getState()).toBe(2);
    expect(items[2]!.$id.getState()).toBe(3);
    expect(items[0]!.__id).toBe("1");
    expect(items[1]!.__id).toBe("2");
    expect(items[2]!.__id).toBe("3");
  });

  it("autoincrement with other defaults", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("title", (s) => s<string>())
      .store("status", (s) => s<string>().default("draft"))
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ title: "Hello" });
    expect(instance.$id.getState()).toBe(1);
    expect(instance.$status.getState()).toBe("draft");
    expect(instance.$title.getState()).toBe("Hello");
  });

  it("autoincrement with factory defaults that depend on id", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("label", (s) => s<string>().default((data) => `item-${data.id}`))
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({});
    const b = model.create({});

    expect(a.$label.getState()).toBe("item-1");
    expect(b.$label.getState()).toBe("item-2");
  });

  it("store value is number, not string", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const instance = model.create({ value: "test" });
    expect(typeof instance.$id.getState()).toBe("number");
    expect(instance.$id.getState()).toBe(1);
  });

  it("independent counters per model", () => {
    const contractA = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const contractB = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("data", (s) => s<string>())
      .pk("id");

    const modelA = createModel({ contract: contractA });
    const modelB = createModel({ contract: contractB });

    modelA.create({ value: "a1" });
    modelA.create({ value: "a2" });
    modelB.create({ data: "b1" });

    expect(modelA.$ids.getState()).toEqual(["1", "2"]);
    expect(modelB.$ids.getState()).toEqual(["1"]);
  });

  it("reactive stores work with autoincrement IDs", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    model.create({ name: "Alice" });
    model.create({ name: "Bob" });

    expect(model.$count.getState()).toBe(2);
    expect(model.$ids.getState()).toEqual(["1", "2"]);

    const inst = model.get("1");
    expect(inst).not.toBeNull();
    expect(inst!.$name.getState()).toBe("Alice");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOINCREMENT + PK SHORTHAND COMBINED
// ─────────────────────────────────────────────────────────────────────────────

describe("Autoincrement + pk shorthand", () => {
  it("combined usage: .autoincrement() + pk('id')", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("content", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const note1 = model.create({ content: "Hello" });
    const note2 = model.create({ content: "World" });

    expect(note1.__id).toBe("1");
    expect(note2.__id).toBe("2");
    expect(note1.$content.getState()).toBe("Hello");
    expect(note2.$content.getState()).toBe("World");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("SSR: pk shorthand", () => {
  it("pk shorthand works with scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const instance = await model.create({ id: "s1", value: 42 }, { scope });
    expect(scope.getState(instance.$value)).toBe(42);
    expect(instance.__id).toBe("s1");
  });

  it("pk shorthand serializes correctly", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract, name: "ssr-pk-serialize" });

    const scope = fork();
    await model.create({ id: "s1", name: "test" }, { scope });
    const values = serialize(scope);

    const dataMap = values["tentacles:ssr-pk-serialize:__dataMap__"] as Record<string, Record<string, unknown>>;
    expect(dataMap["s1"]?.name).toBe("test");
  });
});

describe("SSR: autoincrement", () => {
  it("autoincrement works with scoped create", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("title", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const scope = fork();
    const a = await model.create({ title: "First" }, { scope });
    const b = await model.create({ title: "Second" }, { scope });

    expect(a.__id).toBe("1");
    expect(b.__id).toBe("2");
    expect(scope.getState(a.$title)).toBe("First");
    expect(scope.getState(b.$title)).toBe("Second");
  });

  it("autoincrement serializes and hydrates", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract, name: "ssr-auto-hydrate" });

    const serverScope = fork();
    await model.create({ name: "Alice" }, { scope: serverScope });
    const values = serialize(serverScope);

    const dataMap = values["tentacles:ssr-auto-hydrate:__dataMap__"] as Record<string, Record<string, unknown>>;
    expect(dataMap["1"]?.name).toBe("Alice");
    expect(dataMap["1"]?.id).toBe(1);

    const clientScope = fork({ values });
    const inst = model.get("1");
    expect(inst).not.toBeNull();
    expect(clientScope.getState(inst!.$name)).toBe("Alice");
    expect(clientScope.getState(inst!.$id)).toBe(1);
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

describe("MEMORY: autoincrement", () => {
  it("bounded heap on repeated create with autoincrement", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    // Warmup
    for (let i = 0; i < 50; i++) {
      model.clear();
      model.create({ value: "warmup" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.clear();
      model.create({ value: "test" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });

  it("bounded heap with autoincrement replacing same id", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    // Warmup: create+clear cycle so counter resets
    for (let i = 0; i < 50; i++) {
      model.clear();
      model.create({ value: "warmup" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      // Same explicit id to trigger replacement
      model.create({ id: 1, value: `test-${i}` });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});

describe("MEMORY: pk shorthand", () => {
  it("bounded heap with pk shorthand", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup", value: "x" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "leak-test", value: `v-${i}` });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-FIELD AUTOINCREMENT COUNTERS
// ─────────────────────────────────────────────────────────────────────────────

describe("Autoincrement: per-field counters", () => {
  it("multiple autoincrement fields get independent counters", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("order", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ name: "first" });
    const b = model.create({ name: "second" });

    expect(a.$id.getState()).toBe(1);
    expect(a.$order.getState()).toBe(1);
    expect(b.$id.getState()).toBe(2);
    expect(b.$order.getState()).toBe(2);
  });

  it("explicit value for one field doesn't affect the other", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("seq", (s) => s<number>().autoincrement())
      .store("label", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    const a = model.create({ label: "auto" });
    const b = model.create({ id: 100, label: "manual id" });
    const c = model.create({ seq: 50, label: "manual seq" });
    const d = model.create({ label: "auto again" });

    expect(a.$id.getState()).toBe(1);
    expect(a.$seq.getState()).toBe(1);
    expect(b.$id.getState()).toBe(100);
    expect(b.$seq.getState()).toBe(2); // seq counter continues
    expect(c.$id.getState()).toBe(101); // id counter bumped past explicit 100
    expect(c.$seq.getState()).toBe(50);
    expect(d.$id.getState()).toBe(102);
    expect(d.$seq.getState()).toBe(51);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR: AUTOINCREMENT COUNTER SERIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

describe("SSR: autoincrement counter serialization", () => {
  it("counter is serialized and hydrated — new create continues sequence", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract, name: "ssr-counter" });

    const serverScope = fork();
    await model.create({ name: "Alice" }, { scope: serverScope });
    await model.create({ name: "Bob" }, { scope: serverScope });

    const values = serialize(serverScope);

    // Counter store should be serialized
    const counter = values["tentacles:ssr-counter:__autoIncrement__"] as Record<string, number>;
    expect(counter).toEqual({ id: 2 });
  });

  it("hydrated scope continues counter after create+delete", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract, name: "ssr-counter-del" });

    const serverScope = fork();
    await model.create({ value: "A" }, { scope: serverScope }); // id=1
    await model.create({ value: "B" }, { scope: serverScope }); // id=2
    await model.create({ value: "C" }, { scope: serverScope }); // id=3
    model.delete("2", serverScope);

    const values = serialize(serverScope);

    // Counter should be 3 even though id=2 was deleted
    const counter = values["tentacles:ssr-counter-del:__autoIncrement__"] as Record<
      string,
      number
    >;
    expect(counter).toEqual({ id: 3 });
  });

  it("per-field counters serialize independently", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("seq", (s) => s<number>().autoincrement())
      .store("label", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract, name: "ssr-multi-counter" });

    const serverScope = fork();
    await model.create({ label: "A" }, { scope: serverScope });
    await model.create({ seq: 99, label: "B" }, { scope: serverScope }); // explicit seq

    const values = serialize(serverScope);
    const counter = values["tentacles:ssr-multi-counter:__autoIncrement__"] as Record<
      string,
      number
    >;
    // id incremented twice; seq incremented once + bumped past explicit 99
    expect(counter).toEqual({ id: 2, seq: 99 });
  });

  it("scoped clear resets counter in scope", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract, name: "ssr-counter-clear" });

    const scope = fork();
    await model.create({ value: "A" }, { scope }); // id=1
    await model.create({ value: "B" }, { scope }); // id=2
    await model.clear(scope);
    const fresh = await model.create({ value: "C" }, { scope });

    // After a scoped clear, the scope's counter truly resets — the next create
    // starts over at 1 because scope state is no longer coupled to any process-
    // global counter.
    expect(fresh.__id).toBe("1");
    const values = serialize(scope);
    const counter = values["tentacles:ssr-counter-clear:__autoIncrement__"] as Record<
      string,
      number
    >;
    expect(counter).toEqual({ id: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY: AUTOINCREMENT COUNTER STORE
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: autoincrement counter store", () => {
  it("counter store does not leak on repeated create/clear", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({ contract });

    // Warmup
    for (let i = 0; i < 50; i++) {
      model.clear();
      model.create({ value: "warmup" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.clear();
      model.create({ value: "test" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});
