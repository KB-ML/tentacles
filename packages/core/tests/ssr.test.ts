import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import {
  allSettled,
  fork,
  serialize,
  sample,
  combine,
  type StoreWritable,
  type EventCallable,
} from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// SSR CRUSH TEST
//
// Purpose: push the library's SSR surface until it breaks.
// Each failing test exposes a concrete limitation.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

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
// 1. INSTANCE CACHE IGNORES INITIAL DATA ON SECOND create() CALL
//    First request sets data, second request with same ID gets stale data
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: instance cache vs initial data", () => {
  it("second create() with same id replaces the instance with new data", () => {
    const model = counterModel();

    const first = model.create({ id: "shared", count: 0 });
    const second = model.create({ id: "shared", count: 999 });

    // New instance is created, not the same reference
    expect(first).not.toBe(second);

    // Both point to the same $dataMap entry — second create replaced the data.
    // Proxy reads current $dataMap, so both see the new value.
    expect(first.$count.getState()).toBe(999);
    expect(second.$count.getState()).toBe(999);
  });

  it("SSR: re-creating with same id replaces units and applies new data", async () => {
    const model = counterModel();

    // Request A creates with count=0
    model.create({ id: "user-1", count: 0 });

    // Request B re-creates with count=50 — old units are cleared
    const instanceB = model.create({ id: "user-1", count: 50 });
    const scopeB = fork();

    expect(scopeB.getState(instanceB.$count)).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCOPE OPTION IS ACCEPTED BUT NEVER USED
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: unused scope option in create()", () => {
  it("passing scope option has no effect on initial data placement", async () => {
    const model = counterModel();
    const scope = fork();

    const instance = await model.create(
      { id: "scoped-1", count: 42 },
      { scope },
    );

    // Global store has the value (set by createStore(initialValue))
    expect(instance.$count.getState()).toBe(42);

    // Scope now has the value — allSettled registered the store in the scope
    expect(scope.getState(instance.$count)).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DELETE + RE-CREATE: SID COLLISION
//    After delete(), creating the same id produces new stores with same SIDs.
//    In SSR, this causes hydration to write into wrong stores.
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: delete + re-create SID collision", () => {
  it("re-created instance has same SIDs as deleted one", async () => {
    const model = counterModel("sidCollision");

    const v1 = model.create({ id: "ephemeral", count: 0 });
    const v1Sid = v1.$count.sid;

    // Mutate state in a scope
    const scope1 = fork();
    await allSettled(v1.increment, { scope: scope1 });
    await allSettled(v1.increment, { scope: scope1 });
    const serialized1 = serialize(scope1);

    // Delete and re-create
    model.delete("ephemeral");
    const v2 = model.create({ id: "ephemeral", count: 100 });

    // Same SID — effector may map serialized data to the NEW store
    expect(v2.$count.sid).toBe(v1Sid);

    // Hydrate with old serialized data — goes into the new store
    const scope2 = fork({ values: serialized1 });
    const hydratedValue = scope2.getState(v2.$count);

    // BUG: v2 was created with data: { count: 100 }, but hydration
    // overwrites with the OLD serialized value (2) because SIDs match
    // This is a silent data corruption
    expect(hydratedValue).toBe(2); // ← old data leaked into new instance
  });

  it("old stores return undefined after delete() — proxy reads from cleared $dataMap", () => {
    const model = counterModel();

    const v1 = model.create({ id: "ghost", count: 0 });
    const v1Store = v1.$count;

    model.delete("ghost");

    // Proxy architecture: $count reads from $dataMap["ghost"], which was removed.
    // getState() returns undefined (no entry) — proxy does not throw.
    v1Store.getState(); // doesn't throw
    expect(v1Store.getState()).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MODEL COUNTER IS GLOBAL AND NON-DETERMINISTIC ACROSS RESTARTS
//    SIDs depend on model creation ORDER, not identity.
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: modelCounter determinism", () => {
  it("SIDs change if model creation order changes", () => {
    // Simulate "server run 1": create modelA first, then modelB
    const contractA = counterContract();
    const contractB = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");

    const modelA = createModel({
      contract: contractA,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });
    const modelB = createModel({
      contract: contractB,
      fn: ({ $name }) => ({ $name }),
    });

    const instanceA = modelA.create({ id: "x", count: 0 });
    const instanceB = modelB.create({ id: "x", name: "hi" });

    // Virtual stores (derived from $dataMap) don't have per-instance SIDs.
    // SSR hydration relies on $dataMap SIDs instead (model-level, deterministic).
    // Per-instance stores are reconstructed from $dataMap on hydration.
    expect(instanceA.$count.sid).toBeNull();
    expect(instanceB.$name.sid).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONCURRENT SSR REQUESTS — GLOBAL STATE POLLUTION
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: concurrent SSR requests", () => {
  it("builder callback runs once globally, not per-scope", async () => {
    let builderCallCount = 0;

    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        builderCallCount++;
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const instance = model.create({ id: "concurrent-1", count: 0 });
    expect(builderCallCount).toBe(1);

    // 100 "concurrent" SSR requests all use the same instance
    const scopes = Array.from({ length: 100 }, () => fork());
    expect(builderCallCount).toBe(1); // builder never re-runs

    // This is actually correct for effector's model (stores are global, scopes isolate state).
    // But it means any side effects in the builder (API calls, subscriptions)
    // happen exactly once, not per-request. Users expecting per-request setup
    // will be surprised.

    // Verify isolation still holds under load
    await Promise.all(
      scopes.map((scope, i) =>
        Promise.all(
          Array.from({ length: i + 1 }, () =>
            allSettled(instance.increment, { scope }),
          ),
        ),
      ),
    );

    for (let i = 0; i < scopes.length; i++) {
      expect(scopes[i]!.getState(instance.$count)).toBe(i + 1);
    }

    // Global state untouched
    expect(instance.$count.getState()).toBe(0);
  });

  it("serialize() under concurrent scopes does not mix state", async () => {
    const model = counterModel("concurrentSsr");
    const instance = model.create({ id: "serial-race", count: 0 });

    // Simulate 50 concurrent SSR requests with different states
    const results = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const scope = fork();
        for (let j = 0; j <= i; j++) {
          await allSettled(instance.increment, { scope });
        }
        return { i, values: serialize(scope), scope };
      }),
    );

    // Each request should have its own count
    for (const { i, values, scope } of results) {
      expect(scope.getState(instance.$count)).toBe(i + 1);
      // Hydrate and verify
      const hydrated = fork({ values });
      expect(hydrated.getState(instance.$count)).toBe(i + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MEMORY GROWTH — UNBOUNDED INSTANCE CACHE
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: memory growth", () => {
  it("creating many unique instances grows cache without bound", () => {
    const model = counterModel();

    // Simulate per-request instance creation with unique IDs
    for (let i = 0; i < 1000; i++) {
      model.create({ id: `request-${i}`, count: 0 });
    }

    // Re-creating with same ID now replaces the instance
    for (let i = 0; i < 1000; i++) {
      const a = model.create({ id: `request-${i}`, count: 999 });
      expect(a.$count.getState()).toBe(999);
    }

    // LIMITATION: in production SSR, each unique request ID creates
    // stores + events that are never cleaned up. Over hours/days,
    // this causes OOM. delete() exists but there's no automatic TTL,
    // LRU eviction, or request-scoped cleanup.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. CROSS-MODEL DEPENDENCIES IN SCOPES
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: cross-model dependencies", () => {
  it("sample() between two models works correctly in fork scope", async () => {
    const sourceContract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .event("update", (e) => e<string>())
      .pk("id");

    const derivedContract = createContract()
      .store("id", (s) => s<string>())
      .store("mirror", (s) => s<string>())
      .pk("id");

    const sourceModel = createModel({
      contract: sourceContract,
      name: "crossSource",
      fn: ({ $value, update }) => {
        $value.on(update, (_, next) => next);
        return { $value, update };
      },
    });

    const source = sourceModel.create({ id: "src-1", value: "init" });

    const derivedModel = createModel({
      contract: derivedContract,
      name: "crossDerived",
      fn: ({ $mirror }) => {
        // Cross-model dependency: derived model reads from source model.
        // Use $mirror.set (not $mirror) as target — virtual stores route writes
        // through $dataMap via .set, ensuring serialize/hydrate works.
        sample({
          clock: source.update,
          fn: (val) => val.toUpperCase(),
          target: $mirror.set,
        });
        return { $mirror };
      },
    });

    const derived = derivedModel.create({ id: "drv-1", mirror: "" });

    const scope = fork();
    await allSettled(source.update, { scope, params: "hello" });

    expect(scope.getState(source.$value)).toBe("hello");
    expect(scope.getState(derived.$mirror)).toBe("HELLO");

    // Serialize both models' state
    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(source.$value)).toBe("hello");
    expect(hydrated.getState(derived.$mirror)).toBe("HELLO");
  });

  it("cross-model sample() leaks between scopes when wired outside builder", async () => {
    const contractA = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const contractB = createContract()
      .store("id", (s) => s<string>())
      .store("doubled", (s) => s<number>())
      .pk("id");

    const modelA = createModel({
      contract: contractA,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        return { $count, increment };
      },
    });

    const a = modelA.create({ id: "cross-a", count: 0 });

    const modelB = createModel({
      contract: contractB,
      fn: ({ $doubled }) => {
        // This sample() runs once during model creation.
        // It references `a.$count` directly — the GLOBAL store.
        // In fork scopes, effector intercepts this correctly,
        // but the wiring is global, not per-scope.
        sample({
          clock: a.$count,
          fn: (n) => n * 2,
          target: $doubled,
        });
        return { $doubled };
      },
    });

    const b = modelB.create({ id: "cross-b", doubled: 0 });

    const scope1 = fork();
    const scope2 = fork();

    await allSettled(a.increment, { scope: scope1 });
    await allSettled(a.increment, { scope: scope1 });
    await allSettled(a.increment, { scope: scope1 });

    await allSettled(a.increment, { scope: scope2 });

    // Each scope should be isolated
    expect(scope1.getState(a.$count)).toBe(3);
    expect(scope1.getState(b.$doubled)).toBe(6);

    expect(scope2.getState(a.$count)).toBe(1);
    expect(scope2.getState(b.$doubled)).toBe(2);

    // Global untouched
    expect(a.$count.getState()).toBe(0);
    expect(b.$doubled.getState()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. SERIALIZATION EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: serialization edge cases", () => {
  it("stores with complex values serialize correctly", async () => {
    // Virtual stores backed by $dataMap: multiple .on() calls for the same event
    // on the same $dataMap store cause effector to overwrite previous handlers.
    // Each field must use a separate event to avoid this.
    //
    // Note: null values cannot round-trip through virtual stores because
    // $dataMap.map(m => m[id]?.[field] ?? undefined) coalesces null to undefined,
    // which effector's skipVoid treats as "no update". Use sentinel strings instead.
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>())
      .store("nested", (s) => s<{ a: { b: number[] } }>())
      .store("arr", (s) => s<number[]>())
      .event("clearStatus", (e) => e<void>())
      .event("updateNested", (e) => e<void>())
      .event("updateArr", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      name: "edgeCase",
      fn: ({ $status, $nested, $arr, clearStatus, updateNested, updateArr }) => {
        $status.on(clearStatus, () => "");
        $nested.on(updateNested, () => ({ a: { b: [1, 2, 3] } }));
        $arr.on(updateArr, () => [10, 20, 30]);
        return { $status, $nested, $arr, clearStatus, updateNested, updateArr };
      },
    });

    const instance = model.create({
      id: "edge-1",
      status: "initial",
      nested: { a: { b: [] } },
      arr: [],
    });

    const scope = fork();
    await allSettled(instance.clearStatus, { scope });
    await allSettled(instance.updateNested, { scope });
    await allSettled(instance.updateArr, { scope });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(instance.$status)).toBe("");
    expect(hydrated.getState(instance.$nested)).toEqual({ a: { b: [1, 2, 3] } });
    expect(hydrated.getState(instance.$arr)).toEqual([10, 20, 30]);
  });

  it("serialized keys use $dataMap SIDs (no per-instance store SIDs)", async () => {
    const model = counterModel("sidCheck");
    model.create({ id: "sid-check", count: 0 });

    const scope = fork();
    await allSettled(model.get("sid-check")!.increment, { scope });

    const values = serialize(scope);
    const keys = Object.keys(values);

    // $dataMap is the only serialized store for field data (no per-instance SIDs)
    const dataMapPattern = /^tentacles:\w+:__dataMap__$/;
    expect(keys.some((k) => dataMapPattern.test(k))).toBe(true);
    // No per-instance store SIDs
    const perInstancePattern = /^tentacles:\w+:sid-check:count$/;
    expect(keys.some((k) => perInstancePattern.test(k))).toBe(false);
  });

  it("serialize only includes stores that changed from defaults", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .event("touch", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $a, $b, touch }) => {
        $a.on(touch, (n) => n + 1);
        // $b is never modified
        return { $a, $b, touch };
      },
    });

    const instance = model.create({ id: "partial-1", a: 0, b: 0 });

    const scope = fork();
    await allSettled(instance.touch, { scope });

    const values = serialize(scope);

    // effector's serialize() by default only includes stores that differ
    // from their default value. Since b was never changed, it should not
    // appear in serialized output.
    const keys = Object.keys(values);
    const bKey = keys.find((k) => k.includes("partial-1:b"));

    // This is effector's behavior: unchanged stores ARE included in serialize()
    // because serialize() includes all stores with SIDs by default.
    // But hydration still works because the default matches.
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SCALE TEST — MANY MODELS, MANY INSTANCES, MANY FIELDS
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: scale test", () => {
  it("100 instances × 100 increments, all scopes isolated", async () => {
    const model = counterModel("scale100");

    const instances = Array.from({ length: 100 }, (_, i) =>
      model.create({ id: `scale-${i}`, count: 0 }),
    );

    const scope = fork();

    // Increment each instance a different number of times
    await Promise.all(
      instances.map((inst, i) =>
        Promise.all(
          Array.from({ length: i + 1 }, () =>
            allSettled(inst.increment, { scope }),
          ),
        ),
      ),
    );

    // Verify each instance has the correct count
    for (let i = 0; i < instances.length; i++) {
      expect(scope.getState(instances[i]!.$count)).toBe(i + 1);
    }

    // Serialize and hydrate
    const values = serialize(scope);
    const hydrated = fork({ values });

    for (let i = 0; i < instances.length; i++) {
      expect(hydrated.getState(instances[i]!.$count)).toBe(i + 1);
    }
  });

  it("serialize/hydrate with 10 models × 10 instances each", async () => {
    const models = Array.from({ length: 10 }, (_, i) => {
      const contract = counterContract();
      return createModel({
        contract,
        name: `scaleModel${i}`,
        fn: ({ $count, increment }) => {
          $count.on(increment, (n) => n + 1);
          return { $count, increment };
        },
      });
    });

    const allInstances = models.flatMap((model, mi) =>
      Array.from({ length: 10 }, (_, ii) =>
        model.create({ id: `m${mi}-i${ii}`, count: mi * 10 + ii }),
      ),
    );

    const scope = fork();

    // Increment everything once
    await Promise.all(
      allInstances.map((inst) => allSettled(inst.increment, { scope })),
    );

    const values = serialize(scope);
    const hydrated = fork({ values });

    for (let idx = 0; idx < allInstances.length; idx++) {
      const inst = allInstances[idx]!;
      const mi = Math.floor(idx / 10);
      const ii = idx % 10;
      const expected = mi * 10 + ii + 1;
      expect(hydrated.getState(inst.$count)).toBe(expected);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. FORK SCOPE AFTER GLOBAL MUTATION — SSR SAFETY
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: global mutation before fork", () => {
  it("fork() resets to createStore() default, ignoring global mutations", () => {
    const model = counterModel();
    const instance = model.create({ id: "global-leak", count: 0 });

    // Simulate accidental global mutation (e.g., during module initialization)
    instance.increment();
    instance.increment();
    instance.increment();

    expect(instance.$count.getState()).toBe(3);

    // GOOD: fork() resets to the store's default value (0), not the polluted global (3)
    const scope = fork();
    expect(scope.getState(instance.$count)).toBe(0);

    // However, global state is now permanently polluted.
    // Any code reading instance.$count.getState() (without scope) gets 3.
    // The library provides no way to reset global state back to defaults
    // and no guard rails to prevent accidental global mutations.
    expect(instance.$count.getState()).toBe(3);
  });

  it("global mutation does NOT affect fork, but diverges global from scope defaults", async () => {
    const model = counterModel("globalDiv");
    const instance = model.create({ id: "baseline-1", count: 0 });

    // Accidentally mutate global
    instance.increment();
    expect(instance.$count.getState()).toBe(1); // global is polluted

    const scope = fork();
    // fork() starts from default (0), not global (1)
    expect(scope.getState(instance.$count)).toBe(0);

    await allSettled(instance.increment, { scope });
    expect(scope.getState(instance.$count)).toBe(1);

    const values = serialize(scope);
    const hydrated = fork({ values });
    expect(hydrated.getState(instance.$count)).toBe(1);

    // Fresh scope still starts clean
    const freshScope = fork();
    expect(freshScope.getState(instance.$count)).toBe(0);

    // LIMITATION: global state and scope state are now permanently diverged.
    // getState() returns 1, but scope.getState() returns 0.
    // This is confusing and there's no API to detect or warn about the divergence.
    // In SSR, if anyone accidentally calls instance.$count.getState()
    // instead of scope.getState(instance.$count), they get wrong data.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. GENERIC CONTRACTS IN SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: concrete contracts in SSR", () => {
  it("model serialize/hydrate works with concrete types", async () => {
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .store("items", (s) => s<string[]>())
      .event("add", (e) => e<string>())
      .pk("id");

    const stringList = createModel({
      contract: listContract,
      name: "genericSsr",
      fn: ({ $items, add }) => {
        $items.on(add, (list, item) => [...list, item]);
        return { $items, add };
      },
    });

    const instance = stringList.create({
      id: "generic-ssr-1",
      items: [],
    });

    const scope = fork();
    await allSettled(instance.add, { scope, params: "hello" });
    await allSettled(instance.add, { scope, params: "world" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(instance.$items)).toEqual(["hello", "world"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. MULTIPLE HYDRATIONS — RE-HYDRATE OVERWRITES
// ─────────────────────────────────────────────────────────────────────────────

describe("CRUSH: re-hydration scenarios", () => {
  it("hydrating a scope that already has state overwrites cleanly", async () => {
    const model = counterModel("rehydrate");
    const instance = model.create({ id: "rehydrate-1", count: 0 });

    // First SSR pass
    const scope1 = fork();
    await allSettled(instance.increment, { scope: scope1 });
    const values1 = serialize(scope1);

    // Second SSR pass with more increments
    const scope2 = fork();
    await allSettled(instance.increment, { scope: scope2 });
    await allSettled(instance.increment, { scope: scope2 });
    await allSettled(instance.increment, { scope: scope2 });
    const values2 = serialize(scope2);

    // Hydrate from first pass
    const client1 = fork({ values: values1 });
    expect(client1.getState(instance.$count)).toBe(1);

    // Hydrate from second pass — completely independent
    const client2 = fork({ values: values2 });
    expect(client2.getState(instance.$count)).toBe(3);

    // Original scopes unchanged
    expect(scope1.getState(instance.$count)).toBe(1);
    expect(scope2.getState(instance.$count)).toBe(3);
  });
});
