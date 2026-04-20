import { allSettled, fork, serialize } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { InstanceCache } from "../layers/model/instance-cache";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: scope-aware `updateFx` for many-ref additive ops.
//
// Before Phase 10, `updateFx` was a plain `createEffect` whose handler walked
// `this.cache` and, on cache-miss, fell back to `_$dataMap.getState()` (global)
// to compute the new ref value for `{ set }` / plain-array ops. Additive ops
// like `{ add }`, `{ disconnect }`, `{ create }`, and `{ connectOrCreate }`
// were unsupported on that path because they require reading the *current*
// many-ref value before layering the mutation — and the imperative-handler
// context had no scope-correct way to do that.
//
// Phase 10 re-routes `updateFx` through an `attach({ source: $dataMap, ... })`
// wrapper so the handler receives the scope-correct `$dataMap` snapshot. The
// cache-miss branch in `handleUpdate` now reads the current row from that
// snapshot and computes new many-ref values off of it, making every `add`,
// `disconnect`, `create`, and `connectOrCreate` op work against fork-hydrated
// state in true two-process SSR.
//
// These tests simulate the two-process flow (wipe global cache after serial-
// ising the server scope), fire `updateFx` on the client scope, and assert
// that the resulting ref state reflects the op against the scoped data via
// the public `get(id, scope)` API.
// ─────────────────────────────────────────────────────────────────────────────

function wipeGlobalCache(model: unknown): void {
  (model as { cache: InstanceCache<unknown> }).cache = new InstanceCache();
}

describe("Phase 10 — many-ref additive updates against fork-hydrated data", () => {
  it("{add: [scalar]} appends ids to an existing scoped many-ref", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-add-item" });
    const listModel = createModel({ contract: listContract, name: "p10-add-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "i1", name: "One" },
        { id: "i2", name: "Two" },
        { id: "i3", name: "Three" },
      ],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: ["i1"] },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.updateFx, {
      scope: clientScope,
      params: { id: "L1", data: { items: { add: ["i2", "i3"] } } },
    });
    expect(status).toBe("done");

    const list = listModel.get("L1", clientScope)!;
    const ids = clientScope.getState(list.items.$ids).map(String).sort();
    expect(ids).toEqual(["i1", "i2", "i3"]);
  });

  it("{add} is idempotent — does not duplicate an existing id", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-add-dup-item" });
    const listModel = createModel({ contract: listContract, name: "p10-add-dup-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "i1" }, { id: "i2" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: ["i1", "i2"] },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.updateFx, {
      scope: clientScope,
      // i1 already in the array — must NOT double
      params: { id: "L1", data: { items: { add: ["i1"] } } },
    });
    expect(status).toBe("done");

    const list = listModel.get("L1", clientScope)!;
    expect(clientScope.getState(list.items.$ids).map(String).sort()).toEqual(["i1", "i2"]);
  });

  it("{disconnect: [id]} removes ids from an existing scoped many-ref", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-disc-item" });
    const listModel = createModel({ contract: listContract, name: "p10-disc-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: ["i1", "i2", "i3"] },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.updateFx, {
      scope: clientScope,
      params: { id: "L1", data: { items: { disconnect: ["i2"] } } },
    });
    expect(status).toBe("done");

    const list = listModel.get("L1", clientScope)!;
    expect(clientScope.getState(list.items.$ids).map(String).sort()).toEqual(["i1", "i3"]);
  });

  it("{ disconnect + add } in a single op: disconnect runs first, add second", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-disc-add-item" });
    const listModel = createModel({ contract: listContract, name: "p10-disc-add-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: ["i1", "i2"] },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.updateFx, {
      scope: clientScope,
      // drop i1, add i3 — final list should be [i2, i3]
      params: {
        id: "L1",
        data: { items: { disconnect: ["i1"], add: ["i3"] } },
      },
    });
    expect(status).toBe("done");

    const list = listModel.get("L1", clientScope)!;
    expect(clientScope.getState(list.items.$ids).map(String).sort()).toEqual(["i2", "i3"]);
  });

  it("{set: [...]} replaces the entire scoped many-ref", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-set-item" });
    const listModel = createModel({ contract: listContract, name: "p10-set-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: ["i1", "i2"] },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.updateFx, {
      scope: clientScope,
      params: { id: "L1", data: { items: { set: ["i3"] } } },
    });
    expect(status).toBe("done");

    const list = listModel.get("L1", clientScope)!;
    expect(clientScope.getState(list.items.$ids).map(String)).toEqual(["i3"]);
  });

  it("plain-array shortcut merges new scalar ids into the existing ref", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-plain-item" });
    const listModel = createModel({ contract: listContract, name: "p10-plain-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "i1" }, { id: "i2" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: ["i1"] },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    // Plain array of scalar ids — documented as the `{add: [...]}` shortcut
    // in the cache-hit path. Phase 10 mirrors the same semantics on cache-
    // miss: the new ids are merged into the existing many-ref value.
    const { status } = await allSettled(listModel.updateFx, {
      scope: clientScope,
      params: { id: "L1", data: { items: ["i2"] } },
    });
    expect(status).toBe("done");

    const list = listModel.get("L1", clientScope)!;
    expect(clientScope.getState(list.items.$ids).map(String).sort()).toEqual(["i1", "i2"]);
  });
});

