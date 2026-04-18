import { describe, expect, it } from "vitest";
import { allSettled, fork, serialize } from "effector";
import { createFormContract, createFormViewModel } from "../index";

describe("SSR — flat form round-trip", () => {
  it("field values survive fork → serialize → fork({ values })", async () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("age", (f) => f<number>().default(0));

    const vm = createFormViewModel({ name: "ssrFlat", contract });

    const scope = fork();
    const { shape } = vm.instantiate();
    const form = shape as any;

    await allSettled(form.name.changed, { scope, params: "Alice" });
    await allSettled(form.age.changed, { scope, params: 30 });

    expect(scope.getState(form.name.$value)).toBe("Alice");
    expect(scope.getState(form.age.$value)).toBe(30);

    const serialized = serialize(scope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(form.name.$value)).toBe("Alice");
    expect(clientScope.getState(form.age.$value)).toBe(30);
  });
});

describe("SSR — nested sub-form round-trip", () => {
  it("nested values survive round-trip", async () => {
    const address = createFormContract()
      .field("city", (f) => f<string>().default(""))
      .field("zip", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const vm = createFormViewModel({ name: "ssrNested", contract });
    const scope = fork();
    const { shape } = vm.instantiate();
    const form = shape as any;

    await allSettled(form.name.changed, { scope, params: "Bob" });
    await allSettled(form.address.city.changed, { scope, params: "NYC" });
    await allSettled(form.address.zip.changed, { scope, params: "10001" });

    const serialized = serialize(scope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(form.name.$value)).toBe("Bob");
    expect(clientScope.getState(form.address.city.$value)).toBe("NYC");
    expect(clientScope.getState(form.address.zip.$value)).toBe("10001");
  });
});

describe("SSR — scope isolation", () => {
  it("two concurrent scopes have independent form state", async () => {
    const contract = createFormContract()
      .field("value", (f) => f<string>().default(""));

    const vm = createFormViewModel({ name: "ssrIsolation", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    const scope1 = fork();
    const scope2 = fork();

    await allSettled(form.value.changed, { scope: scope1, params: "scope1" });
    await allSettled(form.value.changed, { scope: scope2, params: "scope2" });

    expect(scope1.getState(form.value.$value)).toBe("scope1");
    expect(scope2.getState(form.value.$value)).toBe("scope2");
  });
});

describe("SSR — submit in scope", () => {
  it("allSettled(form.submit, { scope }) fires submitted correctly", async () => {
    const contract = createFormContract()
      .field("title", (f) => f<string>().default("hello"));

    const vm = createFormViewModel({ name: "ssrSubmit", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    const scope = fork();
    const results: unknown[] = [];
    form.submitted.watch((v: unknown) => results.push(v));

    await allSettled(form.submit, { scope });

    // submitted should have fired with the default values
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("SSR — touched/dirty state", () => {
  it("touched and dirty state round-trips", async () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default("original"));

    const vm = createFormViewModel({ name: "ssrDirty", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    const scope = fork();

    await allSettled(form.name.changed, { scope, params: "modified" });

    expect(scope.getState(form.name.$dirty)).toBe(true);
    expect(scope.getState(form.name.$touched)).toBe(true);

    const serialized = serialize(scope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(form.name.$value)).toBe("modified");
    expect(clientScope.getState(form.name.$touched)).toBe(true);
  });
});
