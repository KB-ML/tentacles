import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize, type EventCallable, type StoreWritable } from "effector";
import { createContract, createModel, createPropsContract, createViewModel, partial, required } from "../index";

// =============================================================================
// CONTRACT MERGE: basic
// =============================================================================

describe("contract merge: basic", () => {
  it("merges stores from source into target", () => {
    const pagination = createContract()
      .store("page", (s) => s<number>().default(0))
      .store("pageSize", (s) => s<number>().default(10));

    const contract = createContract()
      .merge(pagination)
      .store("search", (s) => s<string>().default(""));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    const page = shape.$page as StoreWritable<number>;
    const pageSize = shape.$pageSize as StoreWritable<number>;
    const search = shape.$search as StoreWritable<string>;

    expect(page.getState()).toBe(0);
    expect(pageSize.getState()).toBe(10);
    expect(search.getState()).toBe("");
  });

  it("merges static defaults from source", () => {
    const source = createContract()
      .store("status", (s) => s<string>().default("active"))
      .store("count", (s) => s<number>().default(42));

    const contract = createContract()
      .merge(source);
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$status as StoreWritable<string>).getState()).toBe("active");
    expect((shape.$count as StoreWritable<number>).getState()).toBe(42);
  });

  it("merges factory defaults from source", () => {
    const source = createContract()
      .store("prefix", (s) => s<string>().default("item"))
      .store("label", (s) => s<string>().default((d) => `${d.prefix}-list`));

    const contract = createContract().merge(source);
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$label as StoreWritable<string>).getState()).toBe("item-list");
  });

  it("merges events from source", () => {
    const source = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>());

    const contract = createContract().merge(source);
    const vm = createViewModel({
      contract,
      fn: (stores) => {
        (stores.$count as StoreWritable<number>).on(
          stores.inc as EventCallable<void>,
          (n) => n + 1,
        );
        return stores;
      },
    });

    const { shape } = vm.instantiate();
    const count = shape.$count as StoreWritable<number>;
    const inc = shape.inc as Function;

    inc();
    expect(count.getState()).toBe(1);
  });

  it("merges derived fields from source", () => {
    const source = createContract()
      .store("firstName", (s) => s<string>().default("John"))
      .store("lastName", (s) => s<string>().default("Doe"))
      .derived("fullName", (s) => s.$firstName.map((f) => `${f}!`));

    const contract = createContract().merge(source);
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$fullName as StoreWritable<string>).getState()).toBe("John!");
  });

  it("chained merge (A.merge(B).merge(C))", () => {
    const a = createContract().store("x", (s) => s<number>().default(1));
    const b = createContract().store("y", (s) => s<number>().default(2));

    const contract = createContract()
      .merge(a)
      .merge(b)
      .store("z", (s) => s<number>().default(3));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$x as StoreWritable<number>).getState()).toBe(1);
    expect((shape.$y as StoreWritable<number>).getState()).toBe(2);
    expect((shape.$z as StoreWritable<number>).getState()).toBe(3);
  });

  it("merge after existing stores", () => {
    const source = createContract().store("b", (s) => s<number>().default(2));

    const contract = createContract()
      .store("a", (s) => s<number>().default(1))
      .merge(source)
      .store("c", (s) => s<number>().default(3));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$a as StoreWritable<number>).getState()).toBe(1);
    expect((shape.$b as StoreWritable<number>).getState()).toBe(2);
    expect((shape.$c as StoreWritable<number>).getState()).toBe(3);
  });

  it("throws on field name collision", () => {
    const source = createContract().store("page", (s) => s<number>().default(0));

    expect(() => {
      createContract()
        .store("page", (s) => s<string>().default("x"))
        .merge(source);
    }).toThrow('Contract merge collision: field "page" already exists');
  });
});

// =============================================================================
// CONTRACT MERGE: SSR
// =============================================================================

describe("contract merge: SSR", () => {
  it("fork/serialize round-trip with merged contract", () => {
    const pagination = createContract()
      .store("page", (s) => s<number>().default(0))
      .store("pageSize", (s) => s<number>().default(10));

    const contract = createContract()
      .merge(pagination)
      .store("search", (s) => s<string>().default(""));
    const vm = createViewModel({ contract });

    const scope = fork();

    const { shape } = vm.instantiate();
    const page = shape.$page as StoreWritable<number>;
    const search = shape.$search as StoreWritable<string>;

    allSettled(page, { scope, params: 5 });
    allSettled(search, { scope, params: "test" });

    const serialized = serialize(scope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(page)).toBe(5);
    expect(clientScope.getState(search)).toBe("test");
  });
});

// =============================================================================
// CONTRACT MERGE: memory
// =============================================================================

