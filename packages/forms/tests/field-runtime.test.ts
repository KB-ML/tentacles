import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize } from "effector";
import { buildField } from "../src/runtime/build-field";
import type { FormFieldDescriptor } from "../src/contract/form-contract-descriptors";

function makeDescriptor(overrides: Partial<FormFieldDescriptor> = {}): FormFieldDescriptor {
  return {
    kind: "field",
    defaultValue: undefined,
    hasDefault: false,
    isFactory: false,
    isOptional: false,
    isDisabled: false,
    syncValidators: [],
    required: { flag: false },
    warnValidators: [],
    asyncValidators: [],
    validateOn: null,
    reValidateOn: null,
    dependsOn: [],
    transform: null,
    resetOn: [],
    ...overrides,
  };
}

function makeSid(suffix: string) {
  return `tentacles:forms:test:${suffix}`;
}

describe("buildField", () => {
  it("creates field with default value", () => {
    const field = buildField<number>(
      makeDescriptor({ hasDefault: true, defaultValue: 42 }),
      { path: ["count"], makeSid },
    );

    expect(field.$value.getState()).toBe(42);
    expect(field.$initial.getState()).toBe(42);
    expect(field.kind).toBe("field");
    expect(field.__path).toEqual(["count"]);
  });

  it("creates field with undefined when no default", () => {
    const field = buildField<string | undefined>(
      makeDescriptor(),
      { path: ["name"], makeSid },
    );

    expect(field.$value.getState()).toBeUndefined();
  });

  it("changed updates $value and $touched", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "" }),
      { path: ["email"], makeSid },
    );

    expect(field.$touched.getState()).toBe(false);
    field.changed("hello@test.com");

    expect(field.$value.getState()).toBe("hello@test.com");
    expect(field.$touched.getState()).toBe(true);
  });

  it("blurred sets $touched", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "" }),
      { path: ["name"], makeSid },
    );

    expect(field.$touched.getState()).toBe(false);
    field.blurred();
    expect(field.$touched.getState()).toBe(true);
  });

  it("$dirty reflects value vs initial", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "original" }),
      { path: ["title"], makeSid },
    );

    expect(field.$dirty.getState()).toBe(false);

    field.changed("modified");
    expect(field.$dirty.getState()).toBe(true);

    field.changed("original");
    expect(field.$dirty.getState()).toBe(false);
  });

  it("$dirty works with objects (deep equality)", () => {
    const field = buildField<{ a: number }>(
      makeDescriptor({ hasDefault: true, defaultValue: { a: 1 } }),
      { path: ["data"], makeSid },
    );

    expect(field.$dirty.getState()).toBe(false);

    field.changed({ a: 2 });
    expect(field.$dirty.getState()).toBe(true);

    field.changed({ a: 1 });
    expect(field.$dirty.getState()).toBe(false);
  });

  it("setError and setWarning update stores", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "" }),
      { path: ["email"], makeSid },
    );

    expect(field.$error.getState()).toBeNull();
    field.setError("Invalid email");
    expect(field.$error.getState()).toBe("Invalid email");

    field.setError(null);
    expect(field.$error.getState()).toBeNull();

    field.setWarning("Looks suspicious");
    expect(field.$warning.getState()).toBe("Looks suspicious");
  });

  it("reset restores to $initial and clears state", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "init" }),
      { path: ["name"], makeSid },
    );

    field.changed("modified");
    field.setError("error");
    field.setWarning("warn");

    expect(field.$value.getState()).toBe("modified");
    expect(field.$touched.getState()).toBe(true);
    expect(field.$error.getState()).toBe("error");
    expect(field.$warning.getState()).toBe("warn");

    field.reset();

    expect(field.$value.getState()).toBe("init");
    expect(field.$touched.getState()).toBe(false);
    expect(field.$error.getState()).toBeNull();
    expect(field.$warning.getState()).toBeNull();
    expect(field.$dirty.getState()).toBe(false);
  });

  it("setValue with config flags", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "" }),
      { path: ["name"], makeSid },
    );

    // shouldTouch defaults to undefined (no touch)
    field.setValue({ value: "hello" });
    expect(field.$value.getState()).toBe("hello");
    expect(field.$touched.getState()).toBe(false);

    // shouldTouch: true
    field.setValue({ value: "world", shouldTouch: true });
    expect(field.$value.getState()).toBe("world");
    expect(field.$touched.getState()).toBe(true);
  });

  it("disabled field starts with correct state", () => {
    const field = buildField<string>(
      makeDescriptor({ hasDefault: true, defaultValue: "", isDisabled: true }),
      { path: ["locked"], makeSid },
    );

    expect(field.$disabled.getState()).toBe(true);
  });

  it("SSR: field stores round-trip via fork/serialize", async () => {
    const field = buildField<number>(
      makeDescriptor({ hasDefault: true, defaultValue: 0 }),
      { path: ["count"], makeSid },
    );

    const scope = fork();
    await allSettled(field.changed, { scope, params: 99 });

    expect(scope.getState(field.$value)).toBe(99);
    expect(scope.getState(field.$touched)).toBe(true);
    expect(scope.getState(field.$dirty)).toBe(true);

    const serialized = serialize(scope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(field.$value)).toBe(99);
    expect(clientScope.getState(field.$touched)).toBe(true);
  });

  it("memory: create many fields without leaking", () => {
    // Warm up
    for (let i = 0; i < 50; i++) {
      buildField<number>(
        makeDescriptor({ hasDefault: true, defaultValue: i }),
        { path: [`warmup${i}`], makeSid: (s) => `w:${i}:${s}` },
      );
    }

    global.gc?.();
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) {
      const field = buildField<number>(
        makeDescriptor({ hasDefault: true, defaultValue: i }),
        { path: [`field${i}`], makeSid: (s) => `t:${i}:${s}` },
      );
      // Touch the field to ensure stores are created
      field.changed(i + 1);
    }

    global.gc?.();
    global.gc?.();
    const heapAfter = process.memoryUsage().heapUsed;

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(15);
  });
});
