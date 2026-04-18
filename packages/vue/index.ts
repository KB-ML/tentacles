export { Each, ScopeStackKey } from "./each";
export type { ModelLike } from "./types";
export { useModel } from "./use-model";
export { View } from "./view";

import type { ViewModelDefinition } from "@kbml-tentacles/core";
import { createEvent, createStore, type EventCallable, type StoreWritable } from "effector";
import { onMounted, onUnmounted, watch } from "vue";

type Desc = { kind: "store" | "event"; isOptional: boolean };

interface PropUnitsResult {
  units: Record<string, StoreWritable<unknown> | EventCallable<unknown>>;
  storeSetters: Record<string, EventCallable<unknown>>;
}

function createPropUnits(
  descriptors: Record<string, Desc>,
  rawProps: Record<string, unknown>,
  callbackRefs: Record<string, unknown>,
): PropUnitsResult {
  const units: Record<string, StoreWritable<unknown> | EventCallable<unknown>> = {};
  const storeSetters: Record<string, EventCallable<unknown>> = {};

  for (const [key, desc] of Object.entries(descriptors)) {
    if (desc.kind === "event") {
      const ev = createEvent<unknown>();
      callbackRefs[key] = rawProps[key];
      ev.watch((payload) => {
        const fn = callbackRefs[key] as ((p: unknown) => void) | undefined;
        fn?.(payload);
      });
      units[key] = ev;
    } else {
      const store = createStore<unknown>(rawProps[key], { skipVoid: false });
      const set = createEvent<unknown>();
      store.on(set, (_, v) => v);
      units[key] = store;
      storeSetters[key] = set;
    }
  }

  return { units, storeSetters };
}

/**
 * Converts a prop event name to a Vue emit event name.
 * "onDelete" → "delete", "onSaveItem" → "save-item"
 */
function toEmitName(propName: string): string {
  const stripped = propName.startsWith("on")
    ? propName[2]?.toLowerCase() + propName.slice(3)
    : propName;
  return stripped.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

type EmitFn = (event: string, ...args: unknown[]) => void;

export function useView<Shape>(
  definition: ViewModelDefinition<Shape, any, any, any, any>,
  rawProps?: () => Record<string, unknown>,
  emit?: EmitFn,
): Shape {
  const descriptors = definition.getPropDescriptors() as Record<string, Desc>;
  const getProps = rawProps ?? (() => ({}) as Record<string, unknown>);
  const initialProps = getProps();

  const callbackRefs: Record<string, unknown> = {};
  const { units, storeSetters } = createPropUnits(descriptors, initialProps, callbackRefs);

  // If emit is provided, re-wire event props to emit instead of callback refs
  if (emit) {
    for (const [key, desc] of Object.entries(descriptors)) {
      if (desc.kind === "event") {
        const event = units[key] as EventCallable<unknown>;
        const emitName = toEmitName(key);
        event.watch((payload) => {
          emit(emitName, payload);
        });
      }
    }
  }

  const instance = definition.instantiate(units);

  // Sync props reactively via Vue watch
  watch(
    getProps,
    (props) => {
      for (const [key, desc] of Object.entries(descriptors)) {
        if (desc.kind === "store") {
          storeSetters[key]?.(props[key]);
        } else if (!emit) {
          callbackRefs[key] = props[key];
        }
      }
    },
    { deep: true },
  );

  // Lifecycle
  onMounted(() => {
    instance.lifecycle.mount();
  });

  onUnmounted(() => {
    instance.lifecycle.destroy();
  });

  return instance.shape;
}
