import { describe, expect, it } from "vitest";
import { createFormContract } from "../index";
import type { FormFieldBuilder } from "../src/contract/form-field-builder";

describe("FormFieldTypedImpl", () => {
  function fieldDesc(name: string, builder: (f: FormFieldBuilder) => any) {
    const contract = (createFormContract() as any).field(name, builder);
    return contract.getFieldDescriptors()[name]!;
  }

  it(".default(staticValue)", () => {
    const desc = fieldDesc("x", (f) => f<number>().default(42));
    expect(desc.hasDefault).toBe(true);
    expect(desc.defaultValue).toBe(42);
    expect(desc.isFactory).toBe(false);
  });

  it(".default(factory)", () => {
    const factory = (data: any) => data.other + 1;
    const desc = fieldDesc("x", (f) => f<number>().default(factory));
    expect(desc.hasDefault).toBe(true);
    expect(desc.isFactory).toBe(true);
    expect(desc.defaultValue).toBe(factory);
  });

  it(".validate(syncValidator)", () => {
    const validator = (v: string) => (v.length > 0 ? null : "required");
    const desc = fieldDesc("x", (f) => f<string>().validate(validator));
    expect(desc.syncValidators).toHaveLength(1);
  });

  it(".validate() multiple validators accumulate", () => {
    const v1 = () => null;
    const v2 = () => null;
    const desc = fieldDesc("x", (f) => f<string>().validate(v1).validate(v2));
    expect(desc.syncValidators).toHaveLength(2);
  });

  it(".required()", () => {
    const desc = fieldDesc("x", (f) => f<string>().required());
    expect(desc.required).toEqual({ flag: true, message: undefined });
  });

  it(".required(message)", () => {
    const desc = fieldDesc("x", (f) => f<string>().required("Field is required"));
    expect(desc.required).toEqual({ flag: true, message: "Field is required" });
  });

  it(".custom(fn)", () => {
    const fn = (v: string) => (v === "ok" ? null : "bad");
    const desc = fieldDesc("x", (f) => f<string>().custom(fn));
    expect(desc.syncValidators).toHaveLength(1);
  });

  it(".warn(validator)", () => {
    const w = (v: string) => (v.length > 10 ? "Too long" : null);
    const desc = fieldDesc("x", (f) => f<string>().warn(w));
    expect(desc.warnValidators).toHaveLength(1);
  });

  it(".validateAsync(fn, opts)", () => {
    const asyncFn = async (v: string) => null;
    const desc = fieldDesc("x", (f) =>
      f<string>().validateAsync(asyncFn, { debounce: 300, runOn: "change" }),
    );
    expect(desc.asyncValidators).toHaveLength(1);
    expect(desc.asyncValidators[0]!.debounce).toBe(300);
    expect(desc.asyncValidators[0]!.runOn).toBe("change");
  });

  it(".validateAsync() without opts", () => {
    const asyncFn = async (v: string) => null;
    const desc = fieldDesc("x", (f) => f<string>().validateAsync(asyncFn));
    expect(desc.asyncValidators).toHaveLength(1);
    expect(desc.asyncValidators[0]!.debounce).toBeUndefined();
  });

  it(".validateOn(mode)", () => {
    const desc = fieldDesc("x", (f) => f<string>().validateOn("blur"));
    expect(desc.validateOn).toBe("blur");
  });

  it(".reValidateOn(mode)", () => {
    const desc = fieldDesc("x", (f) => f<string>().reValidateOn("change"));
    expect(desc.reValidateOn).toBe("change");
  });

  it(".dependsOn(path)", () => {
    const desc = fieldDesc("x", (f) => f<string>().dependsOn("password"));
    expect(desc.dependsOn).toEqual(["password"]);
  });

  it(".dependsOn(paths[])", () => {
    const desc = fieldDesc("x", (f) => f<string>().dependsOn(["a", "b"]));
    expect(desc.dependsOn).toEqual(["a", "b"]);
  });

  it(".transform({ parse, format })", () => {
    const desc = fieldDesc("x", (f) =>
      f<number>().transform({
        parse: (dom: string) => Number(dom),
        format: (val: number) => String(val),
      }),
    );
    expect(desc.transform).not.toBeNull();
    expect(desc.transform!.parse("42")).toBe(42);
    expect(desc.transform!.format(42)).toBe("42");
  });

  it(".optional()", () => {
    const desc = fieldDesc("x", (f) => f<string>().optional());
    expect(desc.isOptional).toBe(true);
  });

  it(".disabled()", () => {
    const desc = fieldDesc("x", (f) => f<string>().disabled());
    expect(desc.isDisabled).toBe(false);
  });

  it(".disabled(true)", () => {
    const desc = fieldDesc("x", (f) => f<string>().disabled(true));
    expect(desc.isDisabled).toBe(true);
  });

  it(".resetOn(event)", () => {
    const desc = fieldDesc("x", (f) => f<string>().resetOn("category"));
    expect(desc.resetOn).toEqual(["category"]);
  });

  it(".resetOn(events[])", () => {
    const desc = fieldDesc("x", (f) => f<string>().resetOn(["a", "b"]));
    expect(desc.resetOn).toEqual(["a", "b"]);
  });

  it("full chain — all methods compose", () => {
    const desc = fieldDesc("x", (f) =>
      f<string>()
        .default("")
        .required("Required")
        .validate((v) => (v.length > 0 ? null : "empty"))
        .warn((v) => (v.length > 100 ? "Very long" : null))
        .validateAsync(async (v) => null, { debounce: 200 })
        .validateOn("change")
        .reValidateOn("blur")
        .dependsOn("other")
        .resetOn("category"),
    );

    expect(desc.hasDefault).toBe(true);
    expect(desc.defaultValue).toBe("");
    expect(desc.required.flag).toBe(true);
    expect(desc.syncValidators).toHaveLength(1);
    expect(desc.warnValidators).toHaveLength(1);
    expect(desc.asyncValidators).toHaveLength(1);
    expect(desc.validateOn).toBe("change");
    expect(desc.reValidateOn).toBe("blur");
    expect(desc.dependsOn).toEqual(["other"]);
    expect(desc.resetOn).toEqual(["category"]);
  });
});
