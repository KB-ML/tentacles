import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  minify: true,
  treeshake: true,
  clean: true,
  esbuildOptions(options) {
    options.legalComments = "none";
  },
  external: ["@kbml-tentacles/forms", "valibot"],
});
