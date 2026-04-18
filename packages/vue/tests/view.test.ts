import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createContract,
  createModel,
  createPropsContract,
  createViewContract,
  createViewModel,
} from "@kbml-tentacles/core";
import { createEffect, createStore, sample, type Store } from "effector";
import { useUnit } from "effector-vue/composition";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { Each, useModel, useView, View } from "../index";

// ─── Helpers ───

function makeCounterVM() {
  const contract = createContract()
    .store("count", (s) => s<number>().default(0))
    .event("inc", (e) => e<void>())
    .derived("doubled", (s) => s.$count.map((n) => n * 2));

  return createViewModel({
    contract,
    fn: (stores) => {
      stores.$count.on(stores.inc, (n) => n + 1);
      return { $count: stores.$count, inc: stores.inc, $doubled: stores.$doubled };
    },
  });
}

function makePropsVM() {
  const contract = createContract()
    .store("n", (s) => s<number>().default(0));

  return createViewModel({
    contract,
    props: createPropsContract().store("input", (s) => s<number>().optional()),
    fn: (_s, ctx) => {
      return { input: ctx.props.$input }
    },
  })
}

function makeTodoModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>().default(false))
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $title, $done }) => ({ $id, $title, $done }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Basic rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("View basic rendering", () => {
  it("renders slot children and useModel returns shape", async () => {
    const vm = makeCounterVM();

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        const count = useUnit(shape.$count);
        return () => h("span", { "data-testid": "count" }, count.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(View, { model: vm }, { default: () => h(Child) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");
    wrapper.unmount();
  });

  it("useModel returns derived stores from the shape", async () => {
    const vm = makeCounterVM();

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        const doubled = useUnit(shape.$doubled);
        return () => h("span", { "data-testid": "doubled" }, doubled.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(View, { model: vm }, { default: () => h(Child) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="doubled"]').text()).toBe("0");
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Store prop sync
// ═══════════════════════════════════════════════════════════════════════════════

describe("View store prop sync", () => {
  it("changing props on <View> updates shape stores", async () => {
    const vm = makePropsVM();

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        const input = useUnit(shape.input);
        return () => h("span", { "data-testid": "val" }, input.value);
      },
    });

    const Wrapper = defineComponent({
      props: { input: { type: Number, required: true } },
      setup(props) {
        return () =>
          h(View, { model: vm, props: { input: props.input } }, { default: () => h(Child) });
      },
    });

    const wrapper = mount(Wrapper, { props: { input: 5 } });
    await nextTick();
    expect(wrapper.find('[data-testid="val"]').text()).toBe("5");

    await wrapper.setProps({ input: 42 });
    await nextTick();
    expect(wrapper.find('[data-testid="val"]').text()).toBe("42");

    wrapper.unmount();
  });

  it("optional prop is undefined when not provided", async () => {
    const vm = makePropsVM();

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        const input = useUnit(shape.input);
        return () => h("span", { "data-testid": "val" }, input.value ?? "missing");
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(View, { model: vm }, { default: () => h(Child) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="val"]').text()).toBe("missing");
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Event prop callback
// ═══════════════════════════════════════════════════════════════════════════════

describe("View event prop callback", () => {
  it("event prop fires the provided callback", async () => {
    let received: string | null = null;

    const contract = createContract()
      .store("v", (s) => s<string>().default(""));
    const vm = createViewModel({
      contract,
      props: createPropsContract().event("onSubmit", (e) => e<string>().optional()),
      fn: (_s, ctx) => ({ submit: ctx.props.onSubmit }),
    });

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        const submit = useUnit(shape.submit);
        return () =>
          h("button", { "data-testid": "btn", onClick: () => submit("hello") }, "Go");
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              View,
              {
                model: vm,
                props: {
                  onSubmit: (val: string) => {
                    received = val;
                  },
                },
              },
              { default: () => h(Child) },
            );
        },
      }),
    );

    await nextTick();
    await wrapper.find('[data-testid="btn"]').trigger("click");
    await nextTick();
    expect(received).toBe("hello");

    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe("View lifecycle", () => {
  it("mounted and unmounted fire correctly", () => {
    let mounted = false;
    let unmounted = false;

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_s, ctx) => {
        const mountFx = createEffect(() => {
          mounted = true;
        });
        const unmountFx = createEffect(() => {
          unmounted = true;
        });
        sample({ clock: ctx.mounted, target: mountFx });
        sample({ clock: ctx.unmounted, target: unmountFx });
        return {};
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(View, { model: vm }, { default: () => h("div", "alive") });
        },
      }),
    );

    expect(mounted).toBe(true);
    expect(unmounted).toBe(false);

    wrapper.unmount();
    expect(unmounted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. <View> + <Each> nesting
// ═══════════════════════════════════════════════════════════════════════════════

describe("View + Each nesting", () => {
  it("both contexts accessible from nested child", async () => {
    const model = makeTodoModel();
    model.create({ id: "t1", title: "First" });
    model.create({ id: "t2", title: "Second" });

    const contract = createContract()
      .store("label", (s) => s<string>().default(""));
    const vm = createViewModel({
      contract,
      props: createPropsContract().store("header", (s) => s<string>().optional()),
      fn: (_s, ctx) => ({ header: ctx.props.$header }),
    });

    const NestedChild = defineComponent({
      setup() {
        const todo = useModel(model);
        const viewShape = useModel(vm);
        const title = useUnit(todo.$title);
        const header = useUnit(viewShape.header);
        return () =>
          h("div", { "data-testid": "item" }, `${header.value}:${title.value}`);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              View,
              { model: vm, props: { header: "Todos" } },
              {
                default: () =>
                  h(
                    Each as any,
                    { model, source: model.$ids },
                    { default: () => h(NestedChild) },
                  ),
              },
            );
        },
      }),
    );

    await nextTick();
    const items = wrapper.findAll('[data-testid="item"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.text()).toContain("Todos:");
    expect(wrapper.text()).toContain("First");
    expect(wrapper.text()).toContain("Second");

    model.clear();
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Error: useModel(vmDefinition) without <View>
// ═══════════════════════════════════════════════════════════════════════════════

describe("useModel error without View", () => {
  it("throws when useModel(vmDefinition) is called without <View>", () => {
    const vm = makeCounterVM();

    const Bad = defineComponent({
      setup() {
        useModel(vm);
        return () => null;
      },
    });

    expect(() => mount(Bad)).toThrow(/no <View> ancestor/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6b. useView / useModel type inference (compile-time)
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView / useModel type inference", () => {
  it("useView accepts a fully-typed ViewModelDefinition (TS2345 regression)", () => {
    // Reproduces user-reported TS2345 from examples/page.tsx:
    //   Argument of type ViewModelDefinition<Record<string, unknown>,
    //     Record<"route", StoreMeta<Route, true, false, false>>, {}, {}, {}>
    //     is not assignable to parameter of type
    //     ViewModelDefinition<Record<string, unknown>, any, any, any, any>
    //   Types have separate declarations of a private property contract
    type Route = { name: string; params: Record<string, string> };
    const routerContract = createViewContract().store("route", (s) =>
      s<Route>().default({ name: "home", params: {} }),
    );
    const routerViewModel = createViewModel({
      contract: routerContract,
      fn: (stores) => ({ $route: stores.$route, navigate: (_to: string) => {} }),
    });

    const Child = defineComponent({
      setup() {
        const router = useView(routerViewModel);
        expectTypeOf(router).toHaveProperty("$route");
        expectTypeOf(router.$route).toMatchTypeOf<Store<Route>>();
        return () => h("div");
      },
    });

    const wrapper = mount(Child);
    wrapper.unmount();
  });

  it("useView infers shape from contract when no fn is provided", () => {
    // `createViewModel({ contract })` without `fn` should expose the
    // contract's `$`-prefixed stores as the shape, not `Record<string, unknown>`.
    const contract = createViewContract()
      .store("count", (s) => s<number>().default(0))
      .store("label", (s) => s<string>().default(""));
    const vm = createViewModel({ contract });

    const Child = defineComponent({
      setup() {
        const view = useView(vm);
        expectTypeOf(view).toHaveProperty("$count");
        expectTypeOf(view).toHaveProperty("$label");
        expectTypeOf(view.$count).toMatchTypeOf<Store<number>>();
        expectTypeOf(view.$label).toMatchTypeOf<Store<string>>();
        return () => h("div");
      },
    });

    const wrapper = mount(Child);
    wrapper.unmount();
  });

  it("useModel(vmDefinition) preserves a narrow Shape generic", () => {
    // Mirrors the useView regression but through `useModel(vm)` read from
    // a <View> ancestor. The private-field brand previously collapsed the
    // return type whenever the VM's later generics were fully instantiated.
    type Route = { name: string };
    const vm = createViewModel({
      contract: createViewContract().store("route", (s) =>
        s<Route>().default({ name: "home" }),
      ),
      fn: (stores) => ({ $route: stores.$route, navigate: (_to: string) => {} }),
    });

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        expectTypeOf(shape).toHaveProperty("$route");
        expectTypeOf(shape.$route).toMatchTypeOf<Store<Route>>();
        expectTypeOf(shape.navigate).toMatchTypeOf<(to: string) => void>();
        return () => h("div");
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(View, { model: vm }, { default: () => h(Child) });
        },
      }),
    );
    wrapper.unmount();
  });

  it("useModel(vmDefinition) infers shape from contract when no fn is provided", () => {
    const vm = createViewModel({
      contract: createViewContract()
        .store("count", (s) => s<number>().default(0))
        .store("label", (s) => s<string>().default("")),
    });

    const Child = defineComponent({
      setup() {
        const shape = useModel(vm);
        expectTypeOf(shape).toHaveProperty("$count");
        expectTypeOf(shape).toHaveProperty("$label");
        expectTypeOf(shape.$count).toMatchTypeOf<Store<number>>();
        expectTypeOf(shape.$label).toMatchTypeOf<Store<string>>();
        return () => h("div");
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(View, { model: vm }, { default: () => h(Child) });
        },
      }),
    );
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. useModel for models inside Each — basic replacement test
// ═══════════════════════════════════════════════════════════════════════════════

describe("useModel for models inside Each", () => {
  it("deleting and re-creating instance reflects updated data", async () => {
    const model = makeTodoModel();
    model.create({ id: "r1", title: "Original" });

    const Item = defineComponent({
      setup() {
        const todo = useModel(model);
        const title = useUnit(todo.$title);
        return () => h("div", { "data-testid": "title" }, title.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, source: model.$ids }, { default: () => h(Item) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="title"]').text()).toBe("Original");

    model.delete("r1");
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="title"]').exists()).toBe(false);

    model.create({ id: "r1", title: "Replaced" });
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="title"]').text()).toBe("Replaced");

    model.clear();
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. View + useModel deep nesting (no <Each>)
// ═══════════════════════════════════════════════════════════════════════════════

describe("View + useModel deep nesting", () => {
  it("useModel works through intermediate wrapper component", async () => {
    const vm = makeCounterVM();

    const DeepChild = defineComponent({
      setup() {
        const shape = useModel(vm);
        const count = useUnit(shape.$count);
        return () => h("span", { "data-testid": "count" }, count.value);
      },
    });

    const Wrapper = defineComponent({
      setup(_, { slots }) {
        return () => h("div", null, slots.default?.());
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(View, { model: vm }, {
              default: () => h(Wrapper, null, { default: () => h(DeepChild) }),
            });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");
    wrapper.unmount();
  });

  it("useModel works 3 levels deep without <Each>", async () => {
    const vm = makeCounterVM();

    const DeepChild = defineComponent({
      setup() {
        const shape = useModel(vm);
        const count = useUnit(shape.$count);
        return () => h("span", { "data-testid": "count" }, count.value);
      },
    });

    const LevelB = defineComponent({
      setup(_, { slots }) {
        return () => h("div", null, slots.default?.());
      },
    });

    const LevelA = defineComponent({
      setup(_, { slots }) {
        return () => h("section", null, slots.default?.());
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(View, { model: vm }, {
              default: () =>
                h(LevelA, null, {
                  default: () => h(LevelB, null, { default: () => h(DeepChild) }),
                }),
            });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");
    wrapper.unmount();
  });

  it("multiple sibling children can useModel independently", async () => {
    const vm = makeCounterVM();

    const ChildA = defineComponent({
      setup() {
        const shape = useModel(vm);
        const count = useUnit(shape.$count);
        return () => h("span", { "data-testid": "a" }, count.value);
      },
    });

    const ChildB = defineComponent({
      setup() {
        const shape = useModel(vm);
        const count = useUnit(shape.$count);
        return () => h("span", { "data-testid": "b" }, count.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(View, { model: vm }, {
              default: () => [h(ChildA), h(ChildB)],
            });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="a"]').text()).toBe("0");
    expect(wrapper.find('[data-testid="b"]').text()).toBe("0");
    wrapper.unmount();
  });

  it("deep child reacts to shape event updates", async () => {
    const vm = makeCounterVM();

    const DeepChild = defineComponent({
      setup() {
        const shape = useModel(vm);
        const count = useUnit(shape.$count);
        const inc = useUnit(shape.inc);
        return () =>
          h("div", null, [
            h("span", { "data-testid": "count" }, count.value),
            h("button", { "data-testid": "inc", onClick: () => inc() }, "+"),
          ]);
      },
    });

    const Wrapper = defineComponent({
      setup(_, { slots }) {
        return () => h("div", null, slots.default?.());
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(View, { model: vm }, {
              default: () => h(Wrapper, null, { default: () => h(DeepChild) }),
            });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");

    await wrapper.find('[data-testid="inc"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1");

    await wrapper.find('[data-testid="inc"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("2");

    wrapper.unmount();
  });

  it("two separate Views with different VMs work independently", async () => {
    const vm1 = makeCounterVM();
    const vm2 = makeCounterVM();

    const Child1 = defineComponent({
      setup() {
        const shape = useModel(vm1);
        const count = useUnit(shape.$count);
        const inc = useUnit(shape.inc);
        return () =>
          h("div", null, [
            h("span", { "data-testid": "count1" }, count.value),
            h("button", { "data-testid": "inc1", onClick: () => inc() }, "+"),
          ]);
      },
    });

    const Child2 = defineComponent({
      setup() {
        const shape = useModel(vm2);
        const count = useUnit(shape.$count);
        return () => h("span", { "data-testid": "count2" }, count.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h("div", null, [
              h(View, { model: vm1 }, { default: () => h(Child1) }),
              h(View, { model: vm2 }, { default: () => h(Child2) }),
            ]);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count1"]').text()).toBe("0");
    expect(wrapper.find('[data-testid="count2"]').text()).toBe("0");

    await wrapper.find('[data-testid="inc1"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="count1"]').text()).toBe("1");
    expect(wrapper.find('[data-testid="count2"]').text()).toBe("0");

    wrapper.unmount();
  });
});
