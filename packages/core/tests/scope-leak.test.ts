import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize } from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE MEMORY LEAK TESTS
//
// New architecture: scoped create() reuses global units and only sets
// scope values via allSettled. No per-scope graph nodes are created.
// When a scope is GC'd, only its value overrides are freed — lightweight.
// No clearScope() needed.
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

function counterModel(name?: string) {
  const contract = counterContract();
  return createModel({
    contract,
    name,
    fn: ({ $count, increment }) => {
      $count.on(increment, (n) => n + 1);
      return { $count, increment };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BASELINE: FORK() SCOPES ALONE
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: baseline — fork() scopes alone", () => {
  it("1000 discarded fork() scopes have bounded heap", () => {
    for (let i = 0; i < 50; i++) {
      fork();
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 1000; i++) {
      fork();
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[baseline fork] heap growth over 1000 scopes: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCOPED CREATE — NO PER-SCOPE GRAPH NODES
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: scoped create reuses global units", () => {
  it("500 scoped creates for same ID — near-zero heap growth", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      await model.create({ id: "warmup", count: 0 }, { scope });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      const scope = fork();
      await model.create({ id: "shared", count: i }, { scope });
      // Same global units reused — only scope value overrides created
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[scoped reuse] heap growth over 500 scoped creates (same ID): ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("500 scoped creates with allSettled mutations — bounded heap", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      const inst = await model.create({ id: "warmup", count: 0 }, { scope });
      await allSettled(inst.increment, { scope });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      const scope = fork();
      const inst = await model.create({ id: "mut", count: 0 }, { scope });
      await allSettled(inst.increment, { scope });
      await allSettled(inst.increment, { scope });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[scoped mutate] heap growth over 500 scoped creates+mutations: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RETAINED SCOPE REFERENCES — ONLY VALUE OVERRIDES HELD
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: retained scope references", () => {
  it("retaining scopes grows heap modestly (value overrides only, no graph nodes)", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      await model.create({ id: "warmup", count: 0 }, { scope });
    }

    const heapBefore = measureHeap();

    const retained: ReturnType<typeof fork>[] = [];
    for (let i = 0; i < 2000; i++) {
      const scope = fork();
      await model.create({ id: "shared", count: i }, { scope });
      retained.push(scope);
    }

    const heapRetained = measureHeap();
    const growthMB = (heapRetained - heapBefore) / 1024 / 1024;
    console.log(`[retained] heap with 2000 retained scopes: ${growthMB.toFixed(2)} MB`);

    // No per-scope graph nodes — growth is only scope value overrides
    // Should be much smaller than the old architecture
    expect(growthMB).toBeLessThan(30);

    retained.length = 0;
  });

  it("releasing retained scopes allows GC", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      await model.create({ id: "warmup", count: 0 }, { scope });
    }

    const heapBefore = measureHeap();

    const retained: ReturnType<typeof fork>[] = [];
    for (let i = 0; i < 2000; i++) {
      const scope = fork();
      await model.create({ id: "shared", count: i }, { scope });
      retained.push(scope);
    }

    const heapHeld = measureHeap();
    retained.length = 0;
    const heapReleased = measureHeap();

    const growthHeldMB = (heapHeld - heapBefore) / 1024 / 1024;
    const growthReleasedMB = (heapReleased - heapBefore) / 1024 / 1024;
    console.log(`[release] held: ${growthHeldMB.toFixed(2)} MB, released: ${growthReleasedMB.toFixed(2)} MB`);

    expect(growthReleasedMB).toBeLessThanOrEqual(growthHeldMB);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PENDING CREATES — PROMISE CLEANUP
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: pendingCreates cleanup", () => {
  it("rapid scoped creates with same ID — promises resolve and don't leak", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      await model.create({ id: "warmup", count: 0 }, { scope });
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 200; i++) {
      const scope = fork();
      const promises = Array.from({ length: 5 }, (_, j) =>
        model.create({ id: "race", count: j }, { scope }),
      );
      await Promise.all(promises);
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[pendingCreates] heap growth over 200 scopes × 5 races: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MULTI-MODEL × MULTI-SCOPE
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: multi-model × multi-scope", () => {
  it("10 models × 100 scopes — bounded heap", async () => {
    const models = Array.from({ length: 10 }, (_, i) => counterModel(`mm-${i}`));

    for (const model of models) {
      const scope = fork();
      await model.create({ id: "warmup", count: 0 }, { scope });
    }

    const heapBefore = measureHeap();

    for (let s = 0; s < 100; s++) {
      const scope = fork();
      for (let m = 0; m < models.length; m++) {
        await models[m]!.create({ id: "inst", count: s }, { scope });
      }
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[multi-model] heap growth over 10 models × 100 scopes: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. REFS IN SCOPED INSTANCES
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: refs in scoped instances", () => {
  it("scoped instances with refs — bounded heap", async () => {
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
    });
    model.bind({ items: () => targetModel, current: () => targetModel });

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      const inst = await model.create({ id: "warmup", title: "t" }, { scope });
      await allSettled(inst.items.add, { scope, params: "x" });
      await allSettled(inst.current.set, { scope, params: "y" });
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 300; i++) {
      const scope = fork();
      const inst = await model.create({ id: "ref-inst", title: "t" }, { scope });
      await allSettled(inst.items.add, { scope, params: `child-${i}` });
      await allSettled(inst.current.set, { scope, params: `selected-${i}` });
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[scoped refs] heap growth over 300 scoped ref instances: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. FULL SSR SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: full SSR simulation", () => {
  it("2000 SSR requests — no clearScope needed, bounded heap", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      const inst = await model.create({ id: "warmup", count: 0 }, { scope });
      await allSettled(inst.increment, { scope });
      serialize(scope);
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 2000; i++) {
      const scope = fork();
      const inst = await model.create({ id: "counter", count: 0 }, { scope });
      await allSettled(inst.increment, { scope });
      await allSettled(inst.increment, { scope });
      serialize(scope);
      // No clearScope needed — no per-scope graph nodes exist
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[SSR sim] heap growth over 2000 SSR requests (no clearScope): ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. LONG-LIVED SCOPE WITH CHURN
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: long-lived scope with churn", () => {
  it("single scope with 500 create/delete cycles — bounded heap", async () => {
    const model = counterModel();
    const scope = fork();

    for (let i = 0; i < 20; i++) {
      await model.create({ id: "churn", count: 0 }, { scope });
      model.delete("churn");
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      await model.create({ id: "churn-cycle", count: i }, { scope });
      model.delete("churn-cycle");
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[churn] heap growth over 500 create/delete in 1 scope: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. SERIALIZE DOESN'T PIN SCOPE
// ─────────────────────────────────────────────────────────────────────────────

describe("SCOPE LEAK: serialize interaction with GC", () => {
  it("serialized values don't pin scope — bounded heap", async () => {
    const model = counterModel();

    for (let i = 0; i < 20; i++) {
      const scope = fork();
      const inst = await model.create({ id: "warmup", count: 0 }, { scope });
      await allSettled(inst.increment, { scope });
      serialize(scope);
    }

    const heapBefore = measureHeap();

    const allValues: Record<string, unknown>[] = [];
    for (let i = 0; i < 500; i++) {
      const scope = fork();
      const inst = await model.create({ id: "ser", count: 0 }, { scope });
      await allSettled(inst.increment, { scope });
      allValues.push(serialize(scope));
    }

    const heapWithValues = measureHeap();
    const growthMB = (heapWithValues - heapBefore) / 1024 / 1024;
    console.log(`[serialize] heap with 500 serialized values: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(10);

    allValues.length = 0;
  });
});
