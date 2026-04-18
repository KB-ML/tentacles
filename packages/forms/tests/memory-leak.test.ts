import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";
import { buildField } from "../src/runtime/build-field";
import type { FormFieldDescriptor } from "../src/contract/form-contract-descriptors";

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

function makeDescriptor(overrides: Partial<FormFieldDescriptor> = {}): FormFieldDescriptor {
  return {
    kind: "field",
    defaultValue: "",
    hasDefault: true,
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

describe("memory: form VMs", () => {
  it("create/destroy 500 form VMs — bounded heap growth", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("email", (f) => f<string>().default(""))
      .field("age", (f) => f<number>().default(0));

    // Warm up
    for (let i = 0; i < 20; i++) {
      const vm = createFormViewModel({ name: `warmup${i}`, contract });
      const { shape, lifecycle } = vm.instantiate();
      (shape as any).name.changed("test");
      lifecycle.destroy();
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      const vm = createFormViewModel({ name: `leak${i}`, contract });
      const { shape, lifecycle } = vm.instantiate();
      (shape as any).name.changed(`value-${i}`);
      (shape as any).email.changed(`email-${i}@test.com`);
      lifecycle.destroy();
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(15);
  });
});

describe("memory: fields", () => {
  it("create 1000 fields — bounded heap growth", () => {
    // Warm up
    for (let i = 0; i < 50; i++) {
      buildField(makeDescriptor(), {
        path: [`w${i}`],
        makeSid: (s) => `w:${i}:${s}`,
      });
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 1000; i++) {
      const field = buildField<string>(makeDescriptor(), {
        path: [`f${i}`],
        makeSid: (s) => `m:${i}:${s}`,
      });
      field.changed("value");
      field.setError("error");
      field.reset();
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(20);
  });
});

describe("memory: form shape proxy", () => {
  it("proxy with 50 fields — bounded heap growth", () => {
    // Build a big contract
    let c = createFormContract() as any;
    for (let i = 0; i < 50; i++) {
      c = c.field(`field${i}`, (f: any) => f().default(""));
    }

    // Warm up
    for (let j = 0; j < 5; j++) {
      const ctx = createFormRuntimeContext(`proxy-warmup-${j}`, c, {});
      const form = createFormShapeProxy(c, [], ctx) as any;
      for (let i = 0; i < 50; i++) {
        form[`field${i}`].changed("x");
      }
    }

    const heapBefore = measureHeap();

    for (let j = 0; j < 100; j++) {
      const ctx = createFormRuntimeContext(`proxy-test-${j}`, c, {});
      const form = createFormShapeProxy(c, [], ctx) as any;
      // Access all fields
      for (let i = 0; i < 50; i++) {
        form[`field${i}`].changed("y");
      }
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(30);
  });
});

describe("memory: form arrays", () => {
  it("create/remove 200 array rows — bounded heap growth", () => {
    const rowContract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("qty", (f) => f<number>().default(1));

    const contract = createFormContract()
      .array("items", rowContract);

    const ctx = createFormRuntimeContext("array-mem", contract, {});
    const form = createFormShapeProxy(contract, [], ctx) as any;

    // Warm up
    for (let i = 0; i < 20; i++) {
      form.items.append({ name: `warmup-${i}` });
    }
    form.items.clear();

    const heapBefore = measureHeap();

    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 20; i++) {
        form.items.append({ name: `row-${cycle}-${i}` });
      }
      form.items.clear();
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(15);
  });
});
