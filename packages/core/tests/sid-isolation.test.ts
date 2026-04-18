import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { fork } from "effector";
import { counterModel, captureWarnings } from "./helpers";

describe("scoped SIDs are isolated from global registry", () => {
  it("global create does NOT warn after a scoped instance with same ID is dropped", async () => {
    const model = counterModel();
    const { warnings, restore } = captureWarnings();

    try {
      {
        const scope = fork();
        await model.create({ id: "leaked", count: 0 }, { scope });
      }

      global.gc?.();
      warnings.length = 0;

      model.create({ id: "leaked", count: 0 });

      const dupWarnings = warnings.filter((w) => w.includes("Duplicate SID"));
      expect(dupWarnings.length).toBe(0);

      model.clear();
    } finally {
      restore();
    }
  });

  it("100 scoped SSR requests do NOT pollute global SID registry", async () => {
    const model = counterModel();
    const { warnings, restore } = captureWarnings();

    try {
      for (let i = 0; i < 100; i++) {
        const scope = fork();
        await model.create({ id: `req-${i}`, count: 0 }, { scope });
      }

      global.gc?.();
      warnings.length = 0;

      model.create({ id: "req-0", count: 0 });

      const dupWarnings = warnings.filter((w) => w.includes("Duplicate SID"));
      expect(dupWarnings.length).toBe(0);

      model.clear();
    } finally {
      restore();
    }
  });
});

describe("cross-model SID tracking uses refcounting", () => {
  it("per-instance event prepends have no SID so no cross-model collision warnings", () => {
    const contract1 = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("bump", (e) => e<void>())
      .pk("id");
    const model1 = createModel({ contract: contract1, fn: ({ $value, bump }) => ({ $value, bump }) });

    const contract2 = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("bump", (e) => e<void>())
      .pk("id");
    const model2 = createModel({ contract: contract2, fn: ({ $value, bump }) => ({ $value, bump }) });

    const contract3 = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("bump", (e) => e<void>())
      .pk("id");
    const model3 = createModel({ contract: contract3, fn: ({ $value, bump }) => ({ $value, bump }) });

    const { warnings, restore } = captureWarnings();

    try {
      model1.create({ id: "shared", value: 1 });

      warnings.length = 0;
      model2.create({ id: "shared", value: 2 });
      // Per-instance events are prepends (no SID) — no collision possible
      expect(warnings.some((w) => w.includes("Duplicate SID"))).toBe(false);

      model1.delete("shared");

      warnings.length = 0;
      model3.create({ id: "shared", value: 3 });
      // Still no collision — prepends have no SID
      expect(warnings.some((w) => w.includes("Duplicate SID"))).toBe(false);

      model2.clear();
      model3.clear();
    } finally {
      restore();
    }
  });
});

describe("per-scope SID tracking", () => {
  it("same model+ID in different scopes does NOT warn", async () => {
    const model = counterModel();
    const { warnings, restore } = captureWarnings();

    try {
      const scope1 = fork();
      const scope2 = fork();

      await model.create({ id: "x", count: 0 }, { scope: scope1 });
      expect(warnings.filter((w) => w.includes("Duplicate SID")).length).toBe(0);

      warnings.length = 0;
      await model.create({ id: "x", count: 0 }, { scope: scope2 });
      expect(warnings.filter((w) => w.includes("Duplicate SID")).length).toBe(0);

      model.clear();
    } finally {
      restore();
    }
  });

  it("global + scoped with same ID does NOT warn", async () => {
    const model = counterModel();
    const { warnings, restore } = captureWarnings();

    try {
      model.create({ id: "shared", count: 0 });
      expect(warnings.filter((w) => w.includes("Duplicate SID")).length).toBe(0);

      warnings.length = 0;
      const scope = fork();
      await model.create({ id: "shared", count: 0 }, { scope });
      expect(warnings.filter((w) => w.includes("Duplicate SID")).length).toBe(0);

      model.clear();
    } finally {
      restore();
    }
  });

  it("SSR simulation: 20 per-request scoped creates produce ZERO warnings", async () => {
    const model = counterModel();
    const { warnings, restore } = captureWarnings();

    try {
      for (let i = 0; i < 20; i++) {
        const scope = fork();
        await model.create({ id: "page-counter", count: 0 }, { scope });
      }

      const dupWarnings = warnings.filter((w) => w.includes("Duplicate SID"));
      expect(dupWarnings.length).toBe(0);
    } finally {
      restore();
    }
  });

  it("two unnamed models with same ID in the SAME scope do NOT warn (prepends have no SID)", async () => {
    const contract1 = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("bump", (e) => e<void>())
      .pk("id");
    const model1 = createModel({ contract: contract1, fn: ({ $value, bump }) => ({ $value, bump }) });

    const contract2 = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("bump", (e) => e<void>())
      .pk("id");
    const model2 = createModel({ contract: contract2, fn: ({ $value, bump }) => ({ $value, bump }) });

    const { warnings, restore } = captureWarnings();

    try {
      const scope = fork();

      await model1.create({ id: "iso-collision", value: 1 }, { scope });
      expect(warnings.filter((w) => w.includes("Duplicate SID")).length).toBe(0);

      warnings.length = 0;
      await model2.create({ id: "iso-collision", value: 2 }, { scope });
      // Per-instance events are prepends (no SID) — no collision possible
      expect(warnings.some((w) => w.includes("Duplicate SID"))).toBe(false);

      model1.clear();
      model2.clear();
    } finally {
      restore();
    }
  });
});
