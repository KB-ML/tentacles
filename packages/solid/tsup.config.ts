import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  minify: true,
  // treeshake is intentionally disabled — rollup cannot parse the preserved
  // JSX that esbuild emits in this pipeline. Esbuild's minify step still runs.
  clean: true,
  esbuildOptions(options) {
    // preserve JSX for Solid — consumers compile it with their own Solid transform
    options.jsx = "preserve";
    options.legalComments = "none";
  },
  external: ["effector", "effector-solid", "solid-js", "@kbml-tentacles/core"],
});
