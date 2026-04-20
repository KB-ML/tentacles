import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { defineConfig } from "vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";

function generateBadge(label: string, value: string, color: string, outPath: string) {
  const labelWidth = Math.round(label.length * 6.5 + 12);
  const valueWidth = Math.round(value.length * 6.5 + 12);
  const totalWidth = labelWidth + valueWidth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
  writeFileSync(outPath, svg);
}

const showcaseSnippets: Record<string, { lang: string; code: string }> = {
  contracts: {
    lang: "typescript",
    code: `const userContract = createContract()
  .store("name", (s) => s<string>())
  .store("age", (s) => s<number>().default(0))
  .event("rename", (e) => e<string>())
  .derived("isAdult", (s) =>
    s.$age.map((a) => a >= 18)
  )
  .ref("posts", "many")
  .pk("name")`,
  },
  models: {
    lang: "typescript",
    code: `const userModel = createModel({
  contract: userContract,
  name: "user",
  fn: ({ $name, rename, $age }, _) => {
    $name.on(rename, (_, next) => next)
    return { $name, rename, $age }
  },
})

userModel.create({ name: "Alice", age: 25 })
userModel.create({ name: "Bob" }) // age defaults to 0

userModel.$count     // Store<number> → 2
userModel.$ids       // Store<string[]>
userModel.get(id)    // Instance | null`,
  },
  queries: {
    lang: "typescript",
    code: `import { gte, eq, includes } from "@kbml-tentacles/core"

const adults = userModel.query()
  .where("age", gte(18))
  .where("role", eq("admin"))
  .orderBy("name", "asc")
  .limit($pageSize)

adults.$ids        // Store<ModelInstanceId[]>
adults.$list       // Store<Row[]> — plain data rows
adults.$count      // Store<number>
adults.$totalCount // Store<number> — before pagination

const byRole = userModel.query().groupBy("role")
byRole.$groups     // Store<Map<string, Row[]>>`,
  },
  viewmodels: {
    lang: "typescript",
    code: `const todoViewContract = createViewContract()
  .store("search", (s) => s<string>().default(""))
  .store("page", (s) => s<number>()
    .default(0).resetOn("search"))

const todoViewProps = createPropsContract()
  .store("pageSize", (s) => s<number>().optional())
  .event("onDelete", (e) => e<string>())

const todoView = createViewModel({
  contract: todoViewContract,
  props: todoViewProps,
  fn: (stores, { mounted, props }) => {
    sample({ clock: mounted, target: loadFx })
    return { ...stores, onDelete: props.onDelete }
  },
})`,
  },
  frameworks: {
    lang: "tsx",
    code: `// React
function TodoApp(props) {
  const { $search, $page } = useView(todoView, props)
  return <SearchInput />
}

// Vue — emit events are auto-wired
const { $search, $page } = useView(
  todoView, () => props, emit
)

// Solid
const { $search, $page } = useView(
  todoView, () => props
)

// Iterate model instances
<Each model={userModel} source={userModel.$ids}>
  {(user) => <Card />}
</Each>`,
  },
};

function showcaseHighlightPlugin() {
  const virtualId = "virtual:showcase-code";
  const resolvedId = "\0" + virtualId;

  return {
    name: "tentacles-showcase-highlight",
    resolveId(id: string) {
      if (id === virtualId) return resolvedId;
    },
    async load(id: string) {
      if (id !== resolvedId) return;
      const { createHighlighter } = await import("shiki");
      const highlighter = await createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: ["typescript", "tsx"],
      });

      const result: Record<string, string> = {};
      for (const [key, { lang, code }] of Object.entries(showcaseSnippets)) {
        result[key] = highlighter.codeToHtml(code, {
          lang,
          themes: { dark: "github-dark", light: "github-light" },
          defaultColor: false,
        });
      }
      highlighter.dispose();

      return `export default ${JSON.stringify(result)}`;
    },
  };
}

function badgesPlugin() {
  const root = resolve(__dirname, "../..");
  const publicDir = resolve(__dirname, "../public");

  return {
    name: "tentacles-badges",
    buildStart() {
      const bundlePath = resolve(root, "packages/core/dist/index.js");
      if (existsSync(bundlePath)) {
        const bytes = gzipSync(readFileSync(bundlePath)).length;
        const kb = (bytes / 1024).toFixed(1);
        const color =
          bytes < 20480
            ? "#22c55e"
            : bytes < 30720
              ? "#a3a61d"
              : bytes < 51200
                ? "#dfb317"
                : "#fe7d37";
        generateBadge("min+gzip", `${kb} kB`, color, resolve(publicDir, "badge-size.svg"));
        console.log(`[badges] size: ${kb} kB`);
      }

      const coveragePath = resolve(root, "coverage/coverage-summary.json");
      if (existsSync(coveragePath)) {
        const pct = JSON.parse(readFileSync(coveragePath, "utf-8")).total.lines.pct;
        const color =
          pct >= 90 ? "#22c55e" : pct >= 75 ? "#a3a61d" : pct >= 50 ? "#dfb317" : "#e5534b";
        generateBadge("coverage", `${pct}%`, color, resolve(publicDir, "badge-coverage.svg"));
        console.log(`[badges] coverage: ${pct}%`);
      }
    },
  };
}

