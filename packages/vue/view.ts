import type { ViewModelDefinition } from "@kbml-tentacles/core";
import { createEvent, createStore, type EventCallable, type StoreWritable } from "effector";
import { defineComponent, markRaw, onMounted, onUnmounted, provide, ref, watch } from "vue";
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

export const View = defineComponent({
  name: "View",
  props: {
    model: { type: Object, required: true },
    props: { type: [Object, Function], default: undefined },
  },
  setup(componentProps, { slots }) {
    const definition = componentProps.model as ViewModelDefinition<unknown>;
    const descriptors = definition.getPropDescriptors() as Record<string, Desc>;

    const getProps = (
      typeof componentProps.props === "function"
        ? componentProps.props
        : () => componentProps.props ?? {}
    ) as () => Record<string, unknown>;
    const initialProps = getProps();

    const callbackRefs: Record<string, unknown> = {};
    const { units, storeSetters } = createPropUnits(descriptors, initialProps, callbackRefs);

    const instance = definition.instantiate(units);

    watch(
      getProps,
      (props) => {
        for (const [key, desc] of Object.entries(descriptors)) {
          if (desc.kind === "store") {
            storeSetters[key]?.(props[key]);
          } else {
            callbackRefs[key] = props[key];
          }
        }
      },
      { deep: true },
    );

    // Lifecycle
    onMounted(() => instance.lifecycle.mount());
    onUnmounted(() => {
      instance.lifecycle.unmount();
      instance.lifecycle.destroy();
    });

    // Provide shape via context (markRaw prevents Vue proxying effector units)
    const viewKey = getViewContext(definition);
    provide(viewKey, ref(markRaw(instance.shape as Record<string, unknown>)));

    return () => {
      const renderFn = slots.default;
      return renderFn ? renderFn() : null;
    };
  },
});
