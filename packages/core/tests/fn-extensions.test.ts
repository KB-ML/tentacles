import { describe, expect, it } from "vitest";
import {
  type EventCallable,
  type Store,
  type StoreWritable,
  allSettled,
  combine,
  createEffect,
  createEvent,
  createStore,
  fork,
  sample,
  serialize,
} from "effector";
import { createContract, createModel } from "../index";
import type { ModelInstance } from "../layers/model/types";

// ─────────────────────────────────────────────────────────────────────────────
// FN EXTENSIONS TESTS
//
// Verify that fn in createModel can return extra stores/events beyond what the
// contract declares, and that instances expose them with strict typing.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. BASIC: extra store + event
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: basic store + event", () => {
  const contract = createContract()
    .store("id", (s) => s<number>().autoincrement())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $id }) => {
      const $count = createStore<number>(0);
      const incremented = createEvent<void>();
      $count.on(incremented, (n) => n + 1);
      return { $id, $count, incremented };
    },
  });

  it("instance has contract fields", () => {
    const inst = model.create({});
    expect(inst.$id.getState()).toBe(1);
  });

  it("instance has extension store", () => {
    const inst = model.create({});
    expect(inst.$count.getState()).toBe(0);
  });

  it("instance has extension event and it works", () => {
    const inst = model.create({});
    inst.incremented();
    expect(inst.$count.getState()).toBe(1);
  });

  it("each instance gets independent extension units", () => {
    const a = model.create({});
    const b = model.create({});
    a.incremented();
    a.incremented();
    expect(a.$count.getState()).toBe(2);
    expect(b.$count.getState()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DERIVED EXTENSION: combine contract + extension stores
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: derived store from contract + extension", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("firstName", (s) => s<string>())
    .store("lastName", (s) => s<string>())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $firstName, $lastName, ...rest }) => {
      const $fullName = combine($firstName, $lastName, (f, l) => `${f} ${l}`);
      return { ...rest, $firstName, $lastName, $fullName };
    },
  });

  it("extension derived store computes from contract stores", () => {
    const inst = model.create({ id: "d1", firstName: "John", lastName: "Doe" });
    expect(inst.$fullName.getState()).toBe("John Doe");
  });

  it("extension derived store reacts to contract store changes", () => {
    const inst = model.create({ id: "d2", firstName: "Jane", lastName: "Smith" });
    inst.$firstName.set("Alice");
    expect(inst.$fullName.getState()).toBe("Alice Smith");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EFFECT EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: effect", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("data", (s) => s<string>())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $data, ...rest }) => {
      const fetchFx = createEffect<void, string>({
        handler: async () => "fetched",
      });
      $data.on(fetchFx.doneData, (_, result) => result);
      return { ...rest, $data, fetchFx };
    },
  });

  it("extension effect wires to contract store", async () => {
    const inst = model.create({ id: "e1", data: "initial" });
    await inst.fetchFx();
    expect(inst.$data.getState()).toBe("fetched");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TYPE SAFETY — compile-time checks
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: type safety", () => {
  const contract = createContract()
    .store("id", (s) => s<number>().autoincrement())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $id }) => {
      const $count = createStore<number>(0);
      const $label = createStore<string>("hello");
      const inc = createEvent<void>();
      const setLabel = createEvent<string>();
      $count.on(inc, (n) => n + 1);
      $label.on(setLabel, (_, v) => v);
      return { $id, $count, $label, inc, setLabel };
    },
  });

  it("extension store types are inferred correctly", () => {
    const inst = model.create({});

    // These assertions verify the TYPE at compile time:
    // inst.$count should be StoreWritable<number>
    const countVal: number = inst.$count.getState();
    expect(typeof countVal).toBe("number");

    // inst.$label should be StoreWritable<string>
    const labelVal: string = inst.$label.getState();
    expect(typeof labelVal).toBe("string");

    // inst.inc should be EventCallable<void>
    inst.inc();

    // inst.setLabel should be EventCallable<string>
    inst.setLabel("world");
    expect(inst.$label.getState()).toBe("world");
  });

  it("ModelInstance utility type includes extensions", () => {
    type Inst = ModelInstance<typeof model>;

    // Verify the type includes both contract and extension fields
    const inst: Inst = model.create({});
    const _id: StoreWritable<number> = inst.$id;
    const _count: StoreWritable<number> = inst.$count;
    const _label: StoreWritable<string> = inst.$label;
    const _inc: EventCallable<void> = inst.inc;
    const _setLabel: EventCallable<string> = inst.setLabel;

    expect(inst.__id).toBeDefined();
    expect(inst.__model).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. NO FN — backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: no fn (backward compat)", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .pk("id");

  const model = createModel({ contract });

  it("instances only have contract fields", () => {
    const inst = model.create({ id: "nf1", name: "test" });
    expect(inst.$id.getState()).toBe("nf1");
    expect(inst.$name.getState()).toBe("test");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PARTIAL RETURN — fn returns subset (existing behavior)
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: partial return", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("inc", (e) => e<void>())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $count, inc }) => {
      $count.on(inc, (n) => n + 1);
      return { $count, inc };
    },
  });

  it("all contract fields are on instance even if fn returns subset", () => {
    const inst = model.create({ id: "p1", count: 0 });
    expect(inst.$id.getState()).toBe("p1");
    expect(inst.$count.getState()).toBe(0);
    inst.inc();
    expect(inst.$count.getState()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SSR — extensions survive fork/serialize
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: SSR fork/serialize", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $id }) => {
      const $count = createStore<number>(0);
      const inc = createEvent<void>();
      $count.on(inc, (n) => n + 1);
      return { $id, $count, inc };
    },
  });

  it("extension store works in forked scope", async () => {
    const inst = model.create({ id: "ssr1" });
    const scope = fork();

    await allSettled(inst.inc, { scope });
    await allSettled(inst.inc, { scope });

    expect(scope.getState(inst.$count)).toBe(2);
    expect(inst.$count.getState()).toBe(0); // global unaffected
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SAMPLE between extension and contract
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: sample wiring", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("value", (s) => s<number>())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $value, ...rest }) => {
      const $doubled = $value.map((v) => v * 2);
      return { ...rest, $value, $doubled };
    },
  });

  it("map wires extension to contract store reactively", () => {
    const inst = model.create({ id: "s1", value: 5 });
    expect(inst.$doubled.getState()).toBe(10);
    inst.$value.set(10);
    expect(inst.$doubled.getState()).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. REACTIVE MODEL STORES include extensions
// ─────────────────────────────────────────────────────────────────────────────

describe("FN EXTENSIONS: $instances and $instance", () => {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .pk("id");

  const model = createModel({
    contract,
    fn: ({ $id }) => {
      const $tag = createStore<string>("default");
      return { $id, $tag };
    },
  });

  it("$instances returns instances with extensions", () => {
    model.create({ id: "r1" });
    const instances = model.instances();
    expect(instances[0]?.$tag.getState()).toBe("default");
  });

  it("$instance returns instance with extensions", () => {
    model.create({ id: "r2" });
    const inst = model.get("r2");
    expect(inst?.$tag.getState()).toBe("default");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. MEMORY — extensions cleaned up on delete
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("FN EXTENSIONS: memory cleanup", () => {
  it("extension units are cleaned up on instance delete (bounded heap)", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $id }) => {
        const $a = createStore<string>("x".repeat(500));
        const $b = createStore<number>(0);
        const ev = createEvent<void>();
        $b.on(ev, (n) => n + 1);
        return { $id, $a, $b, ev };
      },
    });

    // Warmup
    for (let i = 0; i < 50; i++) {
      model.create({ id: `w${i}` });
      model.delete(`w${i}`);
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      model.create({ id: `m${i}` });
      model.delete(`m${i}`);
    }

    const heapAfter = measureHeap();
    const growth = heapAfter - heapBefore;

    expect(growth).toBeLessThan(10 * 1024 * 1024);
  });
});
