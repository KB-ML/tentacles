import type { ViewModelDefinition } from "@kbml-tentacles/core";
import { createEvent, createStore, type EventCallable, type StoreWritable } from "effector";
import { type JSX, onCleanup, onMount, createEffect as solidEffect } from "solid-js";
import { getViewContext } from "./each";

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

// ═══ <View> ═══

export interface ViewProps<Shape = unknown> {
  model: ViewModelDefinition<Shape>;
  props?: () => Record<string, unknown>;
  children?: JSX.Element;
}

export function View<Shape>(viewProps: ViewProps<Shape>): JSX.Element {
  const definition = viewProps.model;
  const descriptors = definition.getPropDescriptors() as Record<string, Desc>;

  const getProps = viewProps.props ?? (() => ({}) as Record<string, unknown>);
  const initialProps = getProps();

  const callbackRefs: Record<string, unknown> = {};
  const { units, storeSetters } = createPropUnits(descriptors, initialProps, callbackRefs);

  const instance = definition.instantiate(units);

  // Sync props reactively
  solidEffect(() => {
    const props = getProps();
    for (const [key, desc] of Object.entries(descriptors)) {
      if (desc.kind === "store") {
        storeSetters[key]?.(props[key]);
      } else {
        callbackRefs[key] = props[key];
      }
    }
  });

  // Lifecycle
  onMount(() => instance.lifecycle.mount());
  onCleanup(() => {
    instance.lifecycle.unmount();
    instance.lifecycle.destroy();
  });

  // Provide shape via context
  const ViewCtx = getViewContext(definition);
  const shapeAccessor = () => instance.shape;

  return <ViewCtx.Provider value={shapeAccessor}>{viewProps.children}</ViewCtx.Provider>;
}
