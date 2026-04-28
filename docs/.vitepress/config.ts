import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";
import { generateSidebar } from "vitepress-sidebar";
import type { SidebarItem } from "vitepress-sidebar/types";

export default defineConfig({
  title: "Tentacles",
  description: "Type-safe dynamic model factory for effector",
  base: process.env.DOCS_BASE ?? "/tentacles/",
  ignoreDeadLinks: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo-light.svg" }]],

  vite: {
    plugins: [
      ...llmstxt({
        excludeUnnecessaryFiles: false,
        excludeIndexPage: false,
      }),
    ],
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

    sidebar: [
      ...(generateSidebar({
        documentRootPath: "/docs",

        includeRootIndexFile: false,
        includeFolderIndexFile: false,

        useFolderLinkFromIndexFile: true,
        useFolderTitleFromIndexFile: true,

        useTitleFromFileHeading: true,
        useTitleFromFrontmatter: true,

        collapsed: true,
        collapseDepth: 1,
      }) as SidebarItem[]),
      {
        text: "LLMS",
        collapsed: true,
        items: [
          { text: "TOC docs", link: "/tentacles/llms.txt" },
          { text: "Full docs", link: "/tentacles/llms-full.txt" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/example/tentacles" }],

    search: {
      provider: "local",
    },

    outline: "deep",
  },
});
