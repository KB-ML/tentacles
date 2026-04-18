import { clearNode, createStore } from "effector";

export function detectSidRoot(): string | undefined {
  const probe = createStore(null, { sid: "_tentacles_probe_", serialize: "ignore" });
  const sidRoot = probe.sid?.includes("|")
    ? probe.sid.substring(0, probe.sid.lastIndexOf("|"))
    : undefined;
  clearNode(probe, { deep: true });
  return sidRoot;
}
