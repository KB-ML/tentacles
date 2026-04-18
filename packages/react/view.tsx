import type { ViewModelDefinition, ViewModelInstance } from "@kbml-tentacles/core";
import { createEvent, createStore, type EventCallable, type StoreWritable } from "effector";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { getViewContext } from "./each";
import { cancelTeardown, scheduleTeardown } from "./view-lifecycle";

// ═══ Shared prop unit creation ═══

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

// ═══ <View> ═══

export interface ViewProps<Shape = unknown> {
  model: ViewModelDefinition<Shape>;
  props?: Record<string, unknown>;
  children?: ReactNode;
}

export function View<Shape>({
  model: definition,
  props: rawProps,
  children,
}: ViewProps<Shape>): ReactNode {
  const props = rawProps ?? {};
  const descriptors = definition.getPropDescriptors() as Record<string, Desc>;

  const callbackRefs = useRef<Record<string, unknown>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: instance created once
  const { instance, storeSetters } = useMemo(() => {
    const { units, storeSetters } = createPropUnits(descriptors, props, callbackRefs);
    const instance = definition.instantiate(units);
    return { instance, storeSetters };
  }, [definition]);

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

  const ViewCtx = getViewContext(definition);
  return <ViewCtx.Provider value={instance.shape}>{children}</ViewCtx.Provider>;
}
