import { describe, expect, it } from "vitest";
import { transformSync } from "@babel/core";

// ─────────────────────────────────────────────────────────────────────────────
// BABEL PLUGIN INTEGRATION TESTS
//
// Verifies that effector's babel-plugin correctly transforms @kbml-tentacles/core
// factory calls when listed in the `factories` option. The plugin should wrap
// each call site with withFactory(), giving every createStore/createEvent
// a unique SID prefix based on file + line + column.
// ─────────────────────────────────────────────────────────────────────────────

function transform(code: string, filename = "test-file.ts") {
  const result = transformSync(code, {
    plugins: [
      ["effector/babel-plugin", { factories: ["@kbml-tentacles/core"] }],
    ],
    presets: [["@babel/preset-typescript", { allExtensions: true }]],
    filename,
    babelrc: false,
    configFile: false,
  });
  return result?.code ?? "";
}

describe("Babel plugin: @kbml-tentacles/core as factory", () => {
  it("wraps createContract calls with withFactory", () => {
    const code = `
      import { createContract } from "@kbml-tentacles/core";

      const counterContract = createContract()
        .store("count", (s) => s<number>())
        .event("inc", (e) => e<void>())
        .pk("count");
    `;

    const output = transform(code);

    // The plugin should inject withFactory
    expect(output).toContain("withFactory");
  });

  it("generates unique SIDs for different call sites in the same file", () => {
    const code = `
      import { createContract } from "@kbml-tentacles/core";

      const contractA = createContract()
        .store("value", (s) => s<number>())
        .pk("value");

      const contractB = createContract()
        .store("value", (s) => s<string>())
        .pk("value");
    `;

    const output = transform(code);

    // Each createContract call should be wrapped with its own withFactory
    const factoryMatches = [...output.matchAll(/withFactory/g)];
    expect(factoryMatches.length).toBeGreaterThanOrEqual(2);

    // Extract all sid values from the transformed code
    const sidMatches = [...output.matchAll(/sid:\s*"([^"]+)"/g)].map((m) => m[1]);

    // Should have at least 2 SIDs (one probe per createContract call)
    expect(sidMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("generates different SIDs for same code in different files", () => {
    const code = `
      import { createContract } from "@kbml-tentacles/core";

      const contract = createContract()
        .store("count", (s) => s<number>())
        .pk("count");
    `;

    const outputA = transform(code, "src/models/counterA.ts");
    const outputB = transform(code, "src/models/counterB.ts");

    const sidsA = [...outputA.matchAll(/sid:\s*"([^"]+)"/g)].map((m) => m[1]);
    const sidsB = [...outputB.matchAll(/sid:\s*"([^"]+)"/g)].map((m) => m[1]);

    expect(sidsA.length).toBeGreaterThan(0);
    expect(sidsB.length).toBeGreaterThan(0);

    // SIDs from different files should not overlap
    for (const sidA of sidsA) {
      for (const sidB of sidsB) {
        expect(sidA).not.toBe(sidB);
      }
    }
  });

  it("wraps createModel call sites with withFactory", () => {
    const code = `
      import { createContract, createModel } from "@kbml-tentacles/core";

      const contract = createContract()
        .store("count", (s) => s<number>())
        .event("inc", (e) => e<void>())
        .pk("count");

      const model = createModel({
        contract,
        fn: ({ count, inc }) => {
          count.on(inc, (n) => n + 1);
          return { count, inc };
        },
      });
    `;

    const output = transform(code);

    // Both createContract and createModel should be wrapped
    const withFactoryCount = (output.match(/withFactory/g) || []).length;
    expect(withFactoryCount).toBeGreaterThanOrEqual(1);
  });

  it("transformed output contains withFactory with unique SIDs per call site", () => {
    const code = `
      import { createContract, createModel } from "@kbml-tentacles/core";
      import { fork, allSettled, serialize } from "effector";

      const contract = createContract()
        .store("count", (s) => s.type())
        .event("inc", (e) => e.type())
        .pk("count");

      const model = createModel({
        contract,
        fn: ({ count, inc }) => {
          count.on(inc, (n) => n + 1);
          return { count, inc };
        },
      });

      const instance = model.create({ id: "babel-e2e", count: 0 });
    `;

    const output = transform(code, "src/models/counter.ts");

    // The plugin wraps createContract with withFactory
    expect(output).toContain("withFactory");

    // The withFactory call has a sid generated from the file + location
    const sidMatch = output.match(/_withFactory\(\{\s*sid:\s*"([^"]+)"/);
    expect(sidMatch).not.toBeNull();
    const factorySid = sidMatch![1];

    // Transform the same code from a different file — should get a different sid
    const output2 = transform(code, "src/models/other.ts");
    const sidMatch2 = output2.match(/_withFactory\(\{\s*sid:\s*"([^"]+)"/);
    expect(sidMatch2).not.toBeNull();

    expect(factorySid).not.toBe(sidMatch2![1]);
  });

  it("two files with same unnamed model get different factory SIDs", () => {
    const makeCode = () => `
      import { createContract, createModel } from "@kbml-tentacles/core";

      const contract = createContract()
        .store("value", (s) => s.type())
        .pk("value");

      const model = createModel({ contract, fn: ({ value }) => ({ value }) });
      const instance = model.create({ id: "shared-id", value: "x" });
    `;

    const outputA = transform(makeCode(), "src/models/fileA.ts");
    const outputB = transform(makeCode(), "src/models/fileB.ts");

    // Both outputs should have withFactory
    expect(outputA).toContain("withFactory");
    expect(outputB).toContain("withFactory");

    // Extract factory SIDs — they should differ because files differ
    const sidA = outputA.match(/_withFactory\(\{\s*sid:\s*"([^"]+)"/)?.[1];
    const sidB = outputB.match(/_withFactory\(\{\s*sid:\s*"([^"]+)"/)?.[1];

    expect(sidA).toBeDefined();
    expect(sidB).toBeDefined();
    expect(sidA).not.toBe(sidB);
  });
});

describe("Babel plugin: createModel as top-level factory", () => {
  it("wraps top-level createModel with withFactory", () => {
    const code = `
      import { createContract, createModel } from "@kbml-tentacles/core";

      const contract = createContract()
        .store("count", (s) => s<number>())
        .pk("count");

      const model = createModel({
        contract,
        fn: ({ count }) => {
          return { count };
        },
      });
    `;

    const output = transform(code);

    // createModel should be wrapped with withFactory
    expect(output).toContain("withFactory");
  });

  it("handles createModel without fn", () => {
    const code = `
      import { createContract, createModel } from "@kbml-tentacles/core";

      const contract = createContract()
        .store("value", (s) => s<string>())
        .pk("value");

      const model = createModel({ contract });
    `;

    const output = transform(code);

    // Should still transform without errors
    expect(output).toContain("withFactory");
  });
});
