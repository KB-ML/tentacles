import { describe, expect, it } from "vitest";
import { createPropsContract, PropsContractChainImpl } from "../index";

// ═══════════════════════════════════════════════════════════════════════════════
// createPropsContract factory
// ═══════════════════════════════════════════════════════════════════════════════

describe("createPropsContract", () => {
  it("returns a PropsContractChainImpl instance", () => {
    const chain = createPropsContract();
    expect(chain).toBeInstanceOf(PropsContractChainImpl);
  });

  it("starts with empty descriptors", () => {
    const chain = createPropsContract();
    expect(chain.getDescriptors()).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// .store() — reactive value props
// ═══════════════════════════════════════════════════════════════════════════════

describe("PropsContractChain.store()", () => {
  it("declares a required store prop via callable builder", () => {
    const chain = createPropsContract().store("name", (s) => s<string>());
    const descriptors = chain.getDescriptors();
    expect(descriptors.name).toEqual({ kind: "store", isOptional: false });
  });

  it("declares an optional store prop via .optional()", () => {
    const chain = createPropsContract().store("disabled", (s) => s<boolean>().optional());
    const descriptors = chain.getDescriptors();
    expect(descriptors.disabled).toEqual({ kind: "store", isOptional: true });
  });

  it("throws on duplicate store prop name at runtime", () => {
    const chain = createPropsContract().store("name", (s) => s<string>());
    expect(() =>
      (chain as unknown as PropsContractChainImpl<{}>).store("name", (s) => s<number>()),
    ).toThrow(/already declared/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// .event() — callback props
// ═══════════════════════════════════════════════════════════════════════════════

describe("PropsContractChain.event()", () => {
  it("declares a required event prop via callable builder", () => {
    const chain = createPropsContract().event("onSubmit", (e) => e<string>());
    const descriptors = chain.getDescriptors();
    expect(descriptors.onSubmit).toEqual({ kind: "event", isOptional: false });
  });

  it("declares an optional event prop via .optional()", () => {
    const chain = createPropsContract().event("onChange", (e) => e<number>().optional());
    const descriptors = chain.getDescriptors();
    expect(descriptors.onChange).toEqual({ kind: "event", isOptional: true });
  });

  it("event and store prop names must not collide", () => {
    const chain = createPropsContract().store("click", (s) => s<number>());
    expect(() =>
      (chain as unknown as PropsContractChainImpl<{}>).event("click", (e) => e<void>()),
    ).toThrow(/already declared/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Chaining both kinds
// ═══════════════════════════════════════════════════════════════════════════════

describe("PropsContractChain chained store + event", () => {
  it("chains multiple stores and events", () => {
    const chain = createPropsContract()
      .store("title", (s) => s<string>())
      .store("disabled", (s) => s<boolean>().optional())
      .event("onSave", (e) => e<string>())
      .event("onCancel", (e) => e<void>().optional());

    const descriptors = chain.getDescriptors();
    expect(Object.keys(descriptors)).toEqual(["title", "disabled", "onSave", "onCancel"]);
    expect(descriptors.title).toEqual({ kind: "store", isOptional: false });
    expect(descriptors.disabled).toEqual({ kind: "store", isOptional: true });
    expect(descriptors.onSave).toEqual({ kind: "event", isOptional: false });
    expect(descriptors.onCancel).toEqual({ kind: "event", isOptional: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// .merge() — union composition
// ═══════════════════════════════════════════════════════════════════════════════

describe("PropsContractChain.merge()", () => {
  it("combines two props contracts", () => {
    const a = createPropsContract().store("name", (s) => s<string>());
    const b = createPropsContract().event("onClick", (e) => e<void>());

    const merged = a.merge(b);
    const descriptors = merged.getDescriptors();
    expect(Object.keys(descriptors).sort()).toEqual(["name", "onClick"]);
  });

  it("throws on name collision", () => {
    const a = createPropsContract().store("name", (s) => s<string>());
    const b = createPropsContract().store("name", (s) => s<number>());
    expect(() => a.merge(b)).toThrow(/already exists/);
  });
});