export default defineConfig({
  title: "Tentacles",
  description: "Type-safe dynamic model factory for effector",
  base: process.env.DOCS_BASE ?? "/tentacles/",
  ignoreDeadLinks: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo-light.svg" }]],

  vite: {
    plugins: [showcaseHighlightPlugin(), badgesPlugin()],
  },

  markdown: {
    config(md) {
      md.use(tabsMarkdownPlugin);
      const defaultFenceRender = md.renderer.rules.fence;
      if (defaultFenceRender) {
        md.renderer.rules.fence = (tokens, idx, options, env, self) => {
          const rendered = defaultFenceRender(tokens, idx, options, env, self);
          return rendered.replace(/<pre(?=[\s>])/g, "<pre v-pre");
        };
      }
      const defaultInlineCode = md.renderer.rules.code_inline;
      if (defaultInlineCode) {
        md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
          const rendered = defaultInlineCode(tokens, idx, options, env, self);
          return rendered.replace(/^<code(?=[\s>])/, "<code v-pre");
        };
      }
    },
  },

  themeConfig: {
    logo: { light: "/tentacles-light.svg", dark: "/tentacles-dark.svg" },

    nav: [
      { text: "Tutorials", link: "/tutorials/" },
      { text: "How-to", link: "/how-to/" },
      { text: "Reference", link: "/reference/" },
      { text: "Explanation", link: "/explanation/" },
    ],

    sidebar: {
      "/tutorials/": [
        {
          text: "Tutorials",
          items: [
            { text: "Overview", link: "/tutorials/" },
            { text: "Your first model (core)", link: "/tutorials/your-first-model" },
            { text: "A React todo app", link: "/tutorials/react-todo-app" },
            { text: "A Vue todo app", link: "/tutorials/vue-todo-app" },
            { text: "A Solid todo app", link: "/tutorials/solid-todo-app" },
            { text: "Your first form", link: "/tutorials/your-first-form" },
          ],
        },
      ],
      "/how-to/": [
        {
          text: "How-to guides",
          items: [
            { text: "Overview", link: "/how-to/" },
            { text: "Define a contract", link: "/how-to/define-a-contract" },
            { text: "Handle field constraints", link: "/how-to/handle-field-constraints" },
            { text: "Relate models with refs", link: "/how-to/relate-models-with-refs" },
            { text: "Query a collection", link: "/how-to/query-a-collection" },
            { text: "Build a view model", link: "/how-to/build-a-view-model" },
            { text: "Compose contracts", link: "/how-to/compose-contracts" },
            { text: "Enable SSR", link: "/how-to/enable-ssr" },
            { text: "Integrate with React", link: "/how-to/integrate-with-react" },
            { text: "Integrate with Vue", link: "/how-to/integrate-with-vue" },
            { text: "Integrate with Solid", link: "/how-to/integrate-with-solid" },
          ],
        },
        {
          text: "Forms",
          collapsed: false,
          items: [
            { text: "Define a form contract", link: "/how-to/define-a-form-contract" },
            { text: "Add sync validation", link: "/how-to/add-sync-validation" },
            { text: "Add async validation", link: "/how-to/add-async-validation" },
            { text: "Use a schema validator", link: "/how-to/use-schema-validator" },
            { text: "Work with form arrays", link: "/how-to/work-with-form-arrays" },
            { text: "Cross-field validation", link: "/how-to/cross-field-validation" },
            { text: "Handle submission", link: "/how-to/handle-submission" },
            { text: "Reset and keep state", link: "/how-to/reset-and-keep-state" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [{ text: "Overview", link: "/reference/" }],
        },
        {
          text: "@kbml-tentacles/core",
          collapsed: false,
          items: [
            { text: "Package overview", link: "/reference/core/" },
            { text: "createContract", link: "/reference/core/create-contract" },
            { text: "createViewContract", link: "/reference/core/create-view-contract" },
            { text: "createPropsContract", link: "/reference/core/create-props-contract" },
            { text: "Field builders", link: "/reference/core/field-builders" },
            { text: "Contract utilities", link: "/reference/core/contract-utilities" },
            { text: "createModel", link: "/reference/core/create-model" },
            { text: "Model", link: "/reference/core/model" },
            { text: "ModelInstance", link: "/reference/core/model-instance" },
            { text: "Ref APIs", link: "/reference/core/ref-api" },
            { text: "createViewModel", link: "/reference/core/create-view-model" },
            { text: "ViewModelDefinition", link: "/reference/core/view-model-definition" },
            { text: "CollectionQuery", link: "/reference/core/collection-query" },
            { text: "GroupedQuery", link: "/reference/core/grouped-query" },
            { text: "QueryField", link: "/reference/core/query-field" },
            { text: "Operators", link: "/reference/core/operators" },
            { text: "Helpers", link: "/reference/core/helpers" },
            { text: "Types", link: "/reference/core/types" },
          ],
        },
        {
          text: "@kbml-tentacles/react",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/react/" },
            { text: "useView", link: "/reference/react/use-view" },
            { text: "useModel", link: "/reference/react/use-model" },
            { text: "View", link: "/reference/react/view" },
            { text: "Each", link: "/reference/react/each" },
          ],
        },
        {
          text: "@kbml-tentacles/vue",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/vue/" },
            { text: "useView", link: "/reference/vue/use-view" },
            { text: "useModel", link: "/reference/vue/use-model" },
            { text: "View", link: "/reference/vue/view" },
            { text: "Each", link: "/reference/vue/each" },
          ],
        },
        {
          text: "@kbml-tentacles/solid",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/solid/" },
            { text: "useView", link: "/reference/solid/use-view" },
            { text: "useModel", link: "/reference/solid/use-model" },
            { text: "View", link: "/reference/solid/view" },
            { text: "Each", link: "/reference/solid/each" },
          ],
        },
        {
          text: "@kbml-tentacles/forms",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/forms/" },
            { text: "createFormContract", link: "/reference/forms/create-form-contract" },
            { text: "FormContractChain", link: "/reference/forms/form-contract-chain" },
            { text: "Field builder", link: "/reference/forms/field-builder" },
            { text: "createFormViewModel", link: "/reference/forms/create-form-view-model" },
            { text: "FormShape", link: "/reference/forms/form-shape" },
            { text: "Field", link: "/reference/forms/field" },
            { text: "FormArrayShape", link: "/reference/forms/form-array-shape" },
            { text: "FormRowShape", link: "/reference/forms/form-row-shape" },
            { text: "Validators", link: "/reference/forms/validators" },
            { text: "Validation modes", link: "/reference/forms/validation-modes" },
            { text: "Types", link: "/reference/forms/types" },
          ],
        },
        {
          text: "@kbml-tentacles/forms-react",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/forms-react/" },
            { text: "useField", link: "/reference/forms-react/use-field" },
          ],
        },
        {
          text: "@kbml-tentacles/forms-vue",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/forms-vue/" },
            { text: "useField", link: "/reference/forms-vue/use-field" },
          ],
        },
        {
          text: "@kbml-tentacles/forms-solid",
          collapsed: true,
          items: [
            { text: "Package overview", link: "/reference/forms-solid/" },
            { text: "useField", link: "/reference/forms-solid/use-field" },
          ],
        },
        {
          text: "Validator adapters",
          collapsed: true,
          items: [
            { text: "forms-zod", link: "/reference/validators/zod" },
            { text: "forms-yup", link: "/reference/validators/yup" },
            { text: "forms-joi", link: "/reference/validators/joi" },
            { text: "forms-valibot", link: "/reference/validators/valibot" },
            { text: "forms-arktype", link: "/reference/validators/arktype" },
          ],
        },
      ],
      "/explanation/": [
        {
          text: "Explanation",
          items: [
            { text: "Overview", link: "/explanation/" },
            { text: "Architecture", link: "/explanation/architecture" },
            { text: "Contracts and runtime", link: "/explanation/contracts-and-runtime" },
            { text: "Field proxies", link: "/explanation/field-proxies" },
            { text: "Lightweight instances", link: "/explanation/lightweight-instances" },
            { text: "Incremental queries", link: "/explanation/incremental-queries" },
            { text: "Strategy pattern for chains", link: "/explanation/strategy-pattern" },
            { text: "SSR, SIDs and scopes", link: "/explanation/ssr-and-sids" },
            { text: "Design decisions", link: "/explanation/design-decisions" },
          ],
        },
        {
          text: "Forms",
          collapsed: false,
          items: [
            { text: "Validation lifecycle", link: "/explanation/validation-lifecycle" },
            { text: "Hidden vs visible errors", link: "/explanation/hidden-visible-errors" },
            { text: "Form arrays as models", link: "/explanation/form-arrays-as-models" },
            { text: "Validator adapter design", link: "/explanation/validator-adapter-design" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/example/tentacles" }],

    search: {
      provider: "local",
    },

    outline: "deep",
  },
});