describe("contract merge: memory", () => {
  it("bounded heap on repeated instantiate/destroy", () => {
    const source = createContract()
      .store("a", (s) => s<number>().default(0))
      .store("b", (s) => s<string>().default("x"));

    const contract = createContract()
      .merge(source)
      .store("c", (s) => s<number>().default(1));
    const vm = createViewModel({ contract });

    // Warm up
    for (let i = 0; i < 100; i++) {
      const inst = vm.instantiate();
      inst.lifecycle.destroy();
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      const inst = vm.instantiate();
      inst.lifecycle.destroy();
    }
    global.gc?.();
    const after = process.memoryUsage().heapUsed;

    const growth = after - before;
    expect(growth).toBeLessThan(2 * 1024 * 1024); // < 2MB
  });
});

// =============================================================================
// REQUIRED: basic
// =============================================================================

describe("required: basic", () => {
  it("strips hasDefault and defaultValue from store descriptors", () => {
    const base = createContract()
      .store("name", (s) => s<string>().default("Alice"))
      .store("age", (s) => s<number>().default(30));

    const strict = required(base);
    const fields = strict.getFields();

    expect(fields.name!.hasDefault).toBe(false);
    expect("defaultValue" in fields.name!).toBe(false);
    expect(fields.age!.hasDefault).toBe(false);
    expect("defaultValue" in fields.age!).toBe(false);
  });

  it("strips factory defaults", () => {
    const base = createContract()
      .store("prefix", (s) => s<string>().default("item"))
      .store("label", (s) => s<string>().default((d) => `${d.prefix}-list`));

    const strict = required(base);
    const defaults = strict.getFactoryDefaults();

    expect(defaults.prefix).toBeUndefined();
    expect(defaults.label).toBeUndefined();
  });

  it("round-trips with partial", () => {
    const base = createContract()
      .store("x", (s) => s<number>())
      .store("y", (s) => s<string>());

    const relaxed = partial(base);
    const strict = required(relaxed);
    const fields = strict.getFields();

    expect(fields.x!.hasDefault).toBe(false);
    expect(fields.y!.hasDefault).toBe(false);
  });

  it("preserves non-store fields (events, derived)", () => {
    const base = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>())
      .derived("doubled", (s) => s.$count.map((n) => n * 2));

    const strict = required(base);
    const fields = strict.getFields();

    expect(fields.inc).toBeDefined();
    expect(fields.doubled).toBeDefined();
    expect(fields.count!.hasDefault).toBe(false);
  });

  it("enforces all fields at model creation", () => {
    const base = createContract()
      .store("name", (s) => s<string>().default("Alice"))
      .store("age", (s) => s<number>().default(30))
      .store("id", (s) => s<string>());

    const strict = required(base);
    const contract = strict.pk("id");
    const model = createModel({ contract });

    // All fields must be provided — no defaults to fall back on
    const inst = model.create({ id: "1", name: "Bob", age: 25 });
    expect(inst.$name.getState()).toBe("Bob");
    expect(inst.$age.getState()).toBe(25);

    model.deleteFx("1");
  });

  it("makes all props required", () => {
    const props = createPropsContract()
      .store("label", (s) => s<string>().optional())
      .event("onClick", (e) => e<void>().optional());

    const strict = required(props);
    const descriptors = strict.getDescriptors();
    expect(descriptors.label!.isOptional).toBe(false);
    expect(descriptors.onClick!.isOptional).toBe(false);
  });
});

// =============================================================================
// REQUIRED: SSR
// =============================================================================

describe("required: SSR", () => {
  it("fork/serialize round-trip with required model", async () => {
    const base = createContract()
      .store("name", (s) => s<string>().default("Alice"))
      .store("id", (s) => s<string>());

    const strict = required(base);
    const contract = strict.pk("id");
    const model = createModel({ contract });

    const serverScope = fork();
    await model.create({ id: "1", name: "Bob" }, { scope: serverScope });

    const values = serialize(serverScope);
    model.clear();

    const clientScope = fork({ values });
    const inst = clientScope.getState(model.instance("1"));

    expect(inst).not.toBeNull();
    expect(clientScope.getState(inst!.$name)).toBe("Bob");
  });
});

// =============================================================================
// REQUIRED: memory
// =============================================================================

describe("required: memory", () => {
  it("bounded heap on repeated create/delete", () => {
    const base = createContract()
      .store("a", (s) => s<number>().default(0))
      .store("b", (s) => s<string>().default("x"))
      .store("id", (s) => s<string>());

    const strict = required(base);
    const contract = strict.pk("id");
    const model = createModel({ contract });

    // Warm up
    for (let i = 0; i < 100; i++) {
      model.create({ id: `w${i}`, a: i, b: "w" });
      model.deleteFx(`w${i}`);
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      model.create({ id: `m${i}`, a: i, b: "m" });
      model.deleteFx(`m${i}`);
    }
    global.gc?.();
    const after = process.memoryUsage().heapUsed;

    const growth = after - before;
    expect(growth).toBeLessThan(2 * 1024 * 1024); // < 2MB
  });
});
