import { allSettled, fork, serialize } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { InstanceCache } from "../layers/model/instance-cache";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: scope-aware delete validation
//
// Before Phase 8, `validateDeleteRestrictions` read `this._$dataMap.getState()`
// (the global snapshot) regardless of which scope the delete was being issued
// in. That silently bypassed `restrict` / `cascade` policies in true two-
// process SSR scenarios where the client process starts with an empty cache
// and populates its scope via `fork({values})` hydration.
//
// These tests simulate the two-process flow by wiping the global cache after
// serialising the server scope, then fire `deleteFx` / `clearFx` on the client
// scope and assert that the policies still run against the scoped $dataMap.
// ─────────────────────────────────────────────────────────────────────────────

function wipeGlobalCache(model: unknown): void {
  (model as { cache: InstanceCache<unknown> }).cache = new InstanceCache();
}

describe("Phase 8 — restrict policy against fork-hydrated data", () => {
  it("restrict many-ref prevents scoped deleteFx when target has sources", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "restrict" })
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p8-restrict-item" });
    const listModel = createModel({ contract: listContract, name: "p8-restrict-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "i1", name: "Alpha" },
        { id: "i2", name: "Beta" },
      ],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: { connect: ["i1", "i2"] } },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status, value } = await allSettled(listModel.deleteFx, {
      scope: clientScope,
      params: "L1",
    });
    expect(status).toBe("fail");
    // Error is wrapped by effector; check its message
    expect(String(value)).toMatch(/restrict/);
    // L1 should still exist in the scoped $ids
    expect(clientScope.getState(listModel.$ids).map(String)).toContain("L1");
  });

  it("restrict one-ref prevents scoped deleteFx when target has a source", async () => {
    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one", { onDelete: "restrict" })
      .pk("id");
    const teamModel = createModel({ contract: teamContract, name: "p8-restrict-team" });
    const playerModel = createModel({ contract: playerContract, name: "p8-restrict-player",
    refs: { team: () => teamModel },
  });
   
    const serverScope = fork();
    await allSettled(teamModel.createFx, {
      scope: serverScope,
      params: { id: "t1", name: "Red" },
    });
    await allSettled(playerModel.createFx, {
      scope: serverScope,
      params: { id: "p1", name: "Alice", team: "t1" },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(teamModel);
    wipeGlobalCache(playerModel);

    const { status, value } = await allSettled(playerModel.deleteFx, {
      scope: clientScope,
      params: "p1",
    });
    expect(status).toBe("fail");
    expect(String(value)).toMatch(/restrict/);
    expect(clientScope.getState(playerModel.$ids).map(String)).toContain("p1");
  });

  it("restrict allows scoped deleteFx when scoped ref is empty", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "restrict" })
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p8-restrict-empty-item" });
    const listModel = createModel({ contract: listContract, name: "p8-restrict-empty-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1" },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.deleteFx, {
      scope: clientScope,
      params: "L1",
    });
    expect(status).toBe("done");
    expect(clientScope.getState(listModel.$ids).map(String)).not.toContain("L1");
  });
});

describe("Phase 8 — cascade policy against fork-hydrated data", () => {
  it("cascade deleteFx recurses against scoped data", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "cascade" })
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p8-cascade-item" });
    const listModel = createModel({ contract: listContract, name: "p8-cascade-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "i1", name: "One" },
        { id: "i2", name: "Two" },
      ],
    });
    await allSettled(listModel.createFx, {
      scope: serverScope,
      params: { id: "L1", items: { connect: ["i1", "i2"] } },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.deleteFx, {
      scope: clientScope,
      params: "L1",
    });
    expect(status).toBe("done");
    expect(clientScope.getState(listModel.$ids).map(String)).not.toContain("L1");
    // Cascade recursion reaches the item model via clearInstance in the scope
    expect(clientScope.getState(itemModel.$ids).map(String)).not.toContain("i1");
    expect(clientScope.getState(itemModel.$ids).map(String)).not.toContain("i2");
  });
});

describe("Phase 8 — scoped clearFx enforces restrict", () => {
  it("clearFx fails if any hydrated instance has a restricted non-empty ref", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "restrict" })
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p8-clear-item" });
    const listModel = createModel({ contract: listContract, name: "p8-clear-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(itemModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "i1" }, { id: "i2" }],
    });
    await allSettled(listModel.createManyFx, {
      scope: serverScope,
      params: [
        { id: "L1", items: ["i1"] },
        { id: "L2" },
      ],
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status, value } = await allSettled(listModel.clearFx, { scope: clientScope });
    expect(status).toBe("fail");
    expect(String(value)).toMatch(/restrict/);
    // Ids remain unchanged after failed clear
    expect(clientScope.getState(listModel.$ids).map(String).sort()).toEqual(["L1", "L2"]);
  });

  it("clearFx succeeds when no hydrated instance violates restrict", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "restrict" })
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p8-clear-ok-item" });
    const listModel = createModel({ contract: listContract, name: "p8-clear-ok-list",
    refs: { items: () => itemModel },
  });
   
    const serverScope = fork();
    await allSettled(listModel.createManyFx, {
      scope: serverScope,
      params: [{ id: "L1" }, { id: "L2" }],
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    const { status } = await allSettled(listModel.clearFx, { scope: clientScope });
    expect(status).toBe("done");
    expect(clientScope.getState(listModel.$ids)).toHaveLength(0);
  });
});

describe("Phase 8 — scope isolation of failed deletes", () => {
  it("restrict failure in scopeA leaves scopeB untouched", async () => {
    const itemContract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");
    const listContract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many", { onDelete: "restrict" })
      .pk("id");
    const itemModel = createModel({ contract: itemContract, name: "p8-iso-item" });
    const listModel = createModel({ contract: listContract, name: "p8-iso-list",
    refs: { items: () => itemModel },
  });
   
    // Seed two independent server scopes
    const serverA = fork();
    await allSettled(itemModel.createFx, { scope: serverA, params: { id: "i1" } });
    await allSettled(listModel.createFx, {
      scope: serverA,
      params: { id: "L1", items: ["i1"] },
    });

    const serverB = fork();
    await allSettled(listModel.createFx, { scope: serverB, params: { id: "L1" } });

    // Each server state becomes its own client scope
    const clientA = fork({ values: serialize(serverA) });
    const clientB = fork({ values: serialize(serverB) });
    wipeGlobalCache(itemModel);
    wipeGlobalCache(listModel);

    // scopeA: L1 has items — restrict blocks
    const resA = await allSettled(listModel.deleteFx, {
      scope: clientA,
      params: "L1",
    });
    expect(resA.status).toBe("fail");
    expect(clientA.getState(listModel.$ids).map(String)).toContain("L1");

    // scopeB: L1 has no items — delete succeeds independently
    const resB = await allSettled(listModel.deleteFx, {
      scope: clientB,
      params: "L1",
    });
    expect(resB.status).toBe("done");
    expect(clientB.getState(listModel.$ids).map(String)).not.toContain("L1");
  });
});
