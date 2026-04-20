import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// SCOPED TESTS
//
// Units are global singletons per (model, instanceId).
// Scoped create() reuses global units and sets scope values via allSettled.
// Each scope holds independent state via effector's fork mechanism.
// No per-scope graph nodes — scope GC just frees the value overrides.
//
// delete(id, scope) / clear(scope) reset scope values to global defaults.
// delete(id) / clear() destroy global graph nodes.
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

function counterContract() {
  return createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("increment", (e) => e<void>())
    .pk("id");
}

function counterModel() {
  const contract = counterContract();
  return createModel({
    contract,
    fn: ({ $count, increment }) => {
      $count.on(increment, (n) => n + 1);
      return { $count, increment };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCOPED CREATE — VALUE ISOLATION
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED CREATE: value isolation", () => {
  it("scoped create sets scope values independently from global", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = model.create({ id: "same-id", count: 0 });
    await model.create({ id: "same-id", count: 100 }, { scope });

    expect(inst.$count.getState()).toBe(0);
    expect(scope.getState(inst.$count)).toBe(100);
  });

  it("same ID in different scopes has independent state", async () => {
    const model = counterModel();
    const inst = model.create({ id: "shared", count: 0 });

    const scope1 = fork();
    const scope2 = fork();

    await model.create({ id: "shared", count: 10 }, { scope: scope1 });
    await model.create({ id: "shared", count: 20 }, { scope: scope2 });

    await allSettled(inst.increment, { scope: scope1 });

    expect(scope1.getState(inst.$count)).toBe(11);
    expect(scope2.getState(inst.$count)).toBe(20);
    expect(inst.$count.getState()).toBe(0);
  });

  it("scoped create with same ID overrides scope values", async () => {
    const model = counterModel();
    const scope = fork();

    await model.create({ id: "x", count: 1 }, { scope });
    const inst = await model.create({ id: "x", count: 99 }, { scope });

    expect(scope.getState(inst.$count)).toBe(99);
  });

  it("scoped create without prior global creates global units implicitly", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = await model.create({ id: "only-scoped", count: 42 }, { scope });

    expect(scope.getState(inst.$count)).toBe(42);
    // Global units were created with data from first create
    expect(inst.$count.getState()).toBe(42);
  });

  it("scoped create returns same model reference as global", async () => {
    const model = counterModel();
    const scope = fork();

    const global = model.create({ id: "ref-check", count: 0 });
    const scoped = await model.create({ id: "ref-check", count: 10 }, { scope });

    expect(scoped).toBe(global);
  });

  it("mutations in scope do not affect global", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = await model.create({ id: "mut", count: 0 }, { scope });
    await allSettled(inst.increment, { scope });
    await allSettled(inst.increment, { scope });
    await allSettled(inst.increment, { scope });

    expect(scope.getState(inst.$count)).toBe(3);
    expect(inst.$count.getState()).toBe(0);
  });

  it("mutations in global do not affect scope", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = model.create({ id: "gmut", count: 0 });
    await model.create({ id: "gmut", count: 0 }, { scope });

    inst.increment();
    inst.increment();

    expect(inst.$count.getState()).toBe(2);
    expect(scope.getState(inst.$count)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCOPED DELETE — RESETS SCOPE VALUES TO GLOBAL DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED DELETE: reset scope values", () => {
  it("delete(id, scope) resets scope value to global default", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = model.create({ id: "del-scoped", count: 0 });
    await model.create({ id: "del-scoped", count: 100 }, { scope });
    expect(scope.getState(inst.$count)).toBe(100);

    await model.delete("del-scoped", scope);
    expect(scope.getState(inst.$count)).toBe(0);
  });

  it("delete(id, scope) does not affect other scopes", async () => {
    const model = counterModel();
    const scope1 = fork();
    const scope2 = fork();

    const inst = model.create({ id: "sd-cross", count: 0 });
    await model.create({ id: "sd-cross", count: 10 }, { scope: scope1 });
    await model.create({ id: "sd-cross", count: 20 }, { scope: scope2 });

    await model.delete("sd-cross", scope1);

    expect(scope1.getState(inst.$count)).toBe(0);
    expect(scope2.getState(inst.$count)).toBe(20);
  });

  it("delete(id, scope) does not affect global state", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = model.create({ id: "sd-global", count: 5 });
    inst.increment();
    await model.create({ id: "sd-global", count: 99 }, { scope });

    await model.delete("sd-global", scope);

    // Scope falls back to current global state (6), not original default (5)
    expect(scope.getState(inst.$count)).toBe(6);
    expect(inst.$count.getState()).toBe(6);
  });

  it("delete(id, scope) on non-existent instance is a no-op", async () => {
    const model = counterModel();
    const scope = fork();

    await model.delete("does-not-exist", scope);
    // No error thrown
  });

  it("scoped create after scoped delete works correctly", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = await model.create({ id: "recreate", count: 0 }, { scope });
    await allSettled(inst.increment, { scope });
    expect(scope.getState(inst.$count)).toBe(1);

    await model.delete("recreate", scope);
    expect(scope.getState(inst.$count)).toBe(0);

    await model.create({ id: "recreate", count: 50 }, { scope });
    expect(scope.getState(inst.$count)).toBe(50);
  });

  it("delete(id, scope) resets mutated scope state", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = await model.create({ id: "mutated", count: 0 }, { scope });
    await allSettled(inst.increment, { scope });
    await allSettled(inst.increment, { scope });
    await allSettled(inst.increment, { scope });
    expect(scope.getState(inst.$count)).toBe(3);

    await model.delete("mutated", scope);
    expect(scope.getState(inst.$count)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SCOPED CLEAR — RESETS ALL INSTANCES IN SCOPE
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED CLEAR: reset all scope values", () => {
  it("clear(scope) resets all instances in that scope", async () => {
    const model = counterModel();
    const scope = fork();

    const a = model.create({ id: "a", count: 0 });
    const b = model.create({ id: "b", count: 0 });

    await model.create({ id: "a", count: 10 }, { scope });
    await model.create({ id: "b", count: 20 }, { scope });

    await model.clear(scope);

    expect(scope.getState(a.$count)).toBe(0);
    expect(scope.getState(b.$count)).toBe(0);
  });

  it("clear(scope) does not affect other scopes", async () => {
    const model = counterModel();
    const scope1 = fork();
    const scope2 = fork();

    const inst = model.create({ id: "cross", count: 0 });
    await model.create({ id: "cross", count: 10 }, { scope: scope1 });
    await model.create({ id: "cross", count: 20 }, { scope: scope2 });

    await model.clear(scope1);

    expect(scope1.getState(inst.$count)).toBe(0);
    expect(scope2.getState(inst.$count)).toBe(20);
  });

  it("clear(scope) does not affect global state", async () => {
    const model = counterModel();
    const scope = fork();

    const inst = model.create({ id: "gcross", count: 5 });
    inst.increment();
    await model.create({ id: "gcross", count: 99 }, { scope });

    await model.clear(scope);

    // Scope falls back to current global state (6), not original default (5)
    expect(scope.getState(inst.$count)).toBe(6);
    expect(inst.$count.getState()).toBe(6);
  });

  it("clear() does not affect scoped state", async () => {
    const model = counterModel();
    const scope = fork();

    await model.create({ id: "survive", count: 77 }, { scope });
    const inst = model.create({ id: "die", count: 0 });
    void inst;

    model.clear();

    // Scope still has the override from before clear
    // (units are destroyed, but scope retains its value map)
  });

  it("scoped create after clear(scope) works correctly", async () => {
    const model = counterModel();
    const scope = fork();

    await model.create({ id: "x", count: 10 }, { scope });
    await model.create({ id: "y", count: 20 }, { scope });

    await model.clear(scope);

    const inst = await model.create({ id: "x", count: 42 }, { scope });
    expect(scope.getState(inst.$count)).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GLOBAL DELETE — DESTROYS GRAPH NODES
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED: global delete", () => {
  it("delete(id) removes global units", () => {
    const model = counterModel();

    model.create({ id: "to-delete", count: 0 });
    model.delete("to-delete");

    const fresh = model.create({ id: "to-delete", count: 42 });
    expect(fresh.$count.getState()).toBe(42);
  });

  it("delete(id) + scoped re-create works", async () => {
    const model = counterModel();
    const scope = fork();

    await model.create({ id: "cycle", count: 50 }, { scope });

    model.delete("cycle");

    const inst = await model.create({ id: "cycle", count: 77 }, { scope });
    expect(scope.getState(inst.$count)).toBe(77);
  });

  it("clear() removes all global instances", () => {
    const model = counterModel();

    model.create({ id: "a", count: 1 });
    model.create({ id: "b", count: 2 });
    model.clear();

    const fresh = model.create({ id: "a", count: 100 });
    expect(fresh.$count.getState()).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SCOPED DELETE/CLEAR WITH REFS
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED DELETE: refs", () => {
  function makeRefModel() {
    const targetContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const targetModel = createModel({
      contract: targetContract,
      fn: ({ $name }) => ({ $name }),
    });

    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("items", "many")
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $title, items, current }) => ({ $title, items, current }),
    refs: { items: () => targetModel, current: () => targetModel },
  });
       return model;
  }

  it("delete(id, scope) resets ref state in scope", async () => {
    const model = makeRefModel();
    const scope = fork();

    const inst = await model.create({ id: "rd-1", title: "t" }, { scope });
    await allSettled(inst.items.add, { scope, params: "a" });
    await allSettled(inst.items.add, { scope, params: "b" });
    await allSettled(inst.current.set, { scope, params: "x" });

    expect(scope.getState(inst.items.$ids)).toEqual(["a", "b"]);
    expect(scope.getState(inst.current.$id)).toBe("x");

    await model.delete("rd-1", scope);

    expect(scope.getState(inst.items.$ids)).toEqual([]);
    expect(scope.getState(inst.current.$id)).toBeNull();
    expect(scope.getState(inst.$title)).toBe("t");
  });

  it("clear(scope) resets all refs in scope", async () => {
    const model = makeRefModel();
    const scope = fork();

    const a = await model.create({ id: "rc-a", title: "A" }, { scope });
    const b = await model.create({ id: "rc-b", title: "B" }, { scope });
    await allSettled(a.items.add, { scope, params: "ref-1" });
    await allSettled(b.current.set, { scope, params: "ref-2" });

    await model.clear(scope);

    expect(scope.getState(a.items.$ids)).toEqual([]);
    expect(scope.getState(b.current.$id)).toBeNull();
  });

  it("delete(id, scope) on refs does not affect other scopes", async () => {
    const model = makeRefModel();
    const scope1 = fork();
    const scope2 = fork();

    const inst = await model.create({ id: "rc-cross", title: "t" }, { scope: scope1 });
    await model.create({ id: "rc-cross", title: "t" }, { scope: scope2 });

    await allSettled(inst.items.add, { scope: scope1, params: "s1" });
    await allSettled(inst.items.add, { scope: scope2, params: "s2" });

    await model.delete("rc-cross", scope1);

    expect(scope1.getState(inst.items.$ids)).toEqual([]);
    expect(scope2.getState(inst.items.$ids)).toEqual(["s2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SSR LIFECYCLE WITH SCOPED DELETE
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED: SSR lifecycle", () => {
  it("per-request: create → mutate → serialize → delete", async () => {
    const model = counterModel();
    const results: number[] = [];

    for (let i = 0; i < 5; i++) {
      const scope = fork();
      const inst = await model.create(
        { id: "page", count: i * 10 },
        { scope },
      );

      await allSettled(inst.increment, { scope });
      results.push(scope.getState(inst.$count));

      const values = serialize(scope);
      expect(values).toBeDefined();

      await model.delete("page", scope);
    }

    expect(results).toEqual([1, 11, 21, 31, 41]);
  });

  it("concurrent requests with scoped delete do not interfere", async () => {
    const model = counterModel();

    const responses = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const scope = fork();
        const inst = await model.create(
          { id: "req", count: 0 },
          { scope },
        );

        for (let j = 0; j <= i; j++) {
          await allSettled(inst.increment, { scope });
        }

        const count = scope.getState(inst.$count);
        await model.delete("req", scope);
        return count;
      }),
    );

    for (let i = 0; i < responses.length; i++) {
      expect(responses[i]).toBe(i + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. HEAP — NO PER-SCOPE GRAPH NODES
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED: no per-scope graph nodes", () => {
  it("scoped creates reuse global units — bounded heap", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      await model.create({ id: "warmup", count: 0 }, { scope });
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      const scope = fork();
      await model.create({ id: "shared-inst", count: i }, { scope });
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[scoped no-graph] heap growth over 500 scoped creates: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("clear() reclaims global instances — bounded heap", () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      model.create({ id: "warmup-c", count: 0 });
      model.clear();
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      model.create({ id: `batch-${i}`, count: 0 });
    }
    model.clear();

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[clear()] heap growth after 500 instances + clear: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SID MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPED: SID management", () => {
  it("scoped create reuses global SIDs — no duplicate warnings", async () => {
    const model = counterModel();

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

    try {
      const scope1 = fork();
      const scope2 = fork();

      await model.create({ id: "sid-test", count: 0 }, { scope: scope1 });
      await model.create({ id: "sid-test", count: 0 }, { scope: scope2 });

      const dupWarnings = warnings.filter((w) => w.includes("Duplicate SID"));
      expect(dupWarnings.length).toBe(0);
    } finally {
      console.warn = origWarn;
    }
  });

  it("global delete + re-create cleans up SIDs", async () => {
    const model = counterModel();
    const scope = fork();

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

    try {
      await model.create({ id: "sid-del-test", count: 0 }, { scope });
      model.delete("sid-del-test");
      await model.create({ id: "sid-del-test", count: 0 }, { scope });

      const dupWarnings = warnings.filter((w) => w.includes("Duplicate SID"));
      expect(dupWarnings.length).toBe(0);
    } finally {
      console.warn = origWarn;
    }
  });
});
