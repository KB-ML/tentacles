import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createContract, createModel } from "../index";
import {
  allSettled,
  fork,
  serialize,
  type StoreWritable,
  type EventCallable,
} from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC SID TESTS (babel/swc plugin integration)
//
// Validates that effector's babel/swc plugin (which wraps createContract calls
// with withFactory) provides deterministic SIDs that eliminate the need for
// explicit `name` parameter in createModel().
//
// The babel plugin wraps only createContract() — chain methods, createModel(),
// and model.create() run outside withFactory. The captured sidRoot must
// propagate to ALL model-level and instance-level effector units.
// ─────────────────────────────────────────────────────────────────────────────

type CounterInstance = {
  $id: StoreWritable<string>;
  $count: StoreWritable<number>;
  increment: EventCallable<void>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulates what the babel/swc plugin does: wraps only createContract()
 * inside withFactory. Chain methods, createModel, model.create run outside.
 */
function createBabelSimulatedContract(
  withFactory: (config: { sid: string; fn: () => unknown }) => unknown,
  factorySid: string,
) {
  // Babel plugin wraps only the createContract() call
  const chain = withFactory({
    sid: factorySid,
    fn: () => createContract(),
  }) as ReturnType<typeof createContract>;

  // Chain methods run OUTSIDE withFactory (this is what babel produces)
  return chain
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("increment", (e) => e<void>())
    .pk("id");
}

function createBabelSimulatedModel(
  withFactory: (config: { sid: string; fn: () => unknown }) => unknown,
  factorySid: string,
) {
  const contract = createBabelSimulatedContract(withFactory, factorySid);
  // createModel runs OUTSIDE withFactory
  return createModel({
    contract,
    fn: ({ $count, increment }) => {
      $count.on(increment, (n) => n + 1);
      return { $count, increment };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("SID: deterministic babel/swc SIDs replace model name", () => {
  let withFactory: ((config: { sid: string; fn: () => unknown }) => unknown) | undefined;

  beforeEach(async () => {
    try {
      const effector = await import("effector");
      withFactory = (effector as Record<string, unknown>).withFactory as typeof withFactory;
    } catch {
      withFactory = undefined;
    }
  });

  // ─── Default tests ─────────────────────────────────────────────────────────

  describe("instance-level SIDs", () => {
    it("per-instance event prepends have null SID even with withFactory", () => {
      if (!withFactory) return;

      const model = createBabelSimulatedModel(withFactory, "hash_file_a");
      const instance = model.create({ id: "inst-1", count: 0 }) as CounterInstance;

      // Per-instance events are prepends on model-level events — prepends have no SID
      expect(instance.increment.sid).toBeNull();
    });

    it("per-instance event prepends all have null SID regardless of factory", () => {
      if (!withFactory) return;

      const modelA = createBabelSimulatedModel(withFactory, "hash_file_a");
      const modelB = createBabelSimulatedModel(withFactory, "hash_file_b");

      const instA = modelA.create({ id: "shared", count: 0 }) as CounterInstance;
      const instB = modelB.create({ id: "shared", count: 0 }) as CounterInstance;

      // Per-instance events are prepends — both have null SID
      expect(instA.increment.sid).toBeNull();
      expect(instB.increment.sid).toBeNull();
    });
  });

  describe("model-level SIDs", () => {
    it("$ids store gets sidRoot prefix", () => {
      if (!withFactory) return;

      const model = createBabelSimulatedModel(withFactory, "hash_reg");

      expect(model.$ids.sid).toBe("hash_reg|tentacles:unnamed:__registry__:ids");
    });

    it("two unnamed models from different factories have unique $ids SIDs", () => {
      if (!withFactory) return;

      const modelA = createBabelSimulatedModel(withFactory, "site_alpha");
      const modelB = createBabelSimulatedModel(withFactory, "site_beta");

      expect(modelA.$ids.sid).not.toBe(modelB.$ids.sid);
      expect(modelA.$ids.sid).toContain("site_alpha");
      expect(modelB.$ids.sid).toContain("site_beta");
    });
  });

  describe("no duplicate SID warnings", () => {
    it("two unnamed models from different factories produce no warnings", () => {
      if (!withFactory) return;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelA = createBabelSimulatedModel(withFactory, "warn_site_a");
      const modelB = createBabelSimulatedModel(withFactory, "warn_site_b");

      // Create instances with SAME IDs — should be fine because sidRoots differ
      modelA.create({ id: "shared-id", count: 0 });
      modelB.create({ id: "shared-id", count: 0 });

      const dupWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && (call[0] as string).includes("Duplicate SID"),
      );
      expect(dupWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  // ─── SSR tests ─────────────────────────────────────────────────────────────

  describe("SSR serialize/hydrate", () => {
    it("two unnamed models from different factories hydrate independently", async () => {
      if (!withFactory) return;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelA = createBabelSimulatedModel(withFactory, "ssr_file_a");
      const modelB = createBabelSimulatedModel(withFactory, "ssr_file_b");

      const instA = modelA.create({ id: "inst-1", count: 0 }) as CounterInstance;
      const instB = modelB.create({ id: "inst-1", count: 0 }) as CounterInstance;

      const serverScope = fork();

      // Increment A once, B three times — different counts
      await allSettled(instA.increment, { scope: serverScope });
      await allSettled(instB.increment, { scope: serverScope });
      await allSettled(instB.increment, { scope: serverScope });
      await allSettled(instB.increment, { scope: serverScope });

      const values = serialize(serverScope);

      // Hydrate on "client"
      const clientScope = fork({ values });

      // Each model's count should be independent
      expect(clientScope.getState(instA.$count)).toBe(1);
      expect(clientScope.getState(instB.$count)).toBe(3);

      warnSpy.mockRestore();
    });

    it("$ids are serialized independently per model", async () => {
      if (!withFactory) return;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const modelA = createBabelSimulatedModel(withFactory, "ids_ssr_a");
      const modelB = createBabelSimulatedModel(withFactory, "ids_ssr_b");

      // Create instances in a server scope (SSR pattern)
      const serverScope = fork();
      await modelA.create({ id: "a1", count: 0 }, { scope: serverScope });
      await modelA.create({ id: "a2", count: 0 }, { scope: serverScope });
      await modelB.create({ id: "b1", count: 0 }, { scope: serverScope });

      const values = serialize(serverScope);

      // $ids stores should have separate serialized keys (prefixed with sidRoot)
      const keysA = Object.keys(values).filter((k) => k.includes("ids_ssr_a"));
      const keysB = Object.keys(values).filter((k) => k.includes("ids_ssr_b"));

      expect(keysA.length).toBeGreaterThan(0);
      expect(keysB.length).toBeGreaterThan(0);

      // Hydrate on client and verify $ids are independent
      const clientScope = fork({ values });
      expect(clientScope.getState(modelA.$ids)).toEqual(["a1", "a2"]);
      expect(clientScope.getState(modelB.$ids)).toEqual(["b1"]);

      warnSpy.mockRestore();
    });

    it("named model determinism still works with babel plugin", async () => {
      if (!withFactory) return;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Server side
      const serverChain = withFactory({
        sid: "stable_hash",
        fn: () => createContract(),
      }) as ReturnType<typeof createContract>;
      const serverContract = serverChain
        .store("id", (s) => s<string>())
        .store("count", (s) => s<number>())
        .event("increment", (e) => e<void>())
        .pk("id");
      const serverModel = createModel({
        contract: serverContract,
        fn: ({ $count, increment }) => {
          $count.on(increment, (n) => n + 1);
          return { $count, increment };
        },
      });

      const serverInst = serverModel.create({ id: "page-1", count: 0 }) as CounterInstance;
      const serverScope = fork();
      await allSettled(serverInst.increment, { scope: serverScope });
      const values = serialize(serverScope);

      // Client side (same factory hash = same babel call site)
      const clientChain = withFactory({
        sid: "stable_hash",
        fn: () => createContract(),
      }) as ReturnType<typeof createContract>;
      const clientContract = clientChain
        .store("id", (s) => s<string>())
        .store("count", (s) => s<number>())
        .event("increment", (e) => e<void>())
        .pk("id");
      const clientModel = createModel({
        contract: clientContract,
        fn: ({ $count, increment }) => {
          $count.on(increment, (n) => n + 1);
          return { $count, increment };
        },
      });

      const clientInst = clientModel.create({ id: "page-1", count: 0 }) as CounterInstance;
      const clientScope = fork({ values });

      expect(clientScope.getState(clientInst.$count)).toBe(1);

      warnSpy.mockRestore();
    });
  });

  // ─── Memory leak tests ─────────────────────────────────────────────────────

  describe("memory leak", () => {
    it("instances from babel-simulated models can be deleted cleanly", () => {
      if (!withFactory) return;

      const model = createBabelSimulatedModel(withFactory, "gc_hash");

      for (let i = 0; i < 50; i++) {
        model.create({ id: `gc-${i}`, count: i });
      }
      expect(model.$ids.getState()).toHaveLength(50);

      for (let i = 0; i < 50; i++) {
        model.delete(`gc-${i}`);
      }
      expect(model.$ids.getState()).toHaveLength(0);
    });

    it("no duplicate SID warnings after delete + re-create cycle", () => {
      if (!withFactory) return;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const model = createBabelSimulatedModel(withFactory, "cycle_hash");

      model.create({ id: "cycle-1", count: 0 });
      model.delete("cycle-1");
      model.create({ id: "cycle-1", count: 10 });

      const dupWarnings = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && (call[0] as string).includes("Duplicate SID"),
      );
      expect(dupWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });
});
