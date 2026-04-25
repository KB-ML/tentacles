import { fork, serialize } from "effector";
import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// Fully-scoped autoincrement: each fork() scope owns its own counter.
// ─────────────────────────────────────────────────────────────────────────────

describe("Autoincrement: fully scoped counter per fork()", () => {
  it("two parallel scopes each start at 1", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-parallel" });

    const scopeA = fork();
    const scopeB = fork();

    const a1 = await model.create({ name: "A1" }, { scope: scopeA });
    const b1 = await model.create({ name: "B1" }, { scope: scopeB });
    const a2 = await model.create({ name: "A2" }, { scope: scopeA });
    const b2 = await model.create({ name: "B2" }, { scope: scopeB });

    expect(a1.__id).toBe("1");
    expect(a2.__id).toBe("2");
    expect(b1.__id).toBe("1");
    expect(b2.__id).toBe("2");
  });

  it("default (unscoped) create and scoped create are isolated", () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-default-iso" });

    // Unscoped creates bump the default-context counter to 3
    model.create({ name: "d1" });
    model.create({ name: "d2" });
    model.create({ name: "d3" });

    // A fresh fork() has an empty counter and must start at 1
    const scope = fork();
    return model.create({ name: "s1" }, { scope }).then((s1) => {
      expect(s1.__id).toBe("1");
    });
  });

  it("scope created AFTER many default creates still starts at 1", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-late-fork" });

    for (let i = 0; i < 10; i++) model.create({ v: `d${i}` });

    const scope = fork();
    const s = await model.create({ v: "first-in-scope" }, { scope });
    expect(s.__id).toBe("1");
  });

  it("serialized counter reflects ONLY the scope's sequence", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-serialize-sequence" });

    // Noise on default context
    model.create({ v: "noise-1" });
    model.create({ v: "noise-2" });

    const scope = fork();
    await model.create({ v: "a" }, { scope });
    await model.create({ v: "b" }, { scope });

    const values = serialize(scope);
    const counter = values["tentacles:scoped-serialize-sequence:__autoIncrement__"] as
      | Record<string, number>
      | undefined;
    expect(counter).toEqual({ id: 2 });
  });

  it("many parallel scopes each own their counter independently", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-many-parallel" });

    const scopes = Array.from({ length: 5 }, () => fork());

    // Create 3 per scope, interleaved
    for (let i = 0; i < 3; i++) {
      await Promise.all(
        scopes.map((scope, idx) =>
          model.create({ v: `scope${idx}-item${i}` }, { scope }),
        ),
      );
    }

    for (const scope of scopes) {
      const values = serialize(scope);
      const counter = values["tentacles:scoped-many-parallel:__autoIncrement__"] as Record<
        string,
        number
      >;
      expect(counter).toEqual({ id: 3 });
    }
  });

  it("multiple autoincrement fields are scope-isolated together", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("seq", (s) => s<number>().autoincrement())
      .store("label", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-multi-field" });

    const scopeA = fork();
    const scopeB = fork();

    await model.create({ label: "a1" }, { scope: scopeA });
    await model.create({ label: "a2" }, { scope: scopeA });
    await model.create({ label: "b1" }, { scope: scopeB });

    const va = serialize(scopeA);
    const vb = serialize(scopeB);
    expect(va["tentacles:scoped-multi-field:__autoIncrement__"]).toEqual({ id: 2, seq: 2 });
    expect(vb["tentacles:scoped-multi-field:__autoIncrement__"]).toEqual({ id: 1, seq: 1 });
  });

  it("multiple different models with autoincrement — each model × scope is isolated", async () => {
    const contractX = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const contractY = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const modelX = createModel({ contract: contractX, name: "scoped-modelX" });
    const modelY = createModel({ contract: contractY, name: "scoped-modelY" });

    const scopeA = fork();
    const scopeB = fork();

    await modelX.create({ v: "x-a-1" }, { scope: scopeA });
    await modelX.create({ v: "x-a-2" }, { scope: scopeA });
    await modelY.create({ v: "y-a-1" }, { scope: scopeA });

    await modelX.create({ v: "x-b-1" }, { scope: scopeB });
    await modelY.create({ v: "y-b-1" }, { scope: scopeB });
    await modelY.create({ v: "y-b-2" }, { scope: scopeB });

    const va = serialize(scopeA);
    const vb = serialize(scopeB);
    expect(va["tentacles:scoped-modelX:__autoIncrement__"]).toEqual({ id: 2 });
    expect(va["tentacles:scoped-modelY:__autoIncrement__"]).toEqual({ id: 1 });
    expect(vb["tentacles:scoped-modelX:__autoIncrement__"]).toEqual({ id: 1 });
    expect(vb["tentacles:scoped-modelY:__autoIncrement__"]).toEqual({ id: 2 });
  });

  it("hydrated client scope continues from server counter and has isolated state", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-hydration" });

    // Server
    const serverScope = fork();
    await model.createMany(
      [{ v: "a" }, { v: "b" }, { v: "c" }],
      { scope: serverScope },
    );
    const values = serialize(serverScope);
    expect(values["tentacles:scoped-hydration:__autoIncrement__"]).toEqual({ id: 3 });

    // Client — a fresh fork with server values, AND some unrelated default-context noise in between
    model.create({ v: "default-noise-1" });
    model.create({ v: "default-noise-2" });

    const clientScope = fork({ values });
    const next = await model.create({ v: "d" }, { scope: clientScope });
    expect(next.__id).toBe("4");

    const clientValues = serialize(clientScope);
    expect(clientValues["tentacles:scoped-hydration:__autoIncrement__"]).toEqual({ id: 4 });
  });

  it("explicit id in scope bumps the scope counter, not the default one", async () => {
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-explicit-id" });

    const scope = fork();
    await model.create({ id: 50, v: "a" }, { scope });
    const next = await model.create({ v: "b" }, { scope });
    expect(next.__id).toBe("51");

    // Default context is untouched — a fresh unscoped create still starts at 1
    const unscoped = model.create({ v: "default" });
    expect(unscoped.__id).toBe("1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createFx / createManyFx from effect — scope-routed
// ─────────────────────────────────────────────────────────────────────────────

describe("Autoincrement: createFx under scope", () => {
  it("createFx dispatched via allSettled({scope}) is scope-isolated", async () => {
    const { allSettled } = await import("effector");
    const contract = createContract()
      .store("id", (s) => s<number>().autoincrement())
      .store("v", (s) => s<string>())
      .pk("id");
    const model = createModel({ contract, name: "scoped-createFx" });

    const scopeA = fork();
    const scopeB = fork();

    await allSettled(model.createFx, { scope: scopeA, params: { v: "a1" } });
    await allSettled(model.createFx, { scope: scopeB, params: { v: "b1" } });
    await allSettled(model.createFx, { scope: scopeA, params: { v: "a2" } });

    const va = serialize(scopeA);
    const vb = serialize(scopeB);
    expect(va["tentacles:scoped-createFx:__autoIncrement__"]).toEqual({ id: 2 });
    expect(vb["tentacles:scoped-createFx:__autoIncrement__"]).toEqual({ id: 1 });
  });
});
