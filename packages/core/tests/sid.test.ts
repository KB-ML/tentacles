import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { createContract, createModel } from "../index";
import {
  allSettled,
  fork,
  serialize,
  type StoreWritable,
  type EventCallable,
} from "effector";

type CounterInstance = {
  $count: StoreWritable<number>;
  increment: EventCallable<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// SID TESTS
//
// With virtual stores backed by $dataMap:
// - State fields are derived from $dataMap via .map() — they have NO per-instance SID
// - Event fields are prepends on model-level events — prepends have NO SID
// - Model-level events have SIDs: tentacles:{name}:__modelEvent__:{field}
// - $dataMap has a model-level SID: tentacles:{name}:__dataMap__
// - Serialization works via $dataMap SID, not per-field SIDs
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCounterContract() {
  return createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("increment", (e) => e<void>())
    .pk("id");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NAMED MODEL SIDs
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: named models", () => {
  it("per-instance event fields (prepends) have no SID", () => {
    const contract = makeCounterContract();
    const model = createModel({
      contract,
      name: "myCounter",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({ id: "inst-1", count: 0 });

    // Event fields are prepends on model-level events — prepends have no SID
    expect(instance.increment.sid).toBeNull();
    // State fields are virtual stores backed by $dataMap — no per-instance SID
    expect(instance.$count.sid).toBeNull();
  });

  it("per-instance event prepends have null SID regardless of model name", () => {
    const contractA = makeCounterContract();
    const contractB = makeCounterContract();

    const modelA = createModel({
      contract: contractA,
      name: "alpha",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const modelB = createModel({
      contract: contractB,
      name: "beta",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instA = modelA.create({ id: "shared-id", count: 0 });
    const instB = modelB.create({ id: "shared-id", count: 0 });

    // Per-instance events are prepends — they have no SID
    expect(instA.increment.sid).toBeNull();
    expect(instB.increment.sid).toBeNull();
  });

  it("per-instance event prepends have null SID, state fields also null", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .event("update", (e) => e<string>())
      .pk("id");

    const model = createModel({
      contract,
      name: "userCard",
      fn: ({ $value, update }) => {
        $value.on(update, (_, v) => v);
        return { $value, update };
      },
    });

    const instance = model.create({ id: "card-1", value: "hello" });

    // State fields: no per-instance SID (virtual store backed by $dataMap)
    expect(instance.$value.sid).toBeNull();
    // Event fields: prepends on model-level events — no per-instance SID
    expect(instance.update.sid).toBeNull();
  });

  it("per-instance event prepends always have null SID regardless of creation order", () => {
    const contractA1 = makeCounterContract();
    const modelA1 = createModel({
      contract: contractA1,
      name: "stableA",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const contractB1 = makeCounterContract();
    const modelB1 = createModel({
      contract: contractB1,
      name: "stableB",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instA1 = modelA1.create({ id: "x", count: 0 });
    const instB1 = modelB1.create({ id: "x", count: 0 });

    // Per-instance events are prepends — no SID
    expect(instA1.increment.sid).toBeNull();
    expect(instB1.increment.sid).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNNAMED MODEL SIDs
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: unnamed models", () => {
  it("per-instance event prepends have null SID even without model name", () => {
    const contract = makeCounterContract();
    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({ id: "anon-1", count: 0 });

    // Event fields are prepends — no SID regardless of model name
    expect(instance.increment.sid).toBeNull();
    // State field: no per-instance SID
    expect(instance.$count.sid).toBeNull();
  });

  it("per-instance event prepends all have null SID (no collision possible)", () => {
    const contractA = makeCounterContract();
    const contractB = makeCounterContract();

    const modelA = createModel({
      contract: contractA,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const modelB = createModel({
      contract: contractB,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instA = modelA.create({ id: "a", count: 0 });
    const instB = modelB.create({ id: "b", count: 0 });

    // Per-instance events are prepends — all have null SID
    expect(instA.increment.sid).toBeNull();
    expect(instB.increment.sid).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DUPLICATE SID WARNING
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: duplicate detection", () => {
  let warnSpy: MockInstance;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("does NOT warn when two unnamed models create instances with the same id (prepends have no SID)", () => {
    const contractA = makeCounterContract();
    const contractB = makeCounterContract();

    const modelA = createModel({
      contract: contractA,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const modelB = createModel({
      contract: contractB,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    // First model creates instance — no warning
    modelA.create({ id: "collision", count: 0 });
    expect(warnSpy).not.toHaveBeenCalled();

    // Per-instance events are prepends (no SID) — no SID collision possible
    modelB.create({ id: "collision", count: 0 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn when named models use the same instance id", () => {
    const contractA = makeCounterContract();
    const contractB = makeCounterContract();

    const modelA = createModel({
      contract: contractA,
      name: "namedA",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const modelB = createModel({
      contract: contractB,
      name: "namedB",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    modelA.create({ id: "same-id", count: 0 });
    modelB.create({ id: "same-id", count: 0 });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn after delete + re-create with same id", () => {
    const contract = makeCounterContract();
    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    model.create({ id: "ephemeral", count: 0 });
    model.delete("ephemeral");

    // Re-create — SID was cleaned up, should not warn
    model.create({ id: "ephemeral", count: 0 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn when same model re-creates instance (replaces)", () => {
    const contract = makeCounterContract();
    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    model.create({ id: "reuse", count: 0 });

    // Re-create with same id on same model — clearInstance removes old SIDs
    model.create({ id: "reuse", count: 10 });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. NAMED MODEL SSR SERIALIZE/HYDRATE
//
// With virtual stores, serialization works through $dataMap:
// - $dataMap SID: tentacles:{name}:__dataMap__
// - Serialized value: { instanceId: { field: value, ... }, ... }
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: named model SSR", () => {
  it("serialize/hydrate works with named models via $dataMap", async () => {
    const contract = makeCounterContract();
    const model = createModel({
      contract,
      name: "ssrCounter",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({ id: "ssr-1", count: 0 });

    const serverScope = fork();
    await allSettled(instance.increment, { scope: serverScope });
    await allSettled(instance.increment, { scope: serverScope });

    const values = serialize(serverScope);

    // Serialized key is $dataMap SID (model-level, not per-field)
    const dataMap = values["tentacles:ssrCounter:__dataMap__"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(dataMap).toBeDefined();
    expect(dataMap["ssr-1"]?.count).toBe(2);

    const clientScope = fork({ values });
    expect(clientScope.getState(instance.$count)).toBe(2);
  });

  it("named models produce stable SIDs across simulated server/client", async () => {
    // Suppress expected duplicate warnings — server/client intentionally share SIDs
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate server
    const serverContract = makeCounterContract();
    const serverModel = createModel({
      contract: serverContract,
      name: "stableSSR",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const serverInstance = serverModel.create({ id: "page-1", count: 0 });

    const serverScope = fork();
    await allSettled(serverInstance.increment, { scope: serverScope });
    const values = serialize(serverScope);

    // Simulate client (re-creates same model with same name)
    const clientContract = makeCounterContract();
    const clientModel = createModel({
      contract: clientContract,
      name: "stableSSR",
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const clientInstance = clientModel.create({ id: "page-1", count: 0 });

    // Per-instance events are prepends — both have null SID
    expect(clientInstance.increment.sid).toBeNull();
    expect(serverInstance.increment.sid).toBeNull();

    const clientScope = fork({ values });
    expect(clientScope.getState(clientInstance.$count)).toBe(1);

    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GENERIC CONTRACTS WITH NAMED MODELS
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: named models with concrete types", () => {
  it("model accepts name as first argument", async () => {
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .store("items", (s) => s<string[]>())
      .event("add", (e) => e<string>())
      .pk("id");

    const stringList = createModel({
      contract: listContract,
      name: "stringList",
      fn: ({ $items, add }) => {
        $items.on(add, (list, item) => [...list, item]);
        return { $items, add };
      },
    });

    const instance = stringList.create({ id: "list-1", items: [] });
    // Event fields are prepends — no per-instance SID
    expect(instance.add.sid).toBeNull();
    // State field: no per-instance SID (virtual store)
    expect(instance.$items.sid).toBeNull();

    const scope = fork();
    await allSettled(instance.add, { scope, params: "hello" });
    const values = serialize(scope);

    // Data is in $dataMap, keyed by model-level SID
    const dataMap = values["tentacles:stringList:__dataMap__"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(dataMap).toBeDefined();
    expect(dataMap["list-1"]?.items).toEqual(["hello"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. BABEL/SWC PLUGIN COMPATIBILITY (withFactory)
//
// effector's babel/swc plugin wraps factory calls with withFactory().
// withFactory sets a global sidRoot that gets prepended to all SIDs
// created inside the factory call. With virtual stores, only event fields
// and $dataMap get withFactory-prefixed SIDs.
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: babel/swc plugin compatibility (withFactory)", () => {
  // withFactory is exported from effector runtime but not from types
  let withFactory: ((config: { sid: string; fn: () => unknown }) => unknown) | undefined;

  beforeEach(async () => {
    try {
      const effector = await import("effector");
      withFactory = (effector as Record<string, unknown>).withFactory as typeof withFactory;
    } catch {
      withFactory = undefined;
    }
  });

  it("withFactory is available in effector runtime", () => {
    expect(withFactory).toBeDefined();
    expect(typeof withFactory).toBe("function");
  });

  it("withFactory prepends sidRoot to event SIDs", () => {
    if (!withFactory) {
      console.warn("withFactory not available, skipping");
      return;
    }

    const instance = withFactory({
      sid: "abc123",
      fn: () => {
        const contract = makeCounterContract();
        const model = createModel({
          contract,
          name: "counter",
          fn: ({ $count, increment }) => {
            $count.on(increment, (n) => n + 1);
            return { $count, increment };
          },
        });
        return model.create({ id: "wf-1", count: 0 });
      },
    }) as CounterInstance;

    // Per-instance events are prepends — no SID even with withFactory
    expect(instance.increment.sid).toBeNull();
    // State fields: no per-instance SID
    expect(instance.$count.sid).toBeNull();
  });

  it("withFactory makes unnamed models unique by call site for events", () => {
    if (!withFactory) {
      console.warn("withFactory not available, skipping");
      return;
    }

    const instA = withFactory({
      sid: "callsite_a",
      fn: () => {
        const contract = makeCounterContract();
        const model = createModel({
          contract,
          fn: ({ $count, increment }) => {
            $count.on(increment, (n) => n + 1);
            return { $count, increment };
          },
        });
        return model.create({ id: "x", count: 0 });
      },
    }) as CounterInstance;

    const instB = withFactory({
      sid: "callsite_b",
      fn: () => {
        const contract = makeCounterContract();
        const model = createModel({
          contract,
          fn: ({ $count, increment }) => {
            $count.on(increment, (n) => n + 1);
            return { $count, increment };
          },
        });
        return model.create({ id: "x", count: 0 });
      },
    }) as CounterInstance;

    // Per-instance events are prepends — both have null SID regardless of withFactory prefix
    expect(instA.increment.sid).toBeNull();
    expect(instB.increment.sid).toBeNull();
  });

  it("withFactory + named model serialize/hydrate works", async () => {
    if (!withFactory) {
      console.warn("withFactory not available, skipping");
      return;
    }

    function createCounter() {
      const contract = makeCounterContract();
      const model = createModel({
        contract,
        name: "counter",
        fn: ({ $count, increment }) => {
          $count.on(increment, (n) => n + 1);
          return { $count, increment };
        },
      });
      return model.create({ id: "hydrate-1", count: 0 });
    }

    const instance = withFactory({
      sid: "plugin_hash_123",
      fn: createCounter,
    }) as CounterInstance;

    const serverScope = fork();
    await allSettled(instance.increment, { scope: serverScope });
    await allSettled(instance.increment, { scope: serverScope });
    await allSettled(instance.increment, { scope: serverScope });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    expect(clientScope.getState(instance.$count)).toBe(3);
  });

  it("withFactory + named model: same factory sid = same event SIDs (deterministic)", () => {
    if (!withFactory) {
      console.warn("withFactory not available, skipping");
      return;
    }

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const factorySid = "stable_hash_from_source_location";

    function createCounter() {
      const contract = makeCounterContract();
      const model = createModel({
        contract,
        name: "counter",
        fn: ({ $count, increment }) => {
          $count.on(increment, (n) => n + 1);
          return { $count, increment };
        },
      });
      return model.create({ id: "page", count: 0 });
    }

    const serverInst = withFactory({
      sid: factorySid,
      fn: createCounter,
    }) as CounterInstance;

    const clientInst = withFactory({
      sid: factorySid,
      fn: createCounter,
    }) as CounterInstance;

    // Per-instance events are prepends — both have null SID
    expect(serverInst.increment.sid).toBeNull();
    expect(clientInst.increment.sid).toBeNull();

    warnSpy.mockRestore();
  });
});
