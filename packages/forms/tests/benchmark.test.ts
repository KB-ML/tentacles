import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";
import { buildField } from "../src/runtime/build-field";
import type { FormFieldDescriptor } from "../src/contract/form-contract-descriptors";

// ─── Helpers ────────────────────────────────────────────────────────────────

function timer(label: string, fn: () => void): number {
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  console.log(`  [${label}] ${ms.toFixed(2)}ms`);
  return ms;
}

function makeDesc(defaultVal: unknown = ""): FormFieldDescriptor {
  return {
    kind: "field",
    defaultValue: defaultVal,
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
  };
}

// ─── Contract Building ──────────────────────────────────────────────────────

describe("BENCH: contract building", () => {
  it("100 fields — chain build time", () => {
    const ms = timer("100 .field() calls", () => {
      let c = createFormContract() as any;
      for (let i = 0; i < 100; i++) {
        c = c.field(`f${i}`, (f: any) => f().default(""));
      }
    });
    expect(ms).toBeLessThan(50);
  });

  it("500 fields — chain build time", () => {
    const ms = timer("500 .field() calls", () => {
      let c = createFormContract() as any;
      for (let i = 0; i < 500; i++) {
        c = c.field(`f${i}`, (f: any) => f().default(""));
      }
    });
    expect(ms).toBeLessThan(200);
  });
});

// ─── Field Creation ─────────────────────────────────────────────────────────

describe("BENCH: field creation", () => {
  it("100 fields — buildField time", () => {
    const ms = timer("100 buildField()", () => {
      for (let i = 0; i < 100; i++) {
        buildField(makeDesc(), { path: [`f${i}`], makeSid: (s) => `b:${s}` });
      }
    });
    expect(ms).toBeLessThan(100);
  });

  it("500 fields — buildField time", () => {
    const ms = timer("500 buildField()", () => {
      for (let i = 0; i < 500; i++) {
        buildField(makeDesc(), { path: [`f${i}`], makeSid: (s) => `b:${s}` });
      }
    });
    expect(ms).toBeLessThan(500);
  });
});

// ─── Proxy Materialization ──────────────────────────────────────────────────

describe("BENCH: proxy materialization", () => {
  it("50 fields — first access (lazy materialization)", () => {
    let c = createFormContract() as any;
    for (let i = 0; i < 50; i++) {
      c = c.field(`f${i}`, (f: any) => f().default(""));
    }
    const ctx = createFormRuntimeContext("bench", c, {});
    const form = createFormShapeProxy(c, [], ctx) as any;

    const ms = timer("50 field first access", () => {
      for (let i = 0; i < 50; i++) {
        void form[`f${i}`];
      }
    });
    expect(ms).toBeLessThan(100);
  });

  it("50 fields — cached access (second access)", () => {
    let c = createFormContract() as any;
    for (let i = 0; i < 50; i++) {
      c = c.field(`f${i}`, (f: any) => f().default(""));
    }
    const ctx = createFormRuntimeContext("bench", c, {});
    const form = createFormShapeProxy(c, [], ctx) as any;

    // First access to materialize
    for (let i = 0; i < 50; i++) void form[`f${i}`];

    const ms = timer("50 field cached access × 100", () => {
      for (let j = 0; j < 100; j++) {
        for (let i = 0; i < 50; i++) {
          void form[`f${i}`];
        }
      }
    });
    expect(ms).toBeLessThan(50);
  });

  it("$values aggregate — 50 fields", () => {
    let c = createFormContract() as any;
    for (let i = 0; i < 50; i++) {
      c = c.field(`f${i}`, (f: any) => f().default(`val${i}`));
    }
    const ctx = createFormRuntimeContext("bench", c, {});
    const form = createFormShapeProxy(c, [], ctx) as any;

    const ms = timer("$values first access (50 fields)", () => {
      void form.$values.getState();
    });
    expect(ms).toBeLessThan(100);
  });
});

// ─── Form Array Operations ──────────────────────────────────────────────────

