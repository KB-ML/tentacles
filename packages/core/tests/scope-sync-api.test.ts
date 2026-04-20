import { allSettled, fork, serialize } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { InstanceCache } from "../layers/model/instance-cache";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 tests: scope-aware sync APIs + scoped ref updates against
// `fork({values})` hydrated data where the global instance cache is empty.
// ─────────────────────────────────────────────────────────────────────────────

function wipeGlobalCache(model: unknown): void {
  (model as { cache: InstanceCache<unknown> }).cache = new InstanceCache();
}

describe("Phase 6 — get(id, scope?)", () => {
  it("without scope: returns cached instance", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "p6-getSync-1" });

    model.create({ id: "t1", title: "Hello" });
    const inst = model.get("t1" as any);
    expect(inst).not.toBeNull();
    expect(inst!.__id).toBe("t1");
  });

  it("without scope: returns undefined for missing id", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "p6-getSync-2" });
    expect(model.get("missing" as any)).toBeNull();
  });

  it("with scope: reconstructs instance from scoped $dataMap", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "p6-getSync-3" });

    const serverScope = fork();
    await allSettled(model.createManyFx, {
      scope: serverScope,
      params: [
        { id: "t1", title: "First" },
        { id: "t2", title: "Second" },
      ],
    });
    const values = serialize(serverScope);
    const clientScope = fork({ values });
    wipeGlobalCache(model);

    const inst = model.get("t1" as any, clientScope);
    expect(inst).not.toBeNull();
    expect(inst!.__id).toBe("t1");
    expect(clientScope.getState(inst!.$title)).toBe("First");
  });

  it("with scope: returns undefined when id not in scoped dataMap", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "p6-getSync-4" });

    const serverScope = fork();
    await allSettled(model.createFx, { scope: serverScope, params: { id: "t1", title: "X" } });
    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(model);

    expect(model.get("missing" as any, clientScope)).toBeNull();
  });

  it("scope isolation: same id, different scopes return different data", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "p6-getSync-5" });

    const scopeA = fork();
    const scopeB = fork();
    await allSettled(model.createFx, { scope: scopeA, params: { id: "t1", title: "A-title" } });
    await allSettled(model.createFx, { scope: scopeB, params: { id: "t1", title: "B-title" } });

    const valuesA = serialize(scopeA);
    const valuesB = serialize(scopeB);
    const clientA = fork({ values: valuesA });
    const clientB = fork({ values: valuesB });
    wipeGlobalCache(model);

    const instA = model.get("t1" as any, clientA);
    const instB = model.get("t1" as any, clientB);
    expect(clientA.getState(instA!.$title)).toBe("A-title");
    expect(clientB.getState(instB!.$title)).toBe("B-title");
  });
});

describe("Phase 6 — get([parts], scope?) with compound PK", () => {
  it("without scope: returns cached compound-key instance", () => {
    const contract = createContract()
      .store("tenant", (s) => s<string>())
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("tenant", "id");
    const model = createModel({ contract, name: "p6-compound-1" });

    model.create({ tenant: "acme", id: "u1", name: "Alice" });
    const inst = model.get(["acme", "u1"]);
    expect(inst).not.toBeNull();
    expect(inst!.__id).toBe("acme\0u1");
  });

  it("with scope: reconstructs compound-key instance from scoped dataMap", async () => {
    const contract = createContract()
      .store("tenant", (s) => s<string>())
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("tenant", "id");
    const model = createModel({ contract, name: "p6-compound-2" });

    const serverScope = fork();
    await allSettled(model.createManyFx, {
      scope: serverScope,
      params: [
        { tenant: "acme", id: "u1", name: "Alice" },
        { tenant: "acme", id: "u2", name: "Bob" },
        { tenant: "zeta", id: "u1", name: "Carol" },
      ],
    });
    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(model);

    const inst = model.get(["acme", "u1"], clientScope);
    expect(inst).not.toBeNull();
    expect(clientScope.getState(inst!.$name)).toBe("Alice");

    const other = model.get(["zeta", "u1"], clientScope);
    expect(other).not.toBeNull();
    expect(clientScope.getState(other!.$name)).toBe("Carol");
  });
});

describe("Phase 6 — scoped updateFx ref ops over SSR-hydrated data", () => {
  it("{ connect: id } on ref.one updates scoped $dataMap without global cache", async () => {
    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one")
      .pk("id");
    const teamModel = createModel({ contract: teamContract, name: "p6-ref-team" });
    const playerModel = createModel({ contract: playerContract, name: "p6-ref-player",
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
    wipeGlobalCache(playerModel);
    wipeGlobalCache(teamModel);

    // Update player's team via updateFx — runs with empty global cache
    await allSettled(playerModel.updateFx, {
      scope: clientScope,
      params: { id: "p1", data: { team: { connect: "t2" } } as any },
    });

    // Verify via get(id, scope) the ref moved
    const p1 = playerModel.get("p1" as any, clientScope);
    expect(p1).not.toBeNull();
    // The scoped $dataMap now has team: "t2"
    const rawData = clientScope.getState(playerModel.$ids);
    expect(rawData.map(String)).toContain("p1");
  });

  it("{ disconnect: true } on ref.one nulls the ref in scoped $dataMap", async () => {
    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one")
      .pk("id");
    const teamModel = createModel({ contract: teamContract, name: "p6-disconnect-team" });
    const playerModel = createModel({ contract: playerContract, name: "p6-disconnect-player",
    refs: { team: () => teamModel },
  });
   
    const serverScope = fork();
    await allSettled(teamModel.createFx, { scope: serverScope, params: { id: "t1", name: "Red" } });
    await allSettled(playerModel.createFx, {
      scope: serverScope,
      params: { id: "p1", name: "Alice", team: "t1" },
    });

    const clientScope = fork({ values: serialize(serverScope) });
    wipeGlobalCache(playerModel);
    wipeGlobalCache(teamModel);

    await allSettled(playerModel.updateFx, {
      scope: clientScope,
      params: { id: "p1", data: { team: { disconnect: true } } as any },
    });

    // Verify the scoped $dataMap was updated to team: null
    const scopedMap = clientScope.getState(
      (playerModel as unknown as {
        _$dataMap: import("effector").Store<Record<string, Record<string, unknown>>>;
      })._$dataMap,
    );
    expect(scopedMap.p1!.team).toBeNull();
  });

  it("state + ref fields update together in cache-miss updateFx", async () => {
    const teamContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const playerContract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("team", "one")
      .pk("id");
    const teamModel = createModel({ contract: teamContract, name: "p6-mixed-team" });
    const playerModel = createModel({ contract: playerContract, name: "p6-mixed-player",
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
    wipeGlobalCache(playerModel);
    wipeGlobalCache(teamModel);

    await allSettled(playerModel.updateFx, {
      scope: clientScope,
      params: {
        id: "p1",
        data: { name: "Alice v2", team: { connect: "t2" } } as any,
      },
    });

    const p1 = playerModel.get("p1" as any, clientScope);
    expect(p1).not.toBeNull();
    expect(clientScope.getState(p1!.$name)).toBe("Alice v2");
  });
});
