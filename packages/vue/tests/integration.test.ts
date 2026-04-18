import { describe, expect, it } from "vitest";
import { createContract, createModel, createPropsContract, createViewModel, eq, gt } from "@kbml-tentacles/core";
import { createEffect, createEvent, createStore, sample } from "effector";
import { useUnit } from "effector-vue/composition";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { Each, useModel, useView } from "../index";

// ─── Helpers ───

function makeCounterModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("inc", (e) => e<void>())
    .event("set", (e) => e<number>())
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $count, inc, set }) => {
      $count.on(inc, (n) => n + 1);
      $count.on(set, (_, v) => v);
      return { $id, $count, inc, set };
    },
  });
}

function makeUserModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("age", (s) => s<number>())
    .store("role", (s) => s<string>().default("user"))
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $name, $age, $role }) => ({ $id, $name, $age, $role }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe("model CRUD through components", () => {
  it("update via event reflects in UI", async () => {
    const model = makeCounterModel();
    const inst = model.create({ id: "c1", count: 0 });

    const Counter = defineComponent({
      setup() {
        const m = useModel(model);
        const count = useUnit(m.$count);
        return () => h("span", { "data-testid": "count" }, count.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(Each as any, { model, id: "c1" }, { default: () => h(Counter) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");

    inst.inc();
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1");

    inst.set(10);
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("10");

    model.clear();
    wrapper.unmount();
  });

  it("reads multiple store fields from instance", async () => {
    const model = makeUserModel();
    model.create({ id: "u1", name: "Alice", age: 30 });

    const UserView = defineComponent({
      setup() {
        const user = useModel(model);
        const name = useUnit(user.$name);
        const age = useUnit(user.$age);
        const role = useUnit(user.$role);
        return () =>
          h("div", [
            h("span", { "data-testid": "name" }, name.value),
            h("span", { "data-testid": "age" }, age.value),
            h("span", { "data-testid": "role" }, role.value),
          ]);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(Each as any, { model, id: "u1" }, { default: () => h(UserView) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="name"]').text()).toBe("Alice");
    expect(wrapper.find('[data-testid="age"]').text()).toBe("30");
    expect(wrapper.find('[data-testid="role"]').text()).toBe("user");

    model.clear();
    wrapper.unmount();
  });

  it("delete then re-create shows updated data", async () => {
    const model = makeCounterModel();
    model.create({ id: "d1", count: 5 });

    const Counter = defineComponent({
      setup() {
        const m = useModel(model);
        const count = useUnit(m.$count);
        return () => h("span", { "data-testid": "count" }, count.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, source: model.$ids }, { default: () => h(Counter) });
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("5");

    model.delete("d1");
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').exists()).toBe(false);

    model.create({ id: "d1", count: 99 });
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("99");

    model.clear();
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REACTIVE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

describe("reactive queries in components", () => {
  it("query.$ids drives <Each> with filtered results", async () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 45 });

    const query = model.query().where("age", gt(30));

    const UserItem = defineComponent({
      setup() {
        const user = useModel(model);
        const name = useUnit(user.$name);
        return () => h("div", { "data-testid": "item" }, name.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          const count = useUnit(query.$count);
          return () =>
            h("div", [
              h("span", { "data-testid": "count" }, count.value),
              h(Each as any, { model, source: query.$ids }, { default: () => h(UserItem) }),
            ]);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("2");
    expect(wrapper.findAll('[data-testid="item"]')).toHaveLength(2);
    expect(wrapper.text()).not.toContain("Alice");

    model.clear();
    wrapper.unmount();
  });

  it("dynamic filter via Store updates results", async () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 45 });

    const setMin = createEvent<number>();
    const $min = createStore(30).on(setMin, (_, v) => v);
    const query = model.query().where("age", gt($min));

    const wrapper = mount(
      defineComponent({
        setup() {
          const count = useUnit(query.$count);
          return () => h("span", { "data-testid": "count" }, count.value);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("2");

    setMin(40);
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1");

    setMin(10);
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("3");

    model.clear();
    wrapper.unmount();
  });

  it("adding/deleting instances updates query reactively", async () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });

    const query = model.query().where("age", gt(30));

    const wrapper = mount(
      defineComponent({
        setup() {
          const count = useUnit(query.$count);
          return () => h("span", { "data-testid": "count" }, count.value);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");

    model.create({ id: "2", name: "Bob", age: 35 });
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1");

    model.delete("2");
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");

    model.clear();
    wrapper.unmount();
  });

  it("orderBy changes render order", async () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Charlie", age: 30 });
    model.create({ id: "2", name: "Alice", age: 25 });
    model.create({ id: "3", name: "Bob", age: 35 });

    const query = model.query().orderBy("name", "asc");

    const UserItem = defineComponent({
      setup() {
        const user = useModel(model);
        const name = useUnit(user.$name);
        return () => h("div", { "data-testid": "item" }, name.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(Each as any, { model, source: query.$ids }, { default: () => h(UserItem) });
        },
      }),
    );

    await nextTick();
    const items = wrapper.findAll('[data-testid="item"]').map((w) => w.text());
    expect(items).toEqual(["Alice", "Bob", "Charlie"]);

    model.clear();
    wrapper.unmount();
  });

  it("limit/offset pagination", async () => {
    const model = makeUserModel();
    for (let i = 1; i <= 5; i++) {
      model.create({ id: String(i), name: `User${i}`, age: 20 + i });
    }

    const query = model.query().orderBy("name", "asc").offset(1).limit(2);

    const UserItem = defineComponent({
      setup() {
        const user = useModel(model);
        const name = useUnit(user.$name);
        return () => h("div", { "data-testid": "item" }, name.value);
      },
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          const total = useUnit(query.$totalCount);
          return () =>
            h("div", [
              h("span", { "data-testid": "total" }, total.value),
              h(Each as any, { model, source: query.$ids }, { default: () => h(UserItem) }),
            ]);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="total"]').text()).toBe("5");
    const items = wrapper.findAll('[data-testid="item"]').map((w) => w.text());
    expect(items).toEqual(["User2", "User3"]);

    model.clear();
    wrapper.unmount();
  });

  it("when() conditional filter toggles", async () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25, role: "admin" });
    model.create({ id: "2", name: "Bob", age: 35, role: "user" });
    model.create({ id: "3", name: "Charlie", age: 45, role: "admin" });

    const setRole = createEvent<string | null>();
    const $role = createStore<string | null>(null).on(setRole, (_, v) => v);
    const query = model.query().when($role, (q, role) => q.where("role", eq(role)));

    const wrapper = mount(
      defineComponent({
        setup() {
          const count = useUnit(query.$count);
          return () => h("span", { "data-testid": "count" }, count.value);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("3");

    setRole("admin");
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("2");

    setRole("user");
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1");

    setRole(null);
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("3");

    model.clear();
    wrapper.unmount();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWMODEL (useView)
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView integration", () => {
  it("renders stores, events, and derived stores", async () => {
    const vmContract = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>())
      .derived("doubled", (s) => s.$count.map((n) => n * 2));
    const vm = createViewModel({
        contract: vmContract,
        fn: (stores) => {
          stores.$count.on(stores.inc, (n) => n + 1);
          return { $count: stores.$count, inc: stores.inc, $doubled: stores.$doubled };
        },
      });

    const wrapper = mount(
      defineComponent({
        setup() {
          const view = useUnit(useView(vm)) as any;
          return () =>
            h("div", [
              h("span", { "data-testid": "count" }, view.$count.value),
              h("span", { "data-testid": "doubled" }, view.$doubled.value),
              h("button", { "data-testid": "inc", onClick: () => view.inc() }, "+"),
            ]);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("0");
    expect(wrapper.find('[data-testid="doubled"]').text()).toBe("0");

    await wrapper.find('[data-testid="inc"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1");
    expect(wrapper.find('[data-testid="doubled"]').text()).toBe("2");

    wrapper.unmount();
  });

  it("lifecycle: mount/unmount fire", () => {
    let mounted = false;
    let unmounted = false;

    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
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
          useView(vm);
          return () => h("div", "alive");
        },
      }),
    );

    expect(mounted).toBe(true);
    expect(unmounted).toBe(false);

    wrapper.unmount();
    expect(unmounted).toBe(true);
  });

  it("prop sync via setProps", async () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().store("input", (s) => s<number>().optional()),
        fn: (_s, ctx) => ({ input: ctx.props.$input }),
      });

    const Comp = defineComponent({
      props: { input: { type: Number, required: true } },
      setup(props) {
        const view = useUnit(useView(vm, () => ({ input: props.input }))) as any;
        return () => h("span", { "data-testid": "val" }, view.input.value);
      },
    });

    const wrapper = mount(Comp, { props: { input: 10 } });
    await nextTick();
    expect(wrapper.find('[data-testid="val"]').text()).toBe("10");

    await wrapper.setProps({ input: 42 });
    await nextTick();
    expect(wrapper.find('[data-testid="val"]').text()).toBe("42");

    wrapper.unmount();
  });

  it("event prop fires callback", async () => {
    let received: string | null = null;

    const vmContract = createContract()
      .store("v", (s) => s<string>().default(""));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().event("onSubmit", (e) => e<string>().optional()),
        fn: (_s, ctx) => ({ submit: ctx.props.onSubmit }),
      });

    const wrapper = mount(
      defineComponent({
        setup() {
          const view = useUnit(useView(vm, () => ({
            onSubmit: (val: string) => {
              received = val;
            },
          }))) as any;
          return () =>
            h("button", { "data-testid": "btn", onClick: () => view.submit("hello") }, "Go");
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
// VIEWMODEL PROPS — passing and changing
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView props", () => {
  it("optional store prop is undefined when not passed", async () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().store("label", (s) => s<string>().optional()),
        fn: (_s, ctx) => ({ label: ctx.props.$label }),
      });

    const wrapper = mount(
      defineComponent({
        setup() {
          const view = useUnit(useView(vm)) as any;
          return () => h("span", { "data-testid": "label" }, view.label.value ?? "missing");
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="label"]').text()).toBe("missing");
    wrapper.unmount();
  });

  it("store prop overrides default when passed", async () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().store("label", (s) => s<string>().optional()),
        fn: (_s, ctx) => ({ label: ctx.props.$label }),
      });

    const wrapper = mount(
      defineComponent({
        setup() {
          const view = useUnit(useView(vm, () => ({ label: "custom" }))) as any;
          return () => h("span", { "data-testid": "label" }, view.label.value);
        },
      }),
    );

    await nextTick();
    expect(wrapper.find('[data-testid="label"]').text()).toBe("custom");
    wrapper.unmount();
  });

  it("multiple store props change independently", async () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract()
          .store("first", (s) => s<string>().optional())
          .store("second", (s) => s<number>().optional()),
        fn: (_s, ctx) => ({ first: ctx.props.$first, second: ctx.props.$second }),
      });

    const Comp = defineComponent({
      props: {
        first: { type: String, required: true },
        second: { type: Number, required: true },
      },
      setup(props) {
        const view = useUnit(useView(vm, () => ({ first: props.first, second: props.second }))) as any;
        return () =>
          h("div", [
            h("span", { "data-testid": "first" }, view.first.value),
            h("span", { "data-testid": "second" }, String(view.second.value)),
          ]);
      },
    });

    const wrapper = mount(Comp, { props: { first: "a", second: 1 } });
    await nextTick();
    expect(wrapper.find('[data-testid="first"]').text()).toBe("a");
    expect(wrapper.find('[data-testid="second"]').text()).toBe("1");

    await wrapper.setProps({ first: "b", second: 1 });
    await nextTick();
    expect(wrapper.find('[data-testid="first"]').text()).toBe("b");
    expect(wrapper.find('[data-testid="second"]').text()).toBe("1");

    await wrapper.setProps({ first: "b", second: 99 });
    await nextTick();
    expect(wrapper.find('[data-testid="first"]').text()).toBe("b");
    expect(wrapper.find('[data-testid="second"]').text()).toBe("99");

    wrapper.unmount();
  });

  it("store prop survives rapid changes", async () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().store("val", (s) => s<number>().optional()),
        fn: (_s, ctx) => ({ val: ctx.props.$val }),
      });

    const Comp = defineComponent({
      props: { val: { type: Number, required: true } },
      setup(props) {
        const view = useUnit(useView(vm, () => ({ val: props.val }))) as any;
        return () => h("span", { "data-testid": "val" }, String(view.val.value));
      },
    });

    const wrapper = mount(Comp, { props: { val: 0 } });
    for (let i = 1; i <= 10; i++) {
      await wrapper.setProps({ val: i });
    }
    await nextTick();
    expect(wrapper.find('[data-testid="val"]').text()).toBe("10");

    wrapper.unmount();
  });

  it("event prop callback updates between renders", async () => {
    const calls: string[] = [];

    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().event("onAction", (e) => e<void>().optional()),
        fn: (_s, ctx) => ({ fire: ctx.props.onAction }),
      });

    const Comp = defineComponent({
      props: { tag: { type: String, required: true } },
      setup(props) {
        const view = useUnit(useView(vm, () => ({
          onAction: () => calls.push(props.tag),
        }))) as any;
        return () => h("button", { "data-testid": "btn", onClick: () => view.fire() }, "go");
      },
    });

    const wrapper = mount(Comp, { props: { tag: "first" } });
    await nextTick();
    await wrapper.find('[data-testid="btn"]').trigger("click");
    await nextTick();
    expect(calls).toEqual(["first"]);

    await wrapper.setProps({ tag: "second" });
    await nextTick();
    await wrapper.find('[data-testid="btn"]').trigger("click");
    await nextTick();
    expect(calls).toEqual(["first", "second"]);

    wrapper.unmount();
  });

  it("store prop feeds internal derived state", async () => {
    const vmContract = createContract()
      .store("base", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract().store("multiplier", (s) => s<number>().optional()),
        fn: (stores, ctx) => {
          const $result = stores.$base.map((b) => b * 2);
          return { $base: stores.$base, multiplier: ctx.props.$multiplier, result: $result };
        },
      });

    const Comp = defineComponent({
      props: { mult: { type: Number, required: true } },
      setup(props) {
        const view = useUnit(useView(vm, () => ({ multiplier: props.mult }))) as any;
        return () =>
          h("div", [
            h("span", { "data-testid": "mult" }, String(view.multiplier.value)),
            h("span", { "data-testid": "result" }, String(view.result.value)),
          ]);
      },
    });

    const wrapper = mount(Comp, { props: { mult: 3 } });
    await nextTick();
    expect(wrapper.find('[data-testid="mult"]').text()).toBe("3");
    expect(wrapper.find('[data-testid="result"]').text()).toBe("0");

    await wrapper.setProps({ mult: 5 });
    await nextTick();
    expect(wrapper.find('[data-testid="mult"]').text()).toBe("5");

    wrapper.unmount();
  });

  it("mixed store and event props work together", async () => {
    const log: string[] = [];

    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
        contract: vmContract,
        props: createPropsContract()
          .store("title", (s) => s<string>().optional())
          .event("onSave", (e) => e<string>()),
        fn: (_s, ctx) => ({
          title: ctx.props.$title,
          save: ctx.props.onSave,
        }),
      });

    const Comp = defineComponent({
      props: { title: { type: String, required: true } },
      setup(props) {
        const view = useUnit(useView(vm, () => ({
          title: props.title,
          onSave: (val: string) => log.push(`saved:${val}`),
        }))) as any;
        return () =>
          h("div", [
            h("span", { "data-testid": "title" }, view.title.value),
            h("button", { "data-testid": "save", onClick: () => view.save("data") }, "save"),
          ]);
      },
    });

    const wrapper = mount(Comp, { props: { title: "Draft" } });
    await nextTick();
    expect(wrapper.find('[data-testid="title"]').text()).toBe("Draft");

    await wrapper.find('[data-testid="save"]').trigger("click");
    await nextTick();
    expect(log).toEqual(["saved:data"]);

    await wrapper.setProps({ title: "Final" });
    await nextTick();
    expect(wrapper.find('[data-testid="title"]').text()).toBe("Final");

    await wrapper.find('[data-testid="save"]').trigger("click");
    await nextTick();
    expect(log).toEqual(["saved:data", "saved:data"]);

    wrapper.unmount();
  });
});
