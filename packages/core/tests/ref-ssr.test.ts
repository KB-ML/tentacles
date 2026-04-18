import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize } from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// REF SSR CRUSH TEST
//
// Purpose: push refs through every SSR scenario until they break.
// Each test combines refs with fork/serialize/hydrate to expose edge cases.
// ─────────────────────────────────────────────────────────────────────────────

function makeTargetModel(name?: string) {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .pk("id");
  return createModel({
    contract,
    name,
    fn: ({ $name }) => ({ $name }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REF MANY — SERIALIZE / HYDRATE
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: many — serialize / hydrate", () => {
  const targetModel = makeTargetModel("refSsrTarget1");

  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .ref("items", "many")
    .pk("id");
  const model = createModel({
    contract,
    name: "refSsrMany",
    fn: ({ $title, items }) => ({ $title, items }),
  });
  model.bind({ items: () => targetModel });

  it("ref $ids survives serialize → hydrate", async () => {
    const inst = model.create({ id: "rms-1", title: "t" });
    const scope = fork();

    await allSettled(inst.items.add, { scope, params: "a" });
    await allSettled(inst.items.add, { scope, params: "b" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.items.$ids)).toEqual(["a", "b"]);
    expect(hydrated.getState(inst.$title)).toBe("t");
  });

  it("add + remove round-trips through serialize", async () => {
    const inst = model.create({ id: "rms-2", title: "t" });
    const scope = fork();

    await allSettled(inst.items.add, { scope, params: "x" });
    await allSettled(inst.items.add, { scope, params: "y" });
    await allSettled(inst.items.add, { scope, params: "z" });
    await allSettled(inst.items.remove, { scope, params: "y" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.items.$ids)).toEqual(["x", "z"]);
  });

  it("empty ref many serializes as empty array", async () => {
    const inst = model.create({ id: "rms-3", title: "t" });
    const scope = fork();

    // Touch the scope by reading (allSettled on title)
    await allSettled(inst.items.add, { scope, params: "tmp" });
    await allSettled(inst.items.remove, { scope, params: "tmp" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.items.$ids)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REF ONE — SERIALIZE / HYDRATE
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: one — serialize / hydrate", () => {
  const targetModel = makeTargetModel("refSsrTarget2");

  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("label", (s) => s<string>())
    .ref("current", "one")
    .pk("id");
  const model = createModel({
    contract,
    name: "refSsrOne",
    fn: ({ $label, current }) => ({ $label, current }),
  });
  model.bind({ current: () => targetModel });

  it("ref $id survives serialize → hydrate", async () => {
    const inst = model.create({ id: "ros-1", label: "l" });
    const scope = fork();

    await allSettled(inst.current.set, { scope, params: "target-1" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.current.$id)).toBe("target-1");
    expect(hydrated.getState(inst.$label)).toBe("l");
  });

  it("set → clear → set round-trips", async () => {
    const inst = model.create({ id: "ros-2", label: "l" });
    const scope = fork();

    await allSettled(inst.current.set, { scope, params: "first" });
    await allSettled(inst.current.clear, { scope });
    await allSettled(inst.current.set, { scope, params: "second" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.current.$id)).toBe("second");
  });

  it("null ref one serializes as null", async () => {
    const inst = model.create({ id: "ros-3", label: "l" });
    const scope = fork();

    await allSettled(inst.current.set, { scope, params: "tmp" });
    await allSettled(inst.current.clear, { scope });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.current.$id)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. MIXED — STORES + EVENTS + REFS SERIALIZE TOGETHER
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: mixed contract serialize", () => {
  const targetModel = makeTargetModel("refSsrTarget3");

  it("stores and refs serialize independently", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .ref("items", "many")
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrMix",
      fn: ({ $count, inc, items, current }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc, items, current };
      },
    });
    model.bind({ items: () => targetModel, current: () => targetModel });

    const inst = model.create({ id: "mix-1", count: 0 });
    const scope = fork();

    await allSettled(inst.inc, { scope });
    await allSettled(inst.inc, { scope });
    await allSettled(inst.items.add, { scope, params: "r1" });
    await allSettled(inst.items.add, { scope, params: "r2" });
    await allSettled(inst.current.set, { scope, params: "r3" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.$count)).toBe(2);
    expect(hydrated.getState(inst.items.$ids)).toEqual(["r1", "r2"]);
    expect(hydrated.getState(inst.current.$id)).toBe("r3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SCOPE ISOLATION — REF STATE ACROSS SCOPES
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: scope isolation", () => {
  const targetModel = makeTargetModel("refSsrTarget4");

  const contract = createContract()
    .store("id", (s) => s<string>())
    .ref("items", "many")
    .ref("current", "one")
    .pk("id");
  const model = createModel({
    contract,
    name: "refSsrIso",
    fn: ({ items, current }) => ({ items, current }),

  });
  model.bind({ items: () => targetModel, current: () => targetModel });

  it("two scopes with same instance have independent ref state", async () => {
    const inst = model.create({ id: "iso-1" });

    const scopeA = fork();
    const scopeB = fork();

    await allSettled(inst.items.add, { scope: scopeA, params: "a1" });
    await allSettled(inst.items.add, { scope: scopeA, params: "a2" });
    await allSettled(inst.current.set, { scope: scopeA, params: "refA" });

    await allSettled(inst.items.add, { scope: scopeB, params: "b1" });
    await allSettled(inst.current.set, { scope: scopeB, params: "refB" });

    expect(scopeA.getState(inst.items.$ids)).toEqual(["a1", "a2"]);
    expect(scopeA.getState(inst.current.$id)).toBe("refA");

    expect(scopeB.getState(inst.items.$ids)).toEqual(["b1"]);
    expect(scopeB.getState(inst.current.$id)).toBe("refB");
  });

  it("scope mutation does not pollute global ref state", async () => {
    const inst = model.create({ id: "iso-2" });
    const scope = fork();

    await allSettled(inst.items.add, { scope, params: "x" });
    await allSettled(inst.current.set, { scope, params: "y" });

    // Global state untouched
    expect(inst.items.$ids.getState()).toEqual([]);
    expect(inst.current.$id.getState()).toBeNull();
  });

  it("serialize two scopes independently", async () => {
    const inst = model.create({ id: "iso-3" });

    const s1 = fork();
    const s2 = fork();

    await allSettled(inst.items.add, { scope: s1, params: "one" });
    await allSettled(inst.items.add, { scope: s2, params: "two" });
    await allSettled(inst.items.add, { scope: s2, params: "three" });

    const v1 = serialize(s1);
    const v2 = serialize(s2);

    const h1 = fork({ values: v1 });
    const h2 = fork({ values: v2 });

    expect(h1.getState(inst.items.$ids)).toEqual(["one"]);
    expect(h2.getState(inst.items.$ids)).toEqual(["two", "three"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONCURRENT SSR REQUESTS WITH REFS
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: concurrent requests", () => {
  const targetModel = makeTargetModel("refSsrTarget5");

  it("50 concurrent SSR requests with refs do not mix state", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrConc",
      fn: ({ $name, items }) => ({ $name, items }),
    });
    model.bind({ items: () => targetModel });

    const inst = model.create({ id: "conc-1", name: "shared" });

    const results = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const scope = fork();
        for (let j = 0; j <= i; j++) {
          await allSettled(inst.items.add, { scope, params: `item-${j}` });
        }
        return { i, values: serialize(scope), scope };
      }),
    );

    for (const { i, values, scope } of results) {
      const ids = scope.getState(inst.items.$ids);
      expect(ids.length).toBe(i + 1);

      // Hydrate and verify
      const hydrated = fork({ values });
      expect(hydrated.getState(inst.items.$ids).length).toBe(i + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE + RE-CREATE — REF SID COLLISION
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: delete + re-create SID collision", () => {
  const targetModel = makeTargetModel("refSsrTarget6");

  it("ref SIDs collide after delete + re-create (old data leaks via hydration)", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrEph",
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    const v1 = model.create({ id: "eph" });
    const v1Sid = v1.items.$ids.sid;

    // Mutate in a scope
    const scope1 = fork();
    await allSettled(v1.items.add, { scope: scope1, params: "old-a" });
    await allSettled(v1.items.add, { scope: scope1, params: "old-b" });
    const serialized = serialize(scope1);

    // Delete and re-create
    model.delete("eph");
    const v2 = model.create({ id: "eph" });

    // SIDs match — effector maps old serialized data to new store
    expect(v2.items.$ids.sid).toBe(v1Sid);

    // Hydrate with old data — old ref IDs leak into new instance
    const hydrated = fork({ values: serialized });
    expect(hydrated.getState(v2.items.$ids)).toEqual(["old-a", "old-b"]);
  });

  it("ref one SID collision — old ID leaks", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrEph2",
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    const v1 = model.create({ id: "eph2" });
    const scope1 = fork();
    await allSettled(v1.current.set, { scope: scope1, params: "leaked-id" });
    const serialized = serialize(scope1);

    model.delete("eph2");
    const v2 = model.create({ id: "eph2" });

    const hydrated = fork({ values: serialized });
    expect(hydrated.getState(v2.current.$id)).toBe("leaked-id");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. GLOBAL MUTATION BEFORE FORK — REF SAFETY
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: global mutation before fork", () => {
  const targetModel = makeTargetModel("refSsrTarget7");

  it("global ref mutations do not leak into fork scope", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrGm1",
      fn: ({ items, current }) => ({ items, current }),

    });
    model.bind({ items: () => targetModel, current: () => targetModel });

    const inst = model.create({ id: "gm-1" });

    // Accidental global mutation
    inst.items.add("leaked");
    inst.current.set("leaked-id");

    expect(inst.items.$ids.getState()).toEqual(["leaked"]);
    expect(inst.current.$id.getState()).toBe("leaked-id");

    // fork resets to store defaults
    const scope = fork();
    expect(scope.getState(inst.items.$ids)).toEqual([]);
    expect(scope.getState(inst.current.$id)).toBeNull();
  });

  it("global mutation + scope mutation = independent states", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrGm2",
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    const inst = model.create({ id: "gm-2" });

    // Pollute global
    inst.items.add("global-only");

    const scope = fork();
    await allSettled(inst.items.add, { scope, params: "scope-only" });

    expect(inst.items.$ids.getState()).toEqual(["global-only"]);
    expect(scope.getState(inst.items.$ids)).toEqual(["scope-only"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SCOPED CREATION — REFS IN SCOPED INSTANCES
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: scoped creation", () => {
  const targetModel = makeTargetModel("refSsrTarget8");

  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .ref("items", "many")
    .ref("current", "one")
    .pk("id");
  const model = createModel({
    contract,
    name: "refSsrScoped",
    fn: ({ $name, items, current }) => ({ $name, items, current }),
  });
  model.bind({ items: () => targetModel, current: () => targetModel });

  it("scoped instance refs serialize correctly", async () => {
    const scope = fork();
    const inst = await model.create({ id: "rs-1", name: "test" }, { scope });

    await allSettled(inst.items.add, { scope, params: "child-1" });
    await allSettled(inst.current.set, { scope, params: "selected" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(inst.items.$ids)).toEqual(["child-1"]);
    expect(hydrated.getState(inst.current.$id)).toBe("selected");
    expect(hydrated.getState(inst.$name)).toBe("test");
  });

  it("two scoped instances with same ID in different scopes", async () => {
    const s1 = fork();
    const s2 = fork();

    const a = await model.create({ id: "rs-2", name: "a" }, { scope: s1 });
    const b = await model.create({ id: "rs-2", name: "b" }, { scope: s2 });

    await allSettled(a.items.add, { scope: s1, params: "from-a" });
    await allSettled(b.items.add, { scope: s2, params: "from-b" });
    await allSettled(b.items.add, { scope: s2, params: "from-b2" });

    expect(s1.getState(a.items.$ids)).toEqual(["from-a"]);
    expect(s2.getState(b.items.$ids)).toEqual(["from-b", "from-b2"]);
  });

  it("scoped delete clears ref SIDs — no duplicate warning on re-create", async () => {
    const scope = fork();

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

    try {
      const inst = await model.create({ id: "rs-3", name: "t" }, { scope });
      await allSettled(inst.items.add, { scope, params: "x" });

      model.delete("rs-3");

      // Re-create same ID — no duplicate SID warning
      await model.create({ id: "rs-3", name: "t2" }, { scope });

      const dupWarnings = warnings.filter((w) => w.includes("Duplicate SID"));
      expect(dupWarnings.length).toBe(0);
    } finally {
      console.warn = origWarn;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. SELF-REF IN SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: self-reference", () => {
  it("self-ref many works in fork scope", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("children", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrSelfMany",
      fn: ({ $name, children }) => ({ $name, children }),
    });

    const parent = model.create({ id: "root", name: "root" });
    model.create({ id: "child-a", name: "A" });
    model.create({ id: "child-b", name: "B" });

    const scope = fork();
    await allSettled(parent.children.add, { scope, params: "child-a" });
    await allSettled(parent.children.add, { scope, params: "child-b" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(parent.children.$ids)).toEqual(["child-a", "child-b"]);
  });

  it("self-ref one works in fork scope", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("manager", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrSelfOne",
      fn: ({ $name, manager }) => ({ $name, manager }),
    });

    const alice = model.create({ id: "alice", name: "Alice" });
    model.create({ id: "bob", name: "Bob" });

    const scope = fork();
    await allSettled(alice.manager.set, { scope, params: "bob" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    expect(hydrated.getState(alice.manager.$id)).toBe("bob");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SSR FULL LIFECYCLE — REQUEST SIMULATION WITH REFS
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: full request lifecycle", () => {
  const targetModel = makeTargetModel("refSsrTarget9");

  it("server render → serialize → client hydrate → client mutate", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .ref("items", "many")
      .ref("selected", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrPage",
      fn: ({ $title, items, selected }) => ({ $title, items, selected }),
    });
    model.bind({ items: () => targetModel, selected: () => targetModel });

    // Server
    const inst = model.create({ id: "page-1", title: "My Page" });
    const serverScope = fork();

    await allSettled(inst.items.add, { scope: serverScope, params: "card-1" });
    await allSettled(inst.items.add, { scope: serverScope, params: "card-2" });
    await allSettled(inst.selected.set, { scope: serverScope, params: "card-1" });

    const serverValues = serialize(serverScope);

    // Client hydration
    const clientScope = fork({ values: serverValues });

    expect(clientScope.getState(inst.$title)).toBe("My Page");
    expect(clientScope.getState(inst.items.$ids)).toEqual(["card-1", "card-2"]);
    expect(clientScope.getState(inst.selected.$id)).toBe("card-1");

    // Client mutations
    await allSettled(inst.items.add, { scope: clientScope, params: "card-3" });
    await allSettled(inst.selected.set, { scope: clientScope, params: "card-3" });

    expect(clientScope.getState(inst.items.$ids)).toEqual(["card-1", "card-2", "card-3"]);
    expect(clientScope.getState(inst.selected.$id)).toBe("card-3");

    // Server scope unaffected
    expect(serverScope.getState(inst.items.$ids)).toEqual(["card-1", "card-2"]);
    expect(serverScope.getState(inst.selected.$id)).toBe("card-1");
  });

  it("server cleanup + client re-create with same IDs", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrSrv",
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    // Server: create, mutate, serialize
    const inst = model.create({ id: "srv-1" });
    const serverScope = fork();
    await allSettled(inst.items.add, { scope: serverScope, params: "a" });
    const values = serialize(serverScope);

    // Server cleanup
    model.delete("srv-1");

    // Client: re-create with same ID, hydrate from server data
    const v2 = model.create({ id: "srv-1" });
    const clientScope = fork({ values });

    // SIDs match → hydration works
    expect(clientScope.getState(v2.items.$ids)).toEqual(["a"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. REF SID FORMAT UNDER SERIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: SID format in serialized output", () => {
  const targetModel = makeTargetModel();

  it("ref data is serialized via $dataMap", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "sidFormat",
      fn: ({ items, current }) => ({ items, current }),

    });
    model.bind({ items: () => targetModel, current: () => targetModel });

    const inst = model.create({ id: "sf-1" });
    const scope = fork();

    await allSettled(inst.items.add, { scope, params: "x" });
    await allSettled(inst.current.set, { scope, params: "y" });

    const values = serialize(scope);
    const keys = Object.keys(values);

    // Ref data flows through $dataMap — no separate ref SIDs
    expect(keys).toContain("tentacles:sidFormat:__dataMap__");
    // Verify ref data is inside $dataMap
    const dataMap = values["tentacles:sidFormat:__dataMap__"] as Record<string, Record<string, unknown>>;
    expect(dataMap["sf-1"]?.items).toEqual(["x"]);
    expect(dataMap["sf-1"]?.current).toBe("y");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. SCALE — MANY REFS UNDER SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("REF SSR: scale test", () => {
  const targetModel = makeTargetModel("refSsrTarget10");

  it("20 instances with refs × concurrent scopes", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "refSsrScale",
      fn: ({ $count, inc, items }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc, items };
      },
    });
    model.bind({ items: () => targetModel });

    const instances = Array.from({ length: 20 }, (_, i) =>
      model.create({ id: `scale-${i}`, count: 0 }),
    );

    const results = await Promise.all(
      Array.from({ length: 10 }, async (_, scopeIdx) => {
        const scope = fork();

        for (let i = 0; i < instances.length; i++) {
          await allSettled(instances[i]!.inc, { scope });
          await allSettled(instances[i]!.items.add, {
            scope,
            params: `s${scopeIdx}-ref-${i}`,
          });
        }

        return { values: serialize(scope), scope };
      }),
    );

    for (let s = 0; s < results.length; s++) {
      const { values, scope } = results[s]!;
      const hydrated = fork({ values });

      for (let i = 0; i < instances.length; i++) {
        expect(scope.getState(instances[i]!.$count)).toBe(1);
        expect(hydrated.getState(instances[i]!.$count)).toBe(1);

        const ids = scope.getState(instances[i]!.items.$ids);
        expect(ids).toContain(`s${s}-ref-${i}`);
      }
    }
  });
});
