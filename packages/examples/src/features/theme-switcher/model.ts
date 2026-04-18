import { createEffect, createEvent, createStore, sample } from "effector";

type Appearance = "light" | "dark";
type ThemeMode = "light" | "dark" | "system";

function getSystemAppearance(): Appearance {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readInitialMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  return (localStorage.getItem("theme") as ThemeMode) ?? "system";
}

function readInitialResolved(): Appearance {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme as Appearance | undefined;
    if (attr === "light" || attr === "dark") return attr;
  }
  return getSystemAppearance();
}

export const $mode = createStore<ThemeMode>(readInitialMode());
export const $resolved = createStore<Appearance>(readInitialResolved());

export const toggled = createEvent<boolean>();

sample({
  clock: toggled,
  fn: (isDark): ThemeMode => (isDark ? "dark" : "light"),
  target: $mode,
});

sample({
  clock: $mode,
  fn: (mode): Appearance => (mode === "system" ? getSystemAppearance() : mode),
  target: $resolved,
});

// --- side-effects ---

const syncDomFx = createEffect((appearance: Appearance) => {
  const el = document.documentElement;
  el.dataset.theme = appearance;
  el.style.colorScheme = appearance;
  el.classList.remove("light", "dark");
  el.classList.add(appearance);
});

const persistFx = createEffect((mode: ThemeMode) => {
  localStorage.setItem("theme", mode);
});

sample({ clock: $resolved, target: syncDomFx });
sample({ clock: $mode, target: persistFx });
