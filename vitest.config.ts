import { resolve } from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/core/layers/**", "packages/core/index.ts"],
      reporter: ["json-summary"],
      reportsDirectory: "coverage",
    },
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"],
      },
    },
    projects: [
      {
        test: {
          name: "core",
          include: ["packages/core/tests/**/*.test.ts"],
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: "forms",
          include: ["packages/forms/tests/**/*.test.ts"],
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: "forms-adapters",
          include: ["packages/forms-*/tests/**/*.test.ts"],
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: "react",
          environment: "happy-dom",
          include: ["packages/react/tests/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "vue",
          environment: "happy-dom",
          include: ["packages/vue/tests/**/*.test.{ts,tsx}"],
        },
      },
      {
        plugins: [solid()],
        resolve: {
          conditions: ["browser", "development"],
          alias: {
            "solid-js/web": resolve("node_modules/solid-js/web/dist/dev.js"),
            "solid-js": resolve("node_modules/solid-js/dist/dev.js"),
          },
        },
        test: {
          name: "solid",
          environment: "happy-dom",
          include: ["packages/solid/tests/**/*.test.{ts,tsx}"],
          server: {
            deps: {
              inline: [/solid-js/, /@solidjs\/testing-library/, /effector-solid/],
            },
          },
        },
      },
    ],
  },
});
