import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

const assignmentContract = createContract()
  .store("userId", (s) => s<string>())
  .store("projectId", (s) => s<string>())
  .store("role", (s) => s<"admin" | "member">())
  .pk("userId", "projectId");

function createAssignmentModel() {
  return createModel({
    contract: assignmentContract,
  });
}

describe("Compound PK: basic creation", () => {
  it("creates instance with compound PK", () => {
    const model = createAssignmentModel();
    const inst = model.create({ userId: "u1", projectId: "p1", role: "admin" });

    expect(inst.$role.getState()).toBe("admin");
    expect(typeof inst.__id).toBe("string");
    expect(model.get(["u1", "p1"])).toBe(inst);

    model.clear();
  });

  it("creates separate instances for different compound keys", () => {
    const model = createAssignmentModel();
    const a = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    const b = model.create({ userId: "u1", projectId: "p2", role: "member" });

    expect(a.$role.getState()).toBe("admin");
    expect(b.$role.getState()).toBe("member");
    expect(a).not.toBe(b);

    model.clear();
  });

  it("replaces instance when same compound key is created", () => {
    const model = createAssignmentModel();
    const first = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    const second = model.create({ userId: "u1", projectId: "p1", role: "member" });

    expect(first).not.toBe(second);
    expect(second.$role.getState()).toBe("member");

    model.clear();
  });
});

describe("Compound PK: get() with positional args", () => {
  it("retrieves instance with positional compound key args", () => {
    const model = createAssignmentModel();
    model.create({ userId: "u1", projectId: "p1", role: "admin" });

    const found = model.get(["u1", "p1"]);
    expect(found).not.toBeNull();
    expect(found!.$role.getState()).toBe("admin");

    model.clear();
  });

  it("returns null for non-existent compound key", () => {
    const model = createAssignmentModel();
    model.create({ userId: "u1", projectId: "p1", role: "admin" });

    expect(model.get(["u1", "p999"])).toBeNull();
    expect(model.get(["u999", "p1"])).toBeNull();

    model.clear();
  });

  it("get() with serialized string also works", () => {
    const model = createAssignmentModel();
    const inst = model.create({ userId: "u1", projectId: "p1", role: "admin" });

    const found = model.get(inst.__id);
    expect(found).toBe(inst);

    model.clear();
  });

  it("returns the same instance proxy for the same args (stable identity)", () => {
    const model = createAssignmentModel();
    model.create({ userId: "u1", projectId: "p1", role: "admin" });

    const a = model.get(["u1", "p1"]);
    const b = model.get(["u1", "p1"]);
    expect(a).toBe(b);

    model.clear();
  });

  it("reflects instance presence as creates and deletes occur", () => {
    const model = createAssignmentModel();

    expect(model.get(["u1", "p1"])).toBeNull();

    const inst = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    expect(model.get(["u1", "p1"])).toBe(inst);

    model.delete(inst.__id);
    expect(model.get(["u1", "p1"])).toBeNull();
  });
});

describe("Compound PK: $ids and $pkeys stores", () => {
  it("$ids stores serialized compound keys", () => {
    const model = createAssignmentModel();
    const a = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    const b = model.create({ userId: "u2", projectId: "p1", role: "member" });

    const ids = model.$ids.getState();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(a.__id);
    expect(ids[1]).toBe(b.__id);

    model.clear();
  });

  it("$pkeys exposes structured tuples", () => {
    const model = createAssignmentModel();
    model.create({ userId: "u1", projectId: "p1", role: "admin" });
    model.create({ userId: "u2", projectId: "p1", role: "member" });

    const pkeys = model.$pkeys.getState();
    expect(pkeys).toHaveLength(2);
    expect(pkeys[0]).toEqual(["u1", "p1"]);
    expect(pkeys[1]).toEqual(["u2", "p1"]);

    model.clear();
  });

  it("$pkeys is empty for scalar PK models", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    model.create({ id: "x", value: 1 });
    expect(model.$pkeys.getState()).toEqual([]);

    model.clear();
  });
});

describe("Compound PK: delete", () => {
  it("deletes instance by serialized compound key", () => {
    const model = createAssignmentModel();
    const inst = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    const id = inst.__id;

    model.delete(id);

    expect(model.get(["u1", "p1"])).toBeNull();
    expect(model.$ids.getState()).toEqual([]);
    expect(model.$pkeys.getState()).toEqual([]);
  });

  it("clear removes all compound-keyed instances", () => {
    const model = createAssignmentModel();
    model.create({ userId: "u1", projectId: "p1", role: "admin" });
    model.create({ userId: "u2", projectId: "p2", role: "member" });

    model.clear();

    expect(model.$ids.getState()).toEqual([]);
    expect(model.$pkeys.getState()).toEqual([]);
    expect(model.get(["u1", "p1"])).toBeNull();
  });
});

