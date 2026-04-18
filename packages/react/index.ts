export type { EachProps } from "./each";
export { Each, ScopeStackContext } from "./each";
export type { ModelLike } from "./types";
export { useModel } from "./use-model";
export type { ViewProps } from "./view";
export { View } from "./view";

import type { ViewModelDefinition, ViewModelInstance } from "@kbml-tentacles/core";
import { createEvent, createStore, type EventCallable, type StoreWritable } from "effector";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { cancelTeardown, scheduleTeardown } from "./view-lifecycle";

// ═══ useView ═══
//
// Framework adapter entry point: wraps raw prop values into effector stores
// (for store props) and events (for event props) before handing them to the
// view model's instantiate. Function values passed to event props go through
// a stable ref so the latest callback is always invoked without re-creating
// the instance.

type Desc = { kind: "store" | "event"; isOptional: boolean };

interface PropUnitsResult {
  units: Record<string, StoreWritable<unknown> | EventCallable<unknown>>;
  storeSetters: Record<string, EventCallable<unknown>>;
}

function createPropUnits(
  descriptors: Record<string, Desc>,
  rawProps: Record<string, unknown>,
  callbackRefs: React.MutableRefObject<Record<string, unknown>>,
): PropUnitsResult {
  const units: Record<string, StoreWritable<unknown> | EventCallable<unknown>> = {};
  const storeSetters: Record<string, EventCallable<unknown>> = {};

  for (const [key, desc] of Object.entries(descriptors)) {
    if (desc.kind === "event") {
      const ev = createEvent<unknown>();
      callbackRefs.current[key] = rawProps[key];
      ev.watch((payload) => {
        const fn = callbackRefs.current[key] as ((p: unknown) => void) | undefined;
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

export function useView<Shape>(
  definition: ViewModelDefinition<Shape, any, any, any, any>,
  rawProps?: Record<string, unknown>,
): Shape {
  const props = rawProps ?? {};
  const descriptors = definition.getPropDescriptors() as Record<string, Desc>;

  const callbackRefs = useRef<Record<string, unknown>>({});

  // Create instance once — props intentionally excluded from deps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — instance created once
  const { instance, storeSetters } = useMemo(() => {
    const { units, storeSetters } = createPropUnits(descriptors, props, callbackRefs);
    const instance = definition.instantiate(units);
    return { instance, storeSetters };
  }, [definition]);

  // Sync prop values on every render (before paint)
  useLayoutEffect(() => {
    for (const [key, desc] of Object.entries(descriptors)) {
      if (desc.kind === "event") {
        callbackRefs.current[key] = props[key];
      } else {
        storeSetters[key]?.(props[key]);
      }
    }
  });

  useEffect(() => {
    cancelTeardown(instance as ViewModelInstance<unknown>);
    instance.lifecycle.mount();
    return () => {
      scheduleTeardown(instance as ViewModelInstance<unknown>);
    };
  }, [instance]);

  return instance.shape;
}
