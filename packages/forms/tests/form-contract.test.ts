import { describe, expect, it } from "vitest";
import { createFormContract, FormContractError } from "../index";

describe("createFormContract", () => {
  it("registers a field via .field()", () => {
    const contract = createFormContract()
      .field("email", (f) => f<string>().default(""));

    expect(contract.hasEntity("email")).toBe(true);
    expect(contract.entityNames()).toEqual(["email"]);

    const desc = contract.getEntity("email");
    expect(desc?.kind).toBe("field");
  });

  it("registers multiple fields with correct descriptors", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().required())
      .field("age", (f) => f<number>().default(0))
      .field("bio", (f) => f<string>().optional());

    expect(contract.entityNames()).toEqual(["name", "age", "bio"]);

    const nameDesc = contract.getFieldDescriptors()["name"]!;
    expect(nameDesc.required.flag).toBe(true);

    const ageDesc = contract.getFieldDescriptors()["age"]!;
    expect(ageDesc.hasDefault).toBe(true);
    expect(ageDesc.defaultValue).toBe(0);

    const bioDesc = contract.getFieldDescriptors()["bio"]!;
    expect(bioDesc.isOptional).toBe(true);
  });

  it("registers a sub-form via .sub() with value", () => {
    const address = createFormContract()
      .field("street", (f) => f<string>())
      .field("zip", (f) => f<string>());

    const contract = createFormContract()
      .field("name", (f) => f<string>())
      .sub("address", address);

    expect(contract.hasEntity("address")).toBe(true);
    const desc = contract.getSubDescriptors()["address"]!;
    expect(desc.kind).toBe("sub");
    expect(desc.isThunk).toBe(false);
    expect(desc.contract).toBe(address);
  });

  it("registers a sub-form via .sub() with thunk", () => {
    const contract: any = createFormContract()
      .field("label", (f) => f<string>())
      .sub("child", () => contract);

    const desc = contract.getSubDescriptors()["child"]!;
    expect(desc.isThunk).toBe(true);
    expect(typeof desc.contract).toBe("function");
  });

  it("registers an array via .array() with options", () => {
    const row = createFormContract()
      .field("sku", (f) => f<string>());

    const contract = createFormContract()
      .array("items", row, { min: 1, max: { value: 100, message: "Too many" } });

    expect(contract.hasEntity("items")).toBe(true);
    const desc = contract.getArrayDescriptors()["items"]!;
    expect(desc.kind).toBe("array");
    expect(desc.min).toBe(1);
    expect(desc.max).toEqual({ value: 100, message: "Too many" });
  });

  it("registers a cross-field validator via .validate()", () => {
    const contract = createFormContract()
      .field("password", (f) => f<string>())
      .field("confirm", (f) => f<string>())
      .validate((values) => {
        if ((values as any).password !== (values as any).confirm) {
          return [{ path: ["confirm"], message: "Must match" }];
        }
        return null;
      });

    expect(contract.getCrossValidators()).toHaveLength(1);
  });

  it("throws on duplicate field names", () => {
    expect(() =>
      createFormContract()
        .field("email", (f) => f<string>())
        .field("email" as any, (f) => f<string>()),
    ).toThrow(FormContractError);
  });

  it("throws on field/sub name collision", () => {
    const sub = createFormContract().field("x", (f) => f<string>());
    expect(() =>
      createFormContract()
        .field("addr", (f) => f<string>())
        .sub("addr" as any, sub),
    ).toThrow(FormContractError);
  });

  it("throws on reserved names", () => {
    expect(() =>
      createFormContract().field("$values" as any, (f) => f<string>()),
    ).toThrow("reserved");

    expect(() =>
      createFormContract().field("submit" as any, (f) => f<string>()),
    ).toThrow("reserved");

    expect(() =>
      createFormContract().field("__path" as any, (f) => f<string>()),
    ).toThrow("reserved");
  });

  it("throws on names with dots or colons", () => {
    expect(() =>
      createFormContract().field("a.b" as any, (f) => f<string>()),
    ).toThrow("'.'");

    expect(() =>
      createFormContract().field("a:b" as any, (f) => f<string>()),
    ).toThrow("':'");
  });

  it("throws on empty name", () => {
    expect(() =>
      createFormContract().field("" as any, (f) => f<string>()),
    ).toThrow("empty");
  });

  it(".merge() combines two contracts", () => {
    const a = createFormContract()
      .field("name", (f) => f<string>());

    const b = createFormContract()
      .field("email", (f) => f<string>());

    const merged = createFormContract()
      .field("id", (f) => f<number>())
      .merge(b);

    expect(merged.hasEntity("id")).toBe(true);
    expect(merged.hasEntity("email")).toBe(true);
  });

  it(".merge() throws on collision", () => {
    const a = createFormContract()
      .field("name", (f) => f<string>());

    const b = createFormContract()
      .field("name", (f) => f<string>());

    expect(() => a.merge(b)).toThrow("collision");
  });

  it("getEntity returns correct kind for each entity type", () => {
    const sub = createFormContract().field("x", (f) => f<string>());
    const row = createFormContract().field("y", (f) => f<string>());

    const contract = createFormContract()
      .field("name", (f) => f<string>())
      .sub("address", sub)
      .array("items", row);

    expect(contract.getEntity("name")?.kind).toBe("field");
    expect(contract.getEntity("address")?.kind).toBe("sub");
    expect(contract.getEntity("items")?.kind).toBe("array");
    expect(contract.getEntity("nonexistent")).toBeUndefined();
  });

  it("callable f<T>() syntax works", () => {
    // This test validates the callable pattern compiles and runs
    const contract = createFormContract()
      .field("count", (f) => f<number>().default(0))
      .field("label", (f) => f<string>());

    const countDesc = contract.getFieldDescriptors()["count"]!;
    expect(countDesc.hasDefault).toBe(true);
    expect(countDesc.defaultValue).toBe(0);

    const labelDesc = contract.getFieldDescriptors()["label"]!;
    expect(labelDesc.hasDefault).toBe(false);
  });
});
