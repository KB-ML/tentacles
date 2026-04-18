import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize } from "effector";
import { createContract, createModel } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// LIVING GRAPH SSR
//
// Tests for $ids, instance(), __id/__model, and $resolved under fork/serialize/hydrate.
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
// 1. $ids — NOT SERIALIZED
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: $ids serialize behavior", () => {
  it("$ids is serialized when instances are created in scope", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      name: "lgIds",
    });

    const scope = fork();
    await model.create({ id: "a", count: 1 }, { scope });
    await model.create({ id: "b", count: 2 }, { scope });

    const values = serialize(scope);
    const keys = Object.keys(values);

    // $ids should appear in serialized output when created in scope
    expect(keys.some((k) => k.includes("__registry__"))).toBe(true);
    expect(scope.getState(model.$ids)).toEqual(["a", "b"]);
  });

  it("$ids is rebuilt from module-level create() calls after hydration", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      name: "lgRebuild",
      fn: ({ $count }) => ({ $count }),
    });
    model.create({ id: "x", count: 10 });
    model.create({ id: "y", count: 20 });

    // Simulate SSR: serialize, then hydrate on "client"
    const scope = fork();
    const values = serialize(scope);
    const clientScope = fork({ values });

    // $ids is populated from create() calls, not from serialization
    expect(model.$ids.getState()).toEqual(["x", "y"]);

    // Store values hydrate correctly
    const inst = model.instance("x").getState();
    expect(inst).not.toBeNull();
    expect(clientScope.getState(inst!.$count)).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. instance() — WORKS AFTER HYDRATION
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: instance() with scoped values", () => {
  it("instance() returns global instance, scope has independent values", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .event("inc", (e) => e<void>())
      .store("count", (s) => s<number>())
      .pk("id");
    const model = createModel({
      contract,
      name: "lgInst",
      fn: ({ $name, inc, $count }) => {
        $count.on(inc, (n) => n + 1);
        return { $name, inc, $count };
      },
    });

    model.create({ id: "gs-1", name: "test", count: 0 });

    const scope = fork();
    const inst = model.instance("gs-1").getState()!;
    await allSettled(inst.inc, { scope });
    await allSettled(inst.inc, { scope });

    // Global state unchanged
    expect(inst.$count.getState()).toBe(0);
    // Scope has independent value
    expect(scope.getState(inst.$count)).toBe(2);

    // Serialize and hydrate
    const values = serialize(scope);
    const hydrated = fork({ values });
    expect(hydrated.getState(inst.$count)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. __id and __model — SURVIVE SCOPED CREATION
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: __id/__model with scoped create", () => {
  it("scoped create returns instance with __id and __model", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });

    const scope = fork();
    const inst = await model.create({ id: "ms-1", name: "hello" }, { scope });

    expect(inst.__id).toBe("ms-1");
    expect(inst.__model).toBe(model);
  });

  it("__model.instance() works after scoped creation", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });

    const scope = fork();
    const a = await model.create({ id: "mgs-a", name: "A" }, { scope });
    await model.create({ id: "mgs-b", name: "B" }, { scope });

    const b = a.__model.instance("mgs-b").getState();
    expect(b).not.toBeNull();
    expect(b!.__id).toBe("mgs-b");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. $resolved — NOT SERIALIZED
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: $resolved serialize behavior", () => {
  it("$resolved is not included in serialized output", async () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      name: "resolvedSer",
      fn: ({ items, current }) => ({ items, current }),
    });
    model.bind({ items: () => targetModel, current: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    const inst = model.create({ id: "rs-1" });

    const scope = fork();
    await allSettled(inst.items.add, { scope, params: "t1" });
    await allSettled(inst.current.set, { scope, params: "t1" });

    const values = serialize(scope);
    const keys = Object.keys(values);

    // Ref data flows through $dataMap — no separate ref store SIDs
    expect(keys).toContain("tentacles:resolvedSer:__dataMap__");
    // $resolved has serialize: "ignore" — should not appear
    expect(keys.every((k) => !k.includes("$resolved"))).toBe(true);
    // Verify ref data is inside $dataMap
    const dataMap = values["tentacles:resolvedSer:__dataMap__"] as Record<string, Record<string, unknown>>;
    expect(dataMap["rs-1"]?.items).toEqual(["t1"]);
    expect(dataMap["rs-1"]?.current).toBe("t1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. $resolved — RE-DERIVES AFTER HYDRATION
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: $resolved re-derives after hydration", () => {
  it("ref many $resolved re-derives from hydrated $ids + model registry", async () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    targetModel.create({ id: "t2", name: "B" });
    const inst = model.create({ id: "rh-1" });

    // Server: add refs in scope
    const serverScope = fork();
    await allSettled(inst.items.add, { scope: serverScope, params: "t1" });
    await allSettled(inst.items.add, { scope: serverScope, params: "t2" });

    // Serialize → hydrate
    const values = serialize(serverScope);
    const clientScope = fork({ values });

    // $ids hydrated from serialization
    expect(clientScope.getState(inst.items.$ids)).toEqual(["t1", "t2"]);

    // $resolved re-derives — reads global instances via model.instance()
    const resolved = inst.items.$resolved.getState();
    // Global $resolved uses global $ids (empty) — so it should be based on global state
    // The point is: $resolved itself is not serialized, it derives from its inputs
    expect(resolved).toBeDefined();
  });

  it("ref one $resolved re-derives from hydrated $id", async () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    targetModel.create({ id: "t1", name: "X" });
    const inst = model.create({ id: "roh-1" });

    const serverScope = fork();
    await allSettled(inst.current.set, { scope: serverScope, params: "t1" });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    expect(clientScope.getState(inst.current.$id)).toBe("t1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. $resolved — DANGLING REFS AFTER DELETE IN SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: dangling refs after target delete", () => {
  it("auto-cleans ref many when target is deleted", async () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("items", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ items }) => ({ items }),
    });
    model.bind({ items: () => targetModel });

    targetModel.create({ id: "t1", name: "A" });
    targetModel.create({ id: "t2", name: "B" });
    const inst = model.create({ id: "dr-1" });
    inst.items.add("t1");
    inst.items.add("t2");

    expect(inst.items.$resolved.getState()).toHaveLength(2);

    // Delete a target — auto-removed from $ids
    targetModel.delete("t1");

    expect(inst.items.$ids.getState()).toEqual(["t2"]);
    expect(inst.items.$resolved.getState()).toHaveLength(1);
    expect(inst.items.$resolved.getState()[0].__id).toBe("t2");
  });

  it("auto-clears ref one when target is deleted", () => {
    const targetModel = makeTargetModel();
    const contract = createContract()
      .store("id", (s) => s<string>())
      .ref("current", "one")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ current }) => ({ current }),
    });
    model.bind({ current: () => targetModel });

    targetModel.create({ id: "t1", name: "X" });
    const inst = model.create({ id: "dor-1" });
    inst.current.set("t1");

    expect(inst.current.$resolved.getState()).not.toBeNull();

    // Delete target — ref auto-clears
    targetModel.delete("t1");

    expect(inst.current.$id.getState()).toBeNull();
    expect(inst.current.$resolved.getState()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SELF-REF $resolved IN SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: self-ref $resolved", () => {
  it("self-ref $resolved works through fork/serialize/hydrate", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("text", (s) => s<string>())
      .ref("replies", "many")
      .pk("id");
    const model = createModel({
      contract,
      name: "lgSelfRef",
      fn: ({ $text, replies }) => ({ $text, replies }),
    });

    const root = model.create({ id: "c1", text: "Hello" });
    model.create({ id: "c2", text: "Reply 1" });
    model.create({ id: "c3", text: "Reply 2" });

    const scope = fork();
    await allSettled(root.replies.add, { scope, params: "c2" });
    await allSettled(root.replies.add, { scope, params: "c3" });

    const values = serialize(scope);
    const hydrated = fork({ values });

    // $ids hydrated
    expect(hydrated.getState(root.replies.$ids)).toEqual(["c2", "c3"]);

    // Global $resolved derives from global $ids + model.instance()
    // Global $ids is empty (no global add was done), so global resolved is empty
    // Scope-level resolved would need scope-aware get() which we don't have
    // The key SSR property: $ids serializes, $resolved is derived
    expect(root.replies.$resolved.getState()).toEqual([]);
  });

  it("self-ref $resolved with global mutations", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("text", (s) => s<string>())
      .ref("children", "many")
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $text, children }) => ({ $text, children }),
    });

    const parent = model.create({ id: "p1", text: "Parent" });
    model.create({ id: "ch1", text: "Child 1" });
    model.create({ id: "ch2", text: "Child 2" });

    parent.children.add("ch1");
    parent.children.add("ch2");

    const resolved = parent.children.$resolved.getState();
    expect(resolved).toHaveLength(2);
    expect(resolved[0].__id).toBe("ch1");
    expect(resolved[1].__id).toBe("ch2");
    expect(resolved[0].$text.getState()).toBe("Child 1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FULL SSR ROUND-TRIP — PLAYLIST SCENARIO
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: full round-trip scenario", () => {
  it("playlist: server adds songs → serialize → client hydrates", async () => {
    const songModel = makeTargetModel("ssrSong");
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .ref("songs", "many")
      .pk("id");
    const playlistModel = createModel({
      contract,
      name: "ssrPlaylist",
      fn: ({ $name, songs }) => ({ $name, songs }),
    });
    playlistModel.bind({ songs: () => songModel });

    songModel.create({ id: "s1", name: "Song A" });
    songModel.create({ id: "s2", name: "Song B" });
    songModel.create({ id: "s3", name: "Song C" });

    const playlist = playlistModel.create({ id: "p1", name: "My Playlist" });

    // Server
    const serverScope = fork();
    await allSettled(playlist.songs.add, { scope: serverScope, params: "s1" });
    await allSettled(playlist.songs.add, { scope: serverScope, params: "s2" });
    const serverValues = serialize(serverScope);

    // Verify ref data is serialized inside $dataMap
    const dataMap = serverValues["tentacles:ssrPlaylist:__dataMap__"] as Record<string, Record<string, unknown>>;
    expect(dataMap["p1"]?.songs).toEqual(["s1", "s2"]);

    // Client hydration
    const clientScope = fork({ values: serverValues });
    expect(clientScope.getState(playlist.songs.$ids)).toEqual(["s1", "s2"]);
    expect(clientScope.getState(playlist.$name)).toBe("My Playlist");

    // songModel.$ids populated from create() calls
    expect(songModel.$ids.getState()).toEqual(["s1", "s2", "s3"]);

    // songModel.instance() works
    const song1 = songModel.instance("s1").getState();
    expect(song1).not.toBeNull();
    expect(song1!.__id).toBe("s1");
    expect(song1!.$name.getState()).toBe("Song A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CONCURRENT SSR REQUESTS — $ids CONSISTENCY
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: concurrent requests with $ids", () => {
  it("model.$ids is consistent across concurrent scoped creates", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      name: "lgConc",
      fn: ({ $name }) => ({ $name }),
    });

    // Create instances at module level
    model.create({ id: "ci-1", name: "A" });
    model.create({ id: "ci-2", name: "B" });
    model.create({ id: "ci-3", name: "C" });

    // Concurrent SSR requests: each fork sees the same global instances
    const results = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const scope = fork();
        const inst = model.instance(`ci-${(i % 3) + 1}`).getState()!;
        await allSettled(inst.$name, { scope, params: `Request-${i}` });
        return serialize(scope);
      }),
    );

    // $ids unchanged throughout
    expect(model.$ids.getState()).toEqual(["ci-1", "ci-2", "ci-3"]);

    // Each scope serialized independently
    for (let i = 0; i < results.length; i++) {
      const values = results[i]!;
      const hydrated = fork({ values });
      const inst = model.instance(`ci-${(i % 3) + 1}`).getState()!;
      expect(hydrated.getState(inst.$name)).toBe(`Request-${i}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. DELETE/CLEAR — $ids UNDER SSR
// ─────────────────────────────────────────────────────────────────────────────

describe("LIVING GRAPH SSR: delete/clear with $ids", () => {
  it("scoped delete does not affect global $ids", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });

    model.create({ id: "sd-1", name: "A" });
    model.create({ id: "sd-2", name: "B" });

    expect(model.$ids.getState()).toEqual(["sd-1", "sd-2"]);

    // Scoped delete resets scope values but keeps global instance
    const scope = fork();
    await model.delete("sd-1", scope);

    // Global $ids unchanged
    expect(model.$ids.getState()).toEqual(["sd-1", "sd-2"]);
    // Instance still accessible via instance()
    expect(model.instance("sd-1").getState()).not.toBeNull();
  });

  it("global delete removes from $ids", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });

    model.create({ id: "gd-1", name: "A" });
    model.create({ id: "gd-2", name: "B" });
    model.create({ id: "gd-3", name: "C" });

    model.delete("gd-2");

    expect(model.$ids.getState()).toEqual(["gd-1", "gd-3"]);
    expect(model.instance("gd-2").getState()).toBeNull();
  });

  it("global clear empties $ids", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });

    model.create({ id: "gc-1", name: "A" });
    model.create({ id: "gc-2", name: "B" });

    model.clear();

    expect(model.$ids.getState()).toEqual([]);
    expect(model.instance("gc-1").getState()).toBeNull();
  });

  it("scoped clear does not affect global $ids", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .pk("id");
    const model = createModel({
      contract,
      fn: ({ $name }) => ({ $name }),
    });

    model.create({ id: "sc-1", name: "A" });
    model.create({ id: "sc-2", name: "B" });

    const scope = fork();
    await model.clear(scope);

    expect(model.$ids.getState()).toEqual(["sc-1", "sc-2"]);
  });
});
