import { allSettled, fork } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { gt } from "../layers/query";

function createUserModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("age", (s) => s<number>())
    .store("score", (s) => s<number>().default(0))
    .pk("id");
  return createModel({ contract });
}

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

// ─── default ───

describe("COLLECTION QUERY: updated event", () => {
  it("fires when a field on an in-result-set instance changes", () => {
    const model = createUserModel();
    const alice = model.create({ id: "1", name: "Alice", age: 40 });
    model.create({ id: "2", name: "Bob", age: 20 });

    const q = model.query().where("age", gt(30));
    q.$count.getState();

    const calls: Array<{ id: string; field: string; value: unknown }> = [];
    q.updated.watch((p) => calls.push(p));

    alice.$score.set(42);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: "1", field: "score", value: 42 });
  });

  it("does NOT fire for instances outside the filter", () => {
    const model = createUserModel();
    model.create({ id: "1", name: "Alice", age: 40 });
    const bob = model.create({ id: "2", name: "Bob", age: 20 });

    const q = model.query().where("age", gt(30));
    q.$count.getState();

    let fired = 0;
    q.updated.watch(() => fired++);

    bob.$score.set(99);
    expect(fired).toBe(0);
  });

  it("fires for updates on instances that become part of the set", () => {
    const model = createUserModel();
    const bob = model.create({ id: "2", name: "Bob", age: 20 });

    const q = model.query().where("age", gt(30));
    q.$count.getState();

    const seen: string[] = [];
    q.updated.watch((p) => seen.push(p.field));

    bob.$age.set(50); // Bob enters the set
    bob.$score.set(5); // Bob is in — must fire

    expect(seen).toContain("score");
  });
});

// ─── SSR ───

describe("COLLECTION QUERY SSR: updated event under fork", () => {
  it("fires when a scoped .set() updates an in-set instance", async () => {
    const model = createUserModel();
    const aliceGlobal = model.create({ id: "1", name: "Alice", age: 40 });
    model.create({ id: "2", name: "Bob", age: 20 });

    const q = model.query().where("age", gt(30));
    q.$count.getState();

    const scope = fork();
    await model.create({ id: "1", name: "Alice", age: 40 }, { scope });
    await model.create({ id: "2", name: "Bob", age: 20 }, { scope });
    scope.getState(q.$count);

    const calls: Array<{ id: string; field: string; value: unknown }> = [];
    q.updated.watch((p) => calls.push(p));

    await allSettled(aliceGlobal.$score.set, { scope, params: 99 });

    expect(calls.some((c) => c.id === "1" && c.field === "score" && c.value === 99)).toBe(true);
  });
});

// ─── memory ───

describe("COLLECTION QUERY: updated event memory", () => {
  it("bounded heap growth on repeated updates with active listener", () => {
    const model = createUserModel();
    const inst = model.create({ id: "x", name: "X", age: 50 });
    const q = model.query().where("age", gt(30));
    q.$count.getState();
    q.updated.watch(() => {});

    // warmup
    for (let i = 0; i < 200; i++) inst.$score.set(i);

    const before = measureHeap();
    for (let i = 0; i < 5_000; i++) inst.$score.set(i);
    const after = measureHeap();

    const growthMB = (after - before) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});
