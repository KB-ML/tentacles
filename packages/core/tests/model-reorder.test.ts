import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

describe("model.reorder", () => {
  function setup() {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({ contract, name: "reorder-test" });
    return { model };
  }

  it("replaces $ids order without creating or destroying instances", () => {
    const { model } = setup();

    model.create({ id: "a", value: 1 });
    model.create({ id: "b", value: 2 });
    model.create({ id: "c", value: 3 });

    expect(model.$ids.getState()).toEqual(["a", "b", "c"]);

    model.reorder(["c", "a", "b"]);

    expect(model.$ids.getState()).toEqual(["c", "a", "b"]);
    expect(model.$count.getState()).toBe(3);

    // Instances still exist and have correct values
    expect(model.get("a")?.$value.getState()).toBe(1);
    expect(model.get("b")?.$value.getState()).toBe(2);
    expect(model.get("c")?.$value.getState()).toBe(3);
  });

  it("$instances reflects new order", () => {
    const { model } = setup();

    model.create({ id: "x", value: 10 });
    model.create({ id: "y", value: 20 });
    model.create({ id: "z", value: 30 });

    model.reorder(["z", "x", "y"]);

    const instances = model.$ids.getState().map((id) => model.get(id)!);
    expect(instances.map((i) => i.__id)).toEqual(["z", "x", "y"]);
    expect(instances.map((i) => i.$value.getState())).toEqual([30, 10, 20]);
  });

  it("SSR round-trip preserves reordered order", async () => {
    const { model } = setup();

    const scope = fork();

    await allSettled(model.createFx, { scope, params: { id: "a", value: 1 } });
    await allSettled(model.createFx, { scope, params: { id: "b", value: 2 } });
    await allSettled(model.createFx, { scope, params: { id: "c", value: 3 } });

    await allSettled(model.reorder, { scope, params: ["c", "b", "a"] });

    expect(scope.getState(model.$ids)).toEqual(["c", "b", "a"]);

    const serialized = serialize(scope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(model.$ids)).toEqual(["c", "b", "a"]);
  });

  it("no heap growth from repeated reorders", () => {
    const { model } = setup();

    model.create({ id: "a", value: 1 });
    model.create({ id: "b", value: 2 });
    model.create({ id: "c", value: 3 });

    // Warm up
    for (let i = 0; i < 100; i++) {
      model.reorder(i % 2 === 0 ? ["c", "b", "a"] : ["a", "b", "c"]);
    }

    global.gc?.();
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 5000; i++) {
      model.reorder(i % 2 === 0 ? ["c", "b", "a"] : ["a", "b", "c"]);
    }

    global.gc?.();
    global.gc?.();
    const heapAfter = process.memoryUsage().heapUsed;

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });

  it("reorder with subset of IDs replaces completely", () => {
    const { model } = setup();

    model.create({ id: "a", value: 1 });
    model.create({ id: "b", value: 2 });
    model.create({ id: "c", value: 3 });

    // Reorder is a full replacement — passing subset means only those are in $ids
    model.reorder(["b", "a"]);
    expect(model.$ids.getState()).toEqual(["b", "a"]);
  });

  it("works with scoped allSettled", async () => {
    const { model } = setup();

    const scope = fork();
    await allSettled(model.createFx, { scope, params: { id: "p", value: 1 } });
    await allSettled(model.createFx, { scope, params: { id: "q", value: 2 } });

    await allSettled(model.reorder, { scope, params: ["q", "p"] });

    expect(scope.getState(model.$ids)).toEqual(["q", "p"]);
    // Global state unchanged
    expect(model.$ids.getState()).toEqual([]);
  });
});
