<script setup lang="ts">
// @ts-expect-error virtual module generated at build time
import code from "virtual:showcase-code";
import { computed, ref } from "vue";

const tabs = [
  {
    id: "contracts",
    label: "Contracts",
    desc: "Chained builder DSL — stores, events, derived fields, refs, and primary keys. Full TypeScript inference at every step.",
  },
  {
    id: "models",
    label: "Models",
    desc: "Instantiate models with effector wiring. Each instance gets isolated stores with deterministic SIDs. Built-in reactive registry.",
  },
  {
    id: "queries",
    label: "Queries",
    desc: "SQL-like reactive pipeline. All operators accept Store values for dynamic UI. Staged execution — only reruns what changed.",
  },
  {
    id: "viewmodels",
    label: "ViewModels",
    desc: "Component-scoped state with typed props, lifecycle hooks, auto-cleanup on unmount. Compose with .extend() for reuse.",
  },
  {
    id: "frameworks",
    label: "Frameworks",
    desc: "First-class React, Vue, and Solid support. useView() handles prop sync, lifecycle, and cleanup. <Each> for reactive lists.",
  },
];

const activeId = ref("contracts");
const active = computed(() => tabs.find((t) => t.id === activeId.value)!);
</script>

<template>
  <div class="showcase">
    <nav class="showcase-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['showcase-tab', { active: activeId === tab.id }]"
        @click="activeId = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>
    <div class="showcase-panel">
      <p class="showcase-desc">{{ active.desc }}</p>
      <div class="showcase-code" v-html="code[activeId]" />
    </div>
  </div>
</template>

<style scoped>
.showcase {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

@media (max-width: 768px) {
  .showcase {
    grid-template-columns: 1fr;
  }
}

.showcase-nav {
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border-right: 1px solid var(--vp-c-divider);
  padding: 8px 0;
}

@media (max-width: 768px) {
  .showcase-nav {
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--vp-c-divider);
    overflow-x: auto;
    padding: 0;
  }
}

.showcase-tab {
  display: block;
  width: 100%;
  padding: 10px 20px;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  background: none;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.showcase-tab:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.showcase-tab.active {
  color: var(--vp-c-brand-1);
  border-left-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  font-weight: 600;
}

@media (max-width: 768px) {
  .showcase-tab {
    border-left: none;
    border-bottom: 3px solid transparent;
    padding: 12px 16px;
    text-align: center;
  }

  .showcase-tab.active {
    border-bottom-color: var(--vp-c-brand-1);
    border-left-color: transparent;
  }
}

.showcase-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.showcase-desc {
  padding: 16px 20px 0;
  margin: 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.showcase-code {
  margin: 12px 16px 16px;
  overflow: hidden;
  border-radius: 8px;
}

.showcase-code :deep(pre) {
  margin: 0;
  padding: 16px 20px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.65;
  overflow-x: auto;
  background: var(--vp-code-block-bg) !important;
}

/* Apply Shiki dual-theme colors — VitePress scopes to .vp-code, we need .shiki */
html.dark .showcase-code :deep(.shiki span) {
  color: var(--shiki-dark, inherit);
}

html:not(.dark) .showcase-code :deep(.shiki span) {
  color: var(--shiki-light, inherit);
}
</style>