describe("BENCH: form array operations", () => {
  function setupArray(fieldCount: number) {
    let row = createFormContract() as any;
    for (let i = 0; i < fieldCount; i++) {
      row = row.field(`f${i}`, (f: any) => f().default(""));
    }
    const contract = createFormContract().array("items", row);
    const ctx = createFormRuntimeContext("bench", contract, {});
    const form = createFormShapeProxy(contract, [], ctx) as any;
    return form;
  }

  it("append 100 rows × 5 fields", () => {
    const form = setupArray(5);
    const ms = timer("100 appends (5 fields/row)", () => {
      for (let i = 0; i < 100; i++) {
        form.items.append({ f0: `r${i}` });
      }
    });
    expect(ms).toBeLessThan(2000);
  });

  it("append 50 rows × 10 fields", () => {
    const form = setupArray(10);
    const ms = timer("50 appends (10 fields/row)", () => {
      for (let i = 0; i < 50; i++) {
        form.items.append({ f0: `r${i}` });
      }
    });
    expect(ms).toBeLessThan(2000);
  });

  it("move operation on 100 rows", () => {
    const form = setupArray(3);
    for (let i = 0; i < 100; i++) form.items.append({});

    const ms = timer("100 moves on 100 rows", () => {
      for (let i = 0; i < 100; i++) {
        form.items.move({ from: 0, to: 99 });
      }
    });
    expect(ms).toBeLessThan(500);
  });

  it("swap operation on 100 rows", () => {
    const form = setupArray(3);
    for (let i = 0; i < 100; i++) form.items.append({});

    const ms = timer("100 swaps on 100 rows", () => {
      for (let i = 0; i < 100; i++) {
        form.items.swap({ a: 0, b: 99 });
      }
    });
    expect(ms).toBeLessThan(500);
  });

  it("clear 100 rows", () => {
    const form = setupArray(3);
    for (let i = 0; i < 100; i++) form.items.append({});

    const ms = timer("clear 100 rows", () => {
      form.items.clear();
    });
    expect(ms).toBeLessThan(100);
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe("BENCH: validation", () => {
  it("submit with 50 required fields", () => {
    let c = createFormContract() as any;
    for (let i = 0; i < 50; i++) {
      c = c.field(`f${i}`, (f: any) => f().default("").required());
    }
    const vm = createFormViewModel({ name: "bench-valid", contract: c });
    const { shape } = vm.instantiate();
    const form = shape as any;

    const ms = timer("submit (50 required fields, all empty)", () => {
      form.submit();
    });
    expect(ms).toBeLessThan(100);
  });

  it("field change triggers validation — 1000 changes", () => {
    const c = createFormContract()
      .field("name", (f) => f<string>().default("").validate((v) => (v as string).length < 3 ? "short" : null));

    const vm = createFormViewModel({
      name: "bench-change",
      contract: c,
      validate: { mode: "change" },
    });
    const { shape } = vm.instantiate();
    const form = shape as any;

    const ms = timer("1000 field.changed() with validator", () => {
      for (let i = 0; i < 1000; i++) {
        form.name.changed(i % 2 === 0 ? "ab" : "abcd");
      }
    });
    expect(ms).toBeLessThan(200);
  });
});

// ─── createFormViewModel ────────────────────────────────────────────────────

describe("BENCH: createFormViewModel instantiation", () => {
  it("20 fields — instantiate time", () => {
    let c = createFormContract() as any;
    for (let i = 0; i < 20; i++) {
      c = c.field(`f${i}`, (f: any) => f().default("").required());
    }
    const vm = createFormViewModel({ name: "bench-vm", contract: c });

    const ms = timer("instantiate (20 fields)", () => {
      vm.instantiate();
    });
    expect(ms).toBeLessThan(100);
  });

  it("50 fields + 3-level nesting — instantiate time", () => {
    const inner = createFormContract()
      .field("a", (f) => f<string>().default(""))
      .field("b", (f) => f<string>().default(""));

    const middle = createFormContract()
      .field("x", (f) => f<string>().default(""))
      .sub("inner", inner);

    let c = createFormContract() as any;
    for (let i = 0; i < 10; i++) {
      c = c.field(`f${i}`, (f: any) => f().default(""));
    }
    c = c.sub("s1", middle).sub("s2", middle).sub("s3", middle);

    const vm = createFormViewModel({ name: "bench-nested", contract: c });

    const ms = timer("instantiate (10 fields + 3 nested subs × 3 fields)", () => {
      vm.instantiate();
    });
    expect(ms).toBeLessThan(200);
  });

  it("100 instantiate/destroy cycles", () => {
    const c = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("email", (f) => f<string>().default(""));

    const vm = createFormViewModel({ name: "bench-cycle", contract: c });

    const ms = timer("100 instantiate/destroy cycles", () => {
      for (let i = 0; i < 100; i++) {
        const { lifecycle } = vm.instantiate();
        lifecycle.destroy();
      }
    });
    expect(ms).toBeLessThan(500);
  });
});