describe("Phase 10 — one-ref updates against fork-hydrated data", () => {
  it("{ connect: id } sets a one-ref on a cache-miss instance", async () => {
    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one")
      .pk("id");
    const teamModel = createModel({ contract: teamContract, name: "p10-team" });
    const playerModel = createModel({ contract: playerContract, name: "p10-player",
    refs: { team: () => teamModel },
  });
   
    const serverScope = fork();
    await allSettled(teamModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "t1", name: "Red" },
        { id: "t2", name: "Blue" },
      ],
    });
    await allSettled(playerModel.createFx, {
      scope: serverScope,
      params: { id: "p1", name: "Alice", team: "t1" },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(teamModel);
    wipeGlobalCache(playerModel);

    const { status } = await allSettled(playerModel.updateFx, {
      scope: clientScope,
      params: { id: "p1", data: { team: { connect: "t2" } } },
    });
    expect(status).toBe("done");

    const player = playerModel.get("p1", clientScope)!;
    expect(String(clientScope.getState(player.team.$id))).toBe("t2");
  });

  it("{ disconnect: true } clears a one-ref on a cache-miss instance", async () => {
    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .ref("team", "one")
      .pk("id");
    const teamModel = createModel({ contract: teamContract, name: "p10-disc-team" });
    const playerModel = createModel({ contract: playerContract, name: "p10-disc-player",
    refs: { team: () => teamModel },
  });
   
    const serverScope = fork();
    await allSettled(teamModel.createFx, { scope: serverScope, params: { id: "t1" } });
    await allSettled(playerModel.createFx, {
      scope: serverScope,
      params: { id: "p1", team: "t1" },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(teamModel);
    wipeGlobalCache(playerModel);

    const { status } = await allSettled(playerModel.updateFx, {
      scope: clientScope,
      params: { id: "p1", data: { team: { disconnect: true } } },
    });
    expect(status).toBe("done");

    const player = playerModel.get("p1", clientScope)!;
    expect(clientScope.getState(player.team.$id)).toBeNull();
  });
});

describe("Phase 10 — store-field updates on cache-miss instances", () => {
  it("updates scalar store fields via scoped _dataMapFieldUpdated", async () => {
    const userContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .store("age", (s) => s<number>())
      .pk("id");
    const userModel = createModel({ contract: userContract, name: "p10-store-user" });

    const serverScope = fork();
    await allSettled(userModel.createFx, {
      scope: serverScope,
      params: { id: "u1", name: "Alice", age: 30 },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(userModel);

    const { status } = await allSettled(userModel.updateFx, {
      scope: clientScope,
      params: { id: "u1", data: { name: "Alicia", age: 31 } },
    });
    expect(status).toBe("done");

    const user = userModel.get("u1", clientScope)!;
    expect(clientScope.getState(user.$name)).toBe("Alicia");
    expect(clientScope.getState(user.$age)).toBe(31);
  });

  it("throws when the id is not in the scoped dataMap either", async () => {
    const userContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const userModel = createModel({ contract: userContract, name: "p10-missing-user" });

    const serverScope = fork();
    await allSettled(userModel.createFx, {
      scope: serverScope,
      params: { id: "u1", name: "Alice" },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(userModel);

    const { status, value } = await allSettled(userModel.updateFx, {
      scope: clientScope,
      params: { id: "does-not-exist", data: { name: "x" } },
    });
    expect(status).toBe("fail");
    expect(String(value)).toMatch(/not found/);
  });
});

describe("Phase 10 — scope isolation of update ops", () => {
  it("update in scopeA does not bleed into scopeB", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p10-iso-item" });
    const listModel = createModel({ contract: listContract, name: "p10-iso-list",
    refs: { items: () => itemModel },
  });
   
    // Two independent server scopes with divergent initial state
    const serverA = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverA,
      params: [{ id: "i1" }, { id: "i2" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverA,
      params: { id: "L1", items: ["i1"] },
    });

    const serverB = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverB,
      params: [{ id: "i1" }, { id: "i2" }],
    });
    await allSettled(listModel.createFx, {
      scope: serverB,
      params: { id: "L1", items: ["i1"] },
    });

    const clientA = fork({ values: serialize(serverA) });
    const clientB = fork({ values: serialize(serverB) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    // Only scopeA adds i2 to L1
    const { status } = await allSettled(listModel.updateFx, {
      scope: clientA,
      params: { id: "L1", data: { items: { add: ["i2"] } } },
    });
    expect(status).toBe("done");

    const listA = listModel.get("L1", clientA)!;
    const listB = listModel.get("L1", clientB)!;
    expect(clientA.getState(listA.items.$ids).map(String).sort()).toEqual(["i1", "i2"]);
    expect(clientB.getState(listB.items.$ids).map(String)).toEqual(["i1"]);
  });
});