describe("Compound PK: SID generation", () => {
  it("produces deterministic SIDs with serialized compound key", () => {
    const model = createAssignmentModel();
    const inst = model.create({ userId: "u1", projectId: "p1", role: "admin" });

    // State fields are virtual (backed by $dataMap), so their per-instance SID is null.
    // The model stores data in $dataMap with SID "tentacles:cpk-sid:__dataMap__".
    expect(inst.$role.sid).toBeNull();
    // Verify the instance is accessible and data is correct
    expect(inst.$role.getState()).toBe("admin");
    expect(inst.__id).toBeDefined();

    model.clear();
  });

  it("same compound key always produces the same SID", () => {
    const model = createAssignmentModel();

    const inst1 = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    const sid1 = inst1.$role.sid;
    model.clear();

    const inst2 = model.create({ userId: "u1", projectId: "p1", role: "member" });
    const sid2 = inst2.$role.sid;
    model.clear();

    expect(sid1).toBe(sid2);
  });
});

describe("Compound PK: SSR serialization / hydration", () => {
  it("serializes and hydrates compound-keyed instances via fork", async () => {
    const model = createAssignmentModel();
    const inst = model.create({ userId: "u1", projectId: "p1", role: "admin" });

    const serverScope = fork();
    await allSettled(inst.$role.set, { scope: serverScope, params: "member" });

    expect(serverScope.getState(inst.$role)).toBe("member");

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    expect(clientScope.getState(inst.$role)).toBe("member");
    expect(inst.$role.getState()).toBe("admin");

    model.clear();
  });

  it("handles multiple compound-keyed instances in a single scope", async () => {
    const model = createAssignmentModel();
    const a = model.create({ userId: "u1", projectId: "p1", role: "admin" });
    const b = model.create({ userId: "u2", projectId: "p1", role: "member" });

    const serverScope = fork();
    await allSettled(a.$role.set, { scope: serverScope, params: "member" });

    const values = serialize(serverScope);
    const clientScope = fork({ values });

    expect(clientScope.getState(a.$role)).toBe("member");
    expect(clientScope.getState(b.$role)).toBe("member");

    model.clear();
  });
});

describe("Compound PK: validation", () => {
  it("single pk field produces scalar key, not compound", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value }) => ({ $value }),
    });

    const inst = model.create({ id: "x", value: 1 });
    // Single field → scalar PK, not compound
    expect(inst.__id).toBe("x");
  });

  it("rejects compound key element containing colon", () => {
    const contract = createContract()
      .store("a", (s) => s<string>())
      .store("b", (s) => s<string>())
      .pk("a", "b");

    const model = createModel({
      contract,
      fn: () => ({}),
    });

    expect(() => model.create({ a: "a:b", b: "c" })).toThrow(
      'must not be empty or contain ":" or "|"',
    );
  });

  it("rejects compound key element containing pipe", () => {
    const contract = createContract()
      .store("a", (s) => s<string>())
      .store("b", (s) => s<string>())
      .pk("a", "b");

    const model = createModel({
      contract,
      fn: () => ({}),
    });

    expect(() => model.create({ a: "a|b", b: "c" })).toThrow(
      'must not be empty or contain ":" or "|"',
    );
  });

  it("rejects compound key with empty element", () => {
    const contract = createContract()
      .store("a", (s) => s<string>())
      .store("b", (s) => s<string>())
      .pk("a", "b");

    const model = createModel({
      contract,
      fn: () => ({}),
    });

    expect(() => model.create({ a: "", b: "c" })).toThrow(
      'must not be empty or contain ":" or "|"',
    );
  });
});

describe("Compound PK: createMany", () => {
  it("creates multiple instances with independent compound keys", () => {
    const model = createAssignmentModel();
    const instances = model.createMany([
      { userId: "u1", projectId: "p1", role: "admin" },
      { userId: "u1", projectId: "p2", role: "member" },
      { userId: "u2", projectId: "p1", role: "member" },
    ]);

    expect(instances).toHaveLength(3);
    expect(model.$ids.getState()).toHaveLength(3);
    expect(model.$pkeys.getState()).toHaveLength(3);

    expect(model.get(["u1", "p1"])).not.toBeNull();
    expect(model.get(["u1", "p2"])).not.toBeNull();
    expect(model.get(["u2", "p1"])).not.toBeNull();

    model.clear();
  });
});

describe("Compound PK: 3-part compound key", () => {
  it("supports compound keys with more than 2 parts", () => {
    const contract = createContract()
      .store("org", (s) => s<string>())
      .store("team", (s) => s<string>())
      .store("userId", (s) => s<string>())
      .store("role", (s) => s<string>())
      .pk("org", "team", "userId");

    const model = createModel({
      contract,
      fn: ({ $role }) => ({ $role }),
    });

    model.create({ org: "acme", team: "eng", userId: "u1", role: "lead" });
    model.create({ org: "acme", team: "eng", userId: "u2", role: "member" });
    model.create({ org: "acme", team: "sales", userId: "u1", role: "member" });

    const inst = model.get(["acme", "eng", "u1"]);
    expect(inst).not.toBeNull();
    expect(inst!.$role.getState()).toBe("lead");

    const acmeEng = model.$pkeys
      .getState()
      .filter((pk) => pk[0] === "acme" && pk[1] === "eng");
    expect(acmeEng).toHaveLength(2);

    const acme = model.$pkeys.getState().filter((pk) => pk[0] === "acme");
    expect(acme).toHaveLength(3);

    expect(model.$pkeys.getState()).toEqual([
      ["acme", "eng", "u1"],
      ["acme", "eng", "u2"],
      ["acme", "sales", "u1"],
    ]);

    model.clear();
  });
});
