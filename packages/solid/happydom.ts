import { GlobalWindow } from "happy-dom";

const window = new GlobalWindow();
const win = window as object as Record<string, unknown>;

for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    Object.defineProperty(globalThis, key, {
      value: win[key],
      writable: true,
      configurable: true,
    });
  }
}

Object.defineProperty(globalThis, "window", { value: window, writable: true, configurable: true });
Object.defineProperty(globalThis, "document", {
  value: window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLElement", {
  value: window.HTMLElement,
  writable: true,
  configurable: true,
});
