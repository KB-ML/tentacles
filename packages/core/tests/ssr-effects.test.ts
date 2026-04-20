import { allSettled, fork, serialize } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { InstanceCache } from "../layers/model/instance-cache";

// ─────────────────────────────────────────────────────────────────────────────
// SSR effects: deleteFx / updateFx / clearFx must work against
// instances that exist only in a fork scope (hydrated from serialize).
//
// In real Next.js apps the server and client run in separate processes,
// so the client never imperatively populates the global instance cache —
// it only sees the data via hydrated scope values. To faithfully reproduce
// that condition in a single test process we wipe the model's internal
// cache between server-side creation and the simulated client operations.
// ─────────────────────────────────────────────────────────────────────────────

function todoContract() {
  return createContract()
    .store("id", (s) => s<number>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>().default(false))
    .pk("id");
}

function todoModel(name?: string) {
  return createModel({ contract: todoContract(), name });
}

/**
 * Reaches into the Model's private InstanceCache and replaces it with a fresh
 * one. Simulates "the client process never ran createInstance imperatively".
 * The reactive state inside scopes is untouched.
 */
function wipeGlobalCache(model: unknown): void {
  (model as { cache: InstanceCache<unknown> }).cache = new InstanceCache();
}

/**
 * Helper: simulate the SSR roundtrip.
 * 1. Create data on the "server" via fork + scoped createManyFx
 * 2. Serialize → fresh fork on the "client" with hydrated values
 * 3. Wipe the global cache to mimic a separate client process
 */
async function ssrHydrate(
  model: ReturnType<typeof todoModel>,
  items: { id: number; title: string; done?: boolean }[],
) {
  const serverScope = fork();
  await allSettled(model.createManyFx, { scope: serverScope, params: items });
  const values = serialize(serverScope);
  const clientScope = fork({ values });
  wipeGlobalCache(model);
  return clientScope;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("SSR effects: deleteFx", () => {
  it("removes a hydrated instance from the scope's $ids", async () => {
    const model = todoModel("ssr-delete-1");
    const clientScope = await ssrHydrate(model, [
      { id: 1, title: "First" },
      { id: 2, title: "Second" },
      { id: 3, title: "Third" },
    ]);

    expect(clientScope.getState(model.$ids)).toHaveLength(3);

    await allSettled(model.deleteFx, { scope: clientScope, params: "2" });

    const remaining = clientScope.getState(model.$ids).map(String);
    expect(remaining).toEqual(["1", "3"]);
  });

  it("does not affect other scopes", async () => {
    const model = todoModel("ssr-delete-3");

    const scopeA = await ssrHydrate(model, [
      { id: 1, title: "A1" },
      { id: 2, title: "A2" },
    ]);
    const scopeB = await ssrHydrate(model, [
      { id: 1, title: "B1" },
      { id: 2, title: "B2" },
    ]);

    await allSettled(model.deleteFx, { scope: scopeA, params: "1" });

    expect(scopeA.getState(model.$ids).map(String).sort()).toEqual(["2"]);
    expect(scopeB.getState(model.$ids).map(String).sort()).toEqual(["1", "2"]);
  });

  it("is a no-op for unknown ids", async () => {
    const model = todoModel("ssr-delete-4");
    const clientScope = await ssrHydrate(model, [{ id: 1, title: "X" }]);

    await allSettled(model.deleteFx, { scope: clientScope, params: "999" });

    expect(clientScope.getState(model.$ids).map(String)).toEqual(["1"]);
  });

  it("removes multiple hydrated instances in sequence", async () => {
    const model = todoModel("ssr-delete-5");
    const clientScope = await ssrHydrate(model, [
      { id: 1, title: "A" },
      { id: 2, title: "B" },
      { id: 3, title: "C" },
      { id: 4, title: "D" },
      { id: 5, title: "E" },
    ]);

    await allSettled(model.deleteFx, { scope: clientScope, params: "2" });
    await allSettled(model.deleteFx, { scope: clientScope, params: "4" });
    await allSettled(model.deleteFx, { scope: clientScope, params: "1" });

    expect(clientScope.getState(model.$ids).map(String).sort()).toEqual(["3", "5"]);
  });
});

describe("SSR effects: updateFx", () => {
  it("updates a hydrated instance's field", async () => {
    const model = todoModel("ssr-update-1");
    const clientScope = await ssrHydrate(model, [
      { id: 1, title: "Original", done: false },
    ]);

    await allSettled(model.updateFx, {
      scope: clientScope,
      params: { id: "1", data: { done: true, title: "Updated" } },
    });

    // After update, the scope's $ids should still contain the id
    expect(clientScope.getState(model.$ids).map(String)).toEqual(["1"]);
    // The scope's instance store reflects the new field values via field proxies
    // that read from the SCOPED $dataMap. We use scope.getState on the field stores.
    const inst = model.getSync("1", clientScope);
    expect(inst).not.toBeNull();
    expect(clientScope.getState(inst!.$title)).toBe("Updated");
    expect(clientScope.getState(inst!.$done)).toBe(true);
  });

  it("does not leak update across scopes", async () => {
    const model = todoModel("ssr-update-2");
    const scopeA = await ssrHydrate(model, [{ id: 1, title: "A", done: false }]);
    const scopeB = await ssrHydrate(model, [{ id: 1, title: "B", done: false }]);

    await allSettled(model.updateFx, {
      scope: scopeA,
      params: { id: "1", data: { done: true } },
    });

    const instA = model.getSync("1", scopeA);
    const instB = model.getSync("1", scopeB);
    expect(instA).not.toBeNull();
    expect(instB).not.toBeNull();
    expect(scopeA.getState(instA!.$done)).toBe(true);
    expect(scopeB.getState(instB!.$done)).toBe(false);
    expect(scopeB.getState(instB!.$title)).toBe("B");
  });
});

describe("SSR effects: clearFx", () => {
  it("clears all hydrated instances in the scope", async () => {
    const model = todoModel("ssr-clear-1");
    const clientScope = await ssrHydrate(model, [
      { id: 1, title: "A" },
      { id: 2, title: "B" },
      { id: 3, title: "C" },
    ]);

    await allSettled(model.clearFx, { scope: clientScope });

    expect(clientScope.getState(model.$ids)).toHaveLength(0);
  });

  it("does not affect other scopes", async () => {
    const model = todoModel("ssr-clear-2");
    const scopeA = await ssrHydrate(model, [{ id: 1, title: "A" }]);
    const scopeB = await ssrHydrate(model, [{ id: 1, title: "B" }]);

    await allSettled(model.clearFx, { scope: scopeA });

    expect(scopeA.getState(model.$ids)).toHaveLength(0);
    expect(scopeB.getState(model.$ids)).toHaveLength(1);
  });
});

describe("SSR effects: createFx after hydration", () => {
  it("creates a new instance into a hydrated scope without losing existing ones", async () => {
    const model = todoModel("ssr-create-1");
    const clientScope = await ssrHydrate(model, [{ id: 1, title: "Existing" }]);

    await allSettled(model.createFx, {
      scope: clientScope,
      params: { id: 2, title: "New" },
    });

    const ids = clientScope.getState(model.$ids).map(String).sort();
    expect(ids).toEqual(["1", "2"]);
  });
});
