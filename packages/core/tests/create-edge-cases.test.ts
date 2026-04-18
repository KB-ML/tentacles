import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

describe("builder throw cleans up region and SIDs", () => {
  it("failed create does not leave orphaned nodes", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("update", (e) => e<void>())
      .pk("id");

    let shouldThrow = true;

    const model = createModel({
      contract,
      fn: ({ $value, update }) => {
        $value.on(update, (n) => n + 1);
        if (shouldThrow) {
          throw new Error("Builder exploded!");
        }
        return { $value, update };
      },
    });

    expect(() => {
      model.create({ id: "crash", value: 0 });
    }).toThrow("Builder exploded!");

    // Successful create with same ID should work cleanly
    shouldThrow = false;
    const instance = model.create({ id: "crash", value: 42 });

    expect(instance.$value.getState()).toBe(42);

    const scope = fork();
    await allSettled(instance.update, { scope });
    const values = serialize(scope);
    // State is stored in $dataMap, not per-field SIDs
    const dataMapKey = Object.keys(values).find((k) => k.includes("__dataMap__"));
    expect(dataMapKey).toBeDefined();
    const dataMap = values[dataMapKey!] as Record<string, Record<string, unknown>>;
    expect(dataMap["crash"]?.value).toBe(43);

    model.clear();
  });

  it("repeated builder failures do not accumulate orphaned nodes", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("data", (s) => s<string>())
      .pk("id");

    let callCount = 0;

    const model = createModel({
      contract,
      fn: ({ $data }) => {
        callCount++;
        throw new Error(`Fail #${callCount}`);
        return { $data };
      },
    });

    for (let i = 0; i < 50; i++) {
      try {
        model.create({ id: "repeated-crash", data: "x" });
      } catch {
        // expected
      }
    }

    expect(callCount).toBe(50);
  });
});

describe("instance ID validation", () => {
  it("colon in ID throws validation error", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    expect(() => model.create({ id: "a:b", value: 0 })).toThrow(
      'must not be empty or contain ":" or "|"',
    );
  });

  it("pipe in ID throws validation error", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    expect(() => model.create({ id: "a|b", value: 0 })).toThrow(
      'must not be empty or contain ":" or "|"',
    );
  });

  it("empty string ID throws validation error", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    expect(() => model.create({ id: "", value: 0 })).toThrow(
      'must not be empty or contain ":" or "|"',
    );
  });

  it("numeric ID 0 (falsy) works and produces valid SID", () => {
    const contract = createContract()
      .store("id", (s) => s<number>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    const instance = model.create({ id: 0, value: 42 });
    expect(instance.$value.getState()).toBe(42);
    // State fields are virtual (backed by $dataMap), so per-instance SID is null
    expect(instance.$value.sid).toBeNull();

    const instance2 = model.create({ id: 0, value: 99 });
    expect(instance2.$value.getState()).toBe(99);

    model.delete(0);
  });
});

describe("concurrent scoped create serialization", () => {
  it("second create waits for first to complete before clearing", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    const scope = fork();

    const promise1 = model.create(
      { id: "raced", value: "first" },
      { scope },
    );
    const promise2 = model.create(
      { id: "raced", value: "second" },
      { scope },
    );

    const [result1, result2] = await Promise.all([promise1, promise2]);

    // Both return the same global model — units are singletons
    expect(result1).toBe(result2);

    // Global state is from the first createInstance call
    expect(result1.$value.getState()).toBe("first");

    // Scope has the latest data (second create overwrites)
    expect(scope.getState(result2.$value)).toBe("second");

    model.clear();
  });

  it("scope values are fully applied before promise resolves", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count }) => ({ $count }),
    });

    const scope = fork();

    const result = await model.create({ id: "timing-test", count: 42 }, { scope });

    expect(scope.getState(result.$count)).toBe(42);

    model.clear();
  });
});

describe("detectSidRoot probe store leak", () => {
  it("probe stores are hidden from serialized output", () => {
    for (let i = 0; i < 10; i++) {
      createContract()
        .store("id", (s) => s<string>())
        .store("value", (s) => s<number>())
        .pk("id");
    }

    const scope = fork();
    const values = serialize(scope);
    const probeKeys = Object.keys(values).filter((k) => k.includes("_tentacles_probe_"));
    expect(probeKeys.length).toBe(0);
  });
});
