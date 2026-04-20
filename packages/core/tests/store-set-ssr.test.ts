import { describe, expect, it } from "vitest";
import {
  allSettled,
  combine,
  createWatch,
  fork,
  scopeBind,
  serialize,
  type StoreWritable,
} from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// STORE.SET SSR
//
// Verifies that virtual store .set works correctly after SSR hydration.
// The core scenario: instances created on the server and hydrated on the client
// must have fully functional .set events that update stores reactively.
//
// Root cause this tests: reconstructInstance (called from model.instance()
// inside a combine evaluation) must produce working graph connections even
// when the SWC effector plugin's withFactory/withRegion is active.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

function todoContract() {
  return createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>().default(false))
    .pk("id");
}

function todoModel(name?: string) {
  return createModel({ contract: todoContract(), name });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEFAULT: $store.set works on globally created instances
// ─────────────────────────────────────────────────────────────────────────────

describe("$store.set: default (global)", () => {
  it("sets store value directly", () => {
    const model = todoModel();
    const inst = model.create({ id: "t1", title: "Buy milk" });

    expect(inst.$done.getState()).toBe(false);
    inst.$done.set(true);
    expect(inst.$done.getState()).toBe(true);
  });

  it("set is a proper effector event", () => {
    const model = todoModel();
    const inst = model.create({ id: "t1", title: "Buy milk" });
    const { is } = require("effector");

    expect(is.event(inst.$done.set)).toBe(true);
    expect(is.unit(inst.$done.set)).toBe(true);
  });

  it("set triggers reactive updates via combine", () => {
    const model = todoModel();
    const inst = model.create({ id: "t1", title: "Buy milk" });
    const $label = combine(inst.$done, inst.$title, (done, title) =>
      done ? `[x] ${title}` : `[ ] ${title}`,
    );

    expect($label.getState()).toBe("[ ] Buy milk");
    inst.$done.set(true);
    expect($label.getState()).toBe("[x] Buy milk");
  });

  it("set does not update when value is the same (=== check)", () => {
    const model = todoModel();
    const inst = model.create({ id: "t1", title: "Buy milk" });

    inst.$done.set(false);
    let updateCount = 0;
    inst.$done.updates.watch(() => updateCount++);
    inst.$done.set(false); // same value
    expect(updateCount).toBe(0);
  });

  it("set on a field with default works even when default was not explicitly provided in create()", () => {
    const model = todoModel();
    // done has default(false), so it's optional in create
    const inst = model.create({ id: "t1", title: "Buy milk" });

    expect(inst.$done.getState()).toBe(false);
    inst.$done.set(true);
    expect(inst.$done.getState()).toBe(true);
  });

  it("set works on multiple instances independently", () => {
    const model = todoModel();
    const a = model.create({ id: "a", title: "A" });
    const b = model.create({ id: "b", title: "B" });

    a.$done.set(true);
    expect(a.$done.getState()).toBe(true);
    expect(b.$done.getState()).toBe(false);

    b.$done.set(true);
    expect(b.$done.getState()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SSR: $store.set after fork/serialize/hydrate
// ─────────────────────────────────────────────────────────────────────────────

describe("$store.set: SSR (fork/serialize/hydrate)", () => {
  it("set works in a fork scope via allSettled", async () => {
    const model = todoModel("setSSR1");
    const inst = model.create({ id: "t1", title: "Buy milk" });

    const scope = fork();
    expect(scope.getState(inst.$done)).toBe(false);

    await allSettled(inst.$done.set, { scope, params: true });
    expect(scope.getState(inst.$done)).toBe(true);
    // Global is unchanged
    expect(inst.$done.getState()).toBe(false);
  });

  it("set works with scopeBind", () => {
    const model = todoModel("setSSR2");
    const inst = model.create({ id: "t1", title: "Buy milk" });

    const scope = fork();
    const boundSet = scopeBind(inst.$done.set, { scope });
    boundSet(true);
    expect(scope.getState(inst.$done)).toBe(true);
    expect(inst.$done.getState()).toBe(false);
  });

  it("set works after server create → serialize → client hydrate", async () => {
    const model = todoModel("setSSR3");

    // Server: create in scope
    const serverScope = fork();
    const inst = await model.create({ id: "t1", title: "Buy milk" }, { scope: serverScope });
    const values = serialize(serverScope);

    // Client: hydrate
    const clientScope = fork({ values });
    expect(clientScope.getState(inst.$done)).toBe(false);

    // Client: set in scope
    await allSettled(inst.$done.set, { scope: clientScope, params: true });
    expect(clientScope.getState(inst.$done)).toBe(true);
  });

  it("set works on lazily reconstructed instance via model.instance()", async () => {
    const model = todoModel("setSSR4");

    // Server: create in scope
    const serverScope = fork();
    await model.create({ id: "t1", title: "Buy milk" }, { scope: serverScope });
    const values = serialize(serverScope);

    // Clear global cache to force reconstruction
    model.clear();

    // Client: hydrate
    const clientScope = fork({ values });

    // Access instance via model.get() — triggers reconstruction from scope's $dataMap
    const inst = model.get("t1", clientScope);
    expect(inst).not.toBeNull();

    // The critical test: .set works on the reconstructed instance
    await allSettled(inst!.$done.set, { scope: clientScope, params: true });
    expect(clientScope.getState(inst!.$done)).toBe(true);
  });

  it("set fires createWatch in scope after reconstruction", async () => {
    const model = todoModel("setSSR5");

    const serverScope = fork();
    await model.create({ id: "t1", title: "Buy milk" }, { scope: serverScope });
    const values = serialize(serverScope);
    model.clear();

    const clientScope = fork({ values });
    const inst = model.get("t1", clientScope);
    expect(inst).not.toBeNull();

    let watchValue: boolean | undefined;
    createWatch({
      unit: inst!.$done,
      fn: (v) => {
        watchValue = v;
      },
      scope: clientScope,
    });

    await allSettled(inst!.$done.set, { scope: clientScope, params: true });
    expect(watchValue).toBe(true);
  });

  it("set on default field works when default was not in serialized data", async () => {
    const model = todoModel("setSSR6");

    const serverScope = fork();
    // Create with explicit done: false (the default)
    await model.create({ id: "t1", title: "Buy milk", done: false }, { scope: serverScope });
    const values = serialize(serverScope);
    model.clear();

    const clientScope = fork({ values });
    const inst = model.get("t1", clientScope);

    // Set to true
    await allSettled(inst!.$done.set, { scope: clientScope, params: true });
    expect(clientScope.getState(inst!.$done)).toBe(true);

    // Set back to false
    await allSettled(inst!.$done.set, { scope: clientScope, params: false });
    expect(clientScope.getState(inst!.$done)).toBe(false);
  });

  it("multiple instances reconstructed — each set is independent", async () => {
    const model = todoModel("setSSR7");

    const serverScope = fork();
    await model.create({ id: "t1", title: "First" }, { scope: serverScope });
    await model.create({ id: "t2", title: "Second" }, { scope: serverScope });
    const values = serialize(serverScope);
    model.clear();

    const clientScope = fork({ values });
    const inst1 = model.get("t1", clientScope);
    const inst2 = model.get("t2", clientScope);

    await allSettled(inst1!.$done.set, { scope: clientScope, params: true });
    expect(clientScope.getState(inst1!.$done)).toBe(true);
    expect(clientScope.getState(inst2!.$done)).toBe(false);
  });

  it("scoped set does not affect global state", async () => {
    const model = todoModel("setSSR8");
    const inst = model.create({ id: "t1", title: "Buy milk" });

    const scope = fork();
    await allSettled(inst.$done.set, { scope, params: true });

    expect(scope.getState(inst.$done)).toBe(true);
    expect(inst.$done.getState()).toBe(false);
  });

  it("set is serializable across scopes", async () => {
    const model = todoModel("setSSR9");

    const serverScope = fork();
    const inst = await model.create({ id: "t1", title: "Buy milk" }, { scope: serverScope });
    await allSettled(inst.$done.set, { scope: serverScope, params: true });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    // Value should be hydrated as true
    expect(clientScope.getState(inst.$done)).toBe(true);

    // Can set back to false
    await allSettled(inst.$done.set, { scope: clientScope, params: false });
    expect(clientScope.getState(inst.$done)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SSR: .on() handler wiring after reconstruction
// ─────────────────────────────────────────────────────────────────────────────

describe("$store.set: .on() handler wiring after reconstruction", () => {
  it("user-defined .on() handler works after reconstruction", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      name: "onWire1",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const serverScope = fork();
    await model.create({ id: "c1", count: 0 }, { scope: serverScope });
    const values = serialize(serverScope);
    model.clear();

    const clientScope = fork({ values });
    const inst = model.get("c1", clientScope);
    expect(inst).not.toBeNull();

    // Increment should work via .on() handler
    await allSettled(inst!.increment, { scope: clientScope });
    expect(clientScope.getState(inst!.$count)).toBe(1);
  });

  it("derived store works after reconstruction", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("firstName", (s) => s<string>())
      .store("lastName", (s) => s<string>())
      .derived("fullName", (s) =>
        combine(s.$firstName, s.$lastName, (f, l) => `${f} ${l}`),
      )
      .pk("id");

    const model = createModel({ contract, name: "derived1" });

    const serverScope = fork();
    await model.create(
      { id: "u1", firstName: "John", lastName: "Doe" },
      { scope: serverScope },
    );
    const values = serialize(serverScope);
    model.clear();

    const clientScope = fork({ values });
    const inst = model.get("u1", clientScope);
    expect(inst).not.toBeNull();
    expect(clientScope.getState(inst!.$fullName)).toBe("John Doe");

    // Set firstName and verify derived updates
    await allSettled(inst!.$firstName.set, { scope: clientScope, params: "Jane" });
    expect(clientScope.getState(inst!.$fullName)).toBe("Jane Doe");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MEMORY: reconstructed instances don't leak
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("$store.set: memory — reconstruction does not leak", () => {
  it("repeated reconstruction has bounded heap growth", () => {
    const model = todoModel("setMem1");

    // Warm up
    for (let i = 0; i < 5; i++) {
      model.create({ id: `warm-${i}`, title: `Warm ${i}` });
    }
    model.clear();

    const baseline = measureHeap();

    for (let round = 0; round < 10; round++) {
      // Create instances
      for (let i = 0; i < 20; i++) {
        model.create({ id: `item-${i}`, title: `Item ${i}` });
      }

      // Force reconstruction by clearing cache and accessing via instance()
      const ids = [...model.$ids.getState()];
      model.clear();

      // Re-create to populate $dataMap
      for (let i = 0; i < 20; i++) {
        model.create({ id: `item-${i}`, title: `Item ${i}` });
      }

      // Access via get() to trigger reconstruction path
      for (const id of ids) {
        model.get(id);
      }
      model.clear();
    }

    const after = measureHeap();
    const growthMB = (after - baseline) / 1024 / 1024;
    console.log(
      `[store.set reconstruction] heap growth over 10 rounds × 20 instances: ${growthMB.toFixed(2)} MB`,
    );
    expect(growthMB).toBeLessThan(10);
  });
});
