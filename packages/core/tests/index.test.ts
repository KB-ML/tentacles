import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

describe("@kbml-tentacles/core", () => {
  it("creates contract fields", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("time", (s) => s<number>())
      .event("start", (e) => e<void>())
      .pk("id");

    expect(contract.getContract()).toBeDefined();
  });
});

describe("Model: basic creation", () => {
  it("returns stores and events matching the contract", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id", "count");

    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({ id: "basic-1", count: 0 });

    expect(instance).toHaveProperty("$count");
    expect(instance).toHaveProperty("increment");
    expect(instance.$count.getState()).toBe(0);
  });

  it("replaces instance when same id is created with new data", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    const first = model.create({ id: "cache-1", value: "hello" });
    const second = model.create({ id: "cache-1", value: "world" });

    expect(first).not.toBe(second);
    expect(second.$value.getState()).toBe("world");
  });

  it("creates separate units for different ids", () => {
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

    const a = model.create({ id: "sep-a", count: 0 });
    const b = model.create({ id: "sep-b", count: 10 });

    a.increment();
    a.increment();

    expect(a.$count.getState()).toBe(2);
    expect(b.$count.getState()).toBe(10);
  });
});

describe("Model: fork isolation", () => {
  it("isolates state between two fork scopes", async () => {
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

    const instance = model.create({
      id: "iso-1",
      count: 0,
    });

    const scopeA = fork();
    const scopeB = fork();

    await allSettled(instance.increment, { scope: scopeA });
    await allSettled(instance.increment, { scope: scopeA });
    await allSettled(instance.increment, { scope: scopeA });

    expect(scopeA.getState(instance.$count)).toBe(3);
    expect(scopeB.getState(instance.$count)).toBe(0);
    expect(instance.$count.getState()).toBe(0);
  });

  it("does not leak events between scopes", async () => {
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

    const instance = model.create({
      id: "leak-1",
      count: 100,
    });

    const scopeA = fork();
    const scopeB = fork();

    await allSettled(instance.increment, { scope: scopeA });
    await allSettled(instance.increment, { scope: scopeB });
    await allSettled(instance.increment, { scope: scopeB });

    expect(scopeA.getState(instance.$count)).toBe(101);
    expect(scopeB.getState(instance.$count)).toBe(102);
  });
});

describe("Model: serialize / hydrate (SSR flow)", () => {
  it("serializes scope state and hydrates on client via fork({values})", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      name: "ssrBasic",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({
      id: "ssr-1",
      count: 0,
    });

    const serverScope = fork();
    await allSettled(instance.increment, { scope: serverScope });
    await allSettled(instance.increment, { scope: serverScope });

    expect(serverScope.getState(instance.$count)).toBe(2);

    const values = serialize(serverScope);

    const clientScope = fork({ values });
    expect(clientScope.getState(instance.$count)).toBe(2);
  });

  it("preserves isolation after hydration", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      name: "ssrIso",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({
      id: "ssr-iso-1",
      count: 0,
    });

    const serverScope = fork();
    await allSettled(instance.increment, { scope: serverScope });
    await allSettled(instance.increment, { scope: serverScope });
    await allSettled(instance.increment, { scope: serverScope });

    const values = serialize(serverScope);

    const clientScope = fork({ values });
    expect(clientScope.getState(instance.$count)).toBe(3);

    await allSettled(instance.increment, { scope: clientScope });
    expect(clientScope.getState(instance.$count)).toBe(4);

    expect(serverScope.getState(instance.$count)).toBe(3);
    expect(instance.$count.getState()).toBe(0);
  });

  it("handles multiple model instances in a single scope", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .event("rename", (e) => e<string>())
      .pk("id");

    const model = createModel({
      contract,
      name: "ssrMulti",
      fn: ({ $name, rename }) => {
        $name.on(rename, (_, next) => next);
        return { $name, rename };
      },
    });

    const alice = model.create({ id: "user-alice", name: "Alice" });
    const bob = model.create({ id: "user-bob", name: "Bob" });

    const serverScope = fork();
    await allSettled(alice.rename, {
      scope: serverScope,
      params: "Alice Updated",
    });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    expect(clientScope.getState(alice.$name)).toBe("Alice Updated");
    expect(clientScope.getState(bob.$name)).toBe("Bob");
  });
});
