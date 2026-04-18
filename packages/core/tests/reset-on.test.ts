import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize } from "effector";
import { createContract, createModel } from "../index";

// ─── Helpers ───

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

function createViewModelContract() {
  return createContract()
    .store("id", (s) => s<string>())
    .store("activeCategory", (s) => s<string | null>().default(null))
    .store("search", (s) => s<string>().default(""))
    .store("sortField", (s) =>
      s<"createdAt" | "priority">().default("createdAt" as const),
    )
    .store("sortDir", (s) => s<"asc" | "desc">().default("desc" as const))
    .store("page", (s) =>
      s<number>().default(0).resetOn("activeCategory", "search", "sortField", "sortDir"),
    )
    .pk("id");
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("RESET ON: basic behavior", () => {
  it("resets store to default when source store changes", () => {
    const model = createModel({ contract: createViewModelContract() });
    const vm = model.create({ id: "v1" });

    // Set page to non-default
    vm.$page.set(5);
    expect(vm.$page.getState()).toBe(5);

    // Changing activeCategory should reset page to 0
    vm.$activeCategory.set("work");
    expect(vm.$page.getState()).toBe(0);
  });

  it("resets on each source store independently", () => {
    const model = createModel({ contract: createViewModelContract() });
    const vm = model.create({ id: "v1" });

    vm.$page.set(3);
    vm.$search.set("hello");
    expect(vm.$page.getState()).toBe(0);

    vm.$page.set(7);
    vm.$sortField.set("priority");
    expect(vm.$page.getState()).toBe(0);

    vm.$page.set(2);
    vm.$sortDir.set("asc");
    expect(vm.$page.getState()).toBe(0);
  });

  it("does not reset when the store itself changes", () => {
    const model = createModel({ contract: createViewModelContract() });
    const vm = model.create({ id: "v1" });

    vm.$page.set(5);
    expect(vm.$page.getState()).toBe(5);
    // page change should NOT trigger its own reset
  });

  it("independent instances have independent resets", () => {
    const model = createModel({ contract: createViewModelContract() });
    const vm1 = model.create({ id: "v1" });
    const vm2 = model.create({ id: "v2" });

    vm1.$page.set(5);
    vm2.$page.set(10);

    // Changing vm1's category should reset vm1's page, not vm2's
    vm1.$activeCategory.set("work");
    expect(vm1.$page.getState()).toBe(0);
    expect(vm2.$page.getState()).toBe(10);
  });

  it("works with non-zero static default", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("filter", (s) => s<string>().default("all"))
      .store("offset", (s) => s<number>().default(100).resetOn("filter"))
      .pk("id");
    const model = createModel({ contract });
    const inst = model.create({ id: "1" });

    expect(inst.$offset.getState()).toBe(100);
    inst.$offset.set(500);
    expect(inst.$offset.getState()).toBe(500);

    inst.$filter.set("active");
    expect(inst.$offset.getState()).toBe(100);
  });

  it("no fn needed — contract fully describes behavior", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("category", (s) => s<string>().default("all"))
      .store("page", (s) => s<number>().default(0).resetOn("category"))
      .pk("id");
    // No fn — resetOn is declarative
    const model = createModel({ contract });
    const inst = model.create({ id: "1" });

    inst.$page.set(3);
    inst.$category.set("books");
    expect(inst.$page.getState()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("RESET ON: SSR", () => {
  it("resets work in fork scope", async () => {
    const model = createModel({ contract: createViewModelContract() });
    const scope = fork();

    const vm = await model.create({ id: "v1" }, { scope });

    await allSettled(vm.$page, { scope, params: 5 });
    expect(scope.getState(vm.$page)).toBe(5);

    await allSettled(vm.$activeCategory, { scope, params: "work" });
    expect(scope.getState(vm.$page)).toBe(0);
  });

  it("scoped reset does not affect global state", async () => {
    const model = createModel({ contract: createViewModelContract() });

    // Global instance
    const global = model.create({ id: "v1" });
    global.$page.set(5);

    // Scoped instance
    const scope = fork();
    const scoped = await model.create({ id: "v2" }, { scope });
    await allSettled(scoped.$page, { scope, params: 3 });
    await allSettled(scoped.$activeCategory, { scope, params: "work" });

    expect(scope.getState(scoped.$page)).toBe(0);
    expect(global.$page.getState()).toBe(5);
  });

  it("serializes and hydrates correctly after reset", async () => {
    const model = createModel({ contract: createViewModelContract() });
    const scope = fork();

    const vm = await model.create({ id: "v1" }, { scope });
    await allSettled(vm.$page, { scope, params: 5 });
    await allSettled(vm.$activeCategory, { scope, params: "work" });
    // page should be reset to 0
    expect(scope.getState(vm.$page)).toBe(0);

    const values = serialize(scope);
    const clientScope = fork({ values });
    expect(clientScope.getState(vm.$page)).toBe(0);
    expect(clientScope.getState(vm.$activeCategory)).toBe("work");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY LEAK TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("RESET ON: memory", () => {
  it("no leak from repeated create/delete with resetOn", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("filter", (s) => s<string>().default("all"))
      .store("page", (s) => s<number>().default(0).resetOn("filter"))
      .pk("id");
    const model = createModel({ contract });

    // Warm up
    for (let i = 0; i < 100; i++) {
      model.create({ id: `warm-${i}` });
      model.delete(`warm-${i}`);
    }

    const before = measureHeap();

    for (let i = 0; i < 1000; i++) {
      model.create({ id: `mem-${i}` });
      model.delete(`mem-${i}`);
    }

    const after = measureHeap();
    const growth = after - before;
    // Allow up to 2MB growth (GC variance)
    expect(growth).toBeLessThan(2 * 1024 * 1024);
  });
});
