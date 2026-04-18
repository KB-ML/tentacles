import { describe, expect, it } from "vitest";
import { pick, omit, partial, required } from "@kbml-tentacles/core";
import { createFormContract } from "../index";

// =============================================================================
// PICK: basic
// =============================================================================

describe("form contract pick: basic", () => {
  it("picks only named fields", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("age", (f) => f<number>().default(0))
      .field("email", (f) => f<string>().default(""));

    const picked = pick(contract, "name", "email");

    expect(picked.hasEntity("name")).toBe(true);
    expect(picked.hasEntity("email")).toBe(true);
    expect(picked.hasEntity("age")).toBe(false);
  });

  it("picks sub-form entities", () => {
    const address = createFormContract()
      .field("street", (f) => f<string>().default(""))
      .field("city", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const picked = pick(contract, "address");
    expect(picked.hasEntity("address")).toBe(true);
    expect(picked.hasEntity("name")).toBe(false);
  });

  it("picks array entities", () => {
    const row = createFormContract().field("value", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("title", (f) => f<string>().default(""))
      .array("items", row);

    const picked = pick(contract, "items");
    expect(picked.hasEntity("items")).toBe(true);
    expect(picked.hasEntity("title")).toBe(false);
  });

  it("preserves cross-validators", () => {
    const contract = createFormContract()
      .field("password", (f) => f<string>().default(""))
      .field("confirm", (f) => f<string>().default(""))
      .validate((values) => {
        if (values.password !== values.confirm) return "Passwords must match";
        return null;
      });

    const picked = pick(contract, "password", "confirm");
    expect(picked.getCrossValidators()).toHaveLength(1);
  });

  it("preserves field descriptors exactly", () => {
    const contract = createFormContract()
      .field("email", (f) =>
        f<string>()
          .default("")
          .required("Email required")
          .validate((v) => (v.includes("@") ? null : "Invalid")),
      );

    const picked = pick(contract, "email");
    const desc = picked.getFieldDescriptors().email!;

    expect(desc.required.flag).toBe(true);
    expect(desc.required.message).toBe("Email required");
    expect(desc.syncValidators).toHaveLength(1);
    expect(desc.hasDefault).toBe(true);
    expect(desc.defaultValue).toBe("");
  });
});

// =============================================================================
// OMIT: basic
// =============================================================================

describe("form contract omit: basic", () => {
  it("removes named fields", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("age", (f) => f<number>().default(0))
      .field("email", (f) => f<string>().default(""));

    const omitted = omit(contract, "age");

    expect(omitted.hasEntity("name")).toBe(true);
    expect(omitted.hasEntity("email")).toBe(true);
    expect(omitted.hasEntity("age")).toBe(false);
  });

  it("removes sub-form entities", () => {
    const address = createFormContract()
      .field("street", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const omitted = omit(contract, "address");
    expect(omitted.hasEntity("name")).toBe(true);
    expect(omitted.hasEntity("address")).toBe(false);
  });

  it("removes array entities", () => {
    const row = createFormContract().field("value", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("title", (f) => f<string>().default(""))
      .array("items", row);

    const omitted = omit(contract, "items");
    expect(omitted.hasEntity("title")).toBe(true);
    expect(omitted.hasEntity("items")).toBe(false);
  });

  it("validates dependsOn references", () => {
    const contract = createFormContract()
      .field("mode", (f) => f<string>().default("a"))
      .field("value", (f) => f<string>().default("").dependsOn("mode"));

    expect(() => omit(contract, "mode")).toThrow("dependsOn");
  });

  it("dropDangling removes invalid dependsOn", () => {
    const contract = createFormContract()
      .field("mode", (f) => f<string>().default("a"))
      .field("value", (f) => f<string>().default("").dependsOn("mode"));

    const omitted = omit(contract, "mode", { dropDangling: true });
    expect(omitted.hasEntity("value")).toBe(true);
    expect(omitted.hasEntity("mode")).toBe(false);

    const desc = omitted.getFieldDescriptors().value!;
    expect(desc.dependsOn).toEqual([]);
  });
});

// =============================================================================
// PARTIAL / REQUIRED: not supported for form contracts
// =============================================================================

describe("form contract partial/required: throws", () => {
  it("partial throws for form contracts", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""));

    expect(() => partial(contract)).toThrow("not supported");
  });

  it("required throws for form contracts", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""));

    expect(() => required(contract)).toThrow("not supported");
  });
});

// =============================================================================
// MEMORY
// =============================================================================

describe("form contract utils: memory", () => {
  it("bounded heap on repeated pick/omit", () => {
    const contract = createFormContract()
      .field("a", (f) => f<string>().default(""))
      .field("b", (f) => f<number>().default(0))
      .field("c", (f) => f<boolean>().default(false));

    // Warm up
    for (let i = 0; i < 100; i++) {
      pick(contract, "a", "b");
      omit(contract, "c");
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      pick(contract, "a", "b");
      omit(contract, "c");
    }
    global.gc?.();
    const after = process.memoryUsage().heapUsed;

    const growth = after - before;
    expect(growth).toBeLessThan(2 * 1024 * 1024);
  });
});
