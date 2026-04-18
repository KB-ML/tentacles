import { describe, expect, it } from "vitest";
import { type } from "arktype";
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import { arktype } from "../index";

describe("forms-arktype integration", () => {
  it("rejects value that violates arktype constraint", () => {
    const contract = createFormContract().field("name", (f) =>
      f<string>().default("").validate(arktype(type("string > 2"))),
    );
    const vm = createFormViewModel({ name: "a1", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.name.changed("ab");
    expect(form.name.$error.getState()).toBeTruthy();
  });

  it("passes valid value", () => {
    const contract = createFormContract().field("name", (f) =>
      f<string>().default("").validate(arktype(type("string > 2"))),
    );
    const vm = createFormViewModel({ name: "a2", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.name.changed("Alice");
    expect(form.name.$error.getState()).toBeNull();
  });

  it("submit rejected on arktype failure", () => {
    const contract = createFormContract().field("age", (f) =>
      f<number>().default(10).validate(arktype(type("number >= 18"))),
    );
    const vm = createFormViewModel({ name: "a3", contract });
    const form = vm.instantiate().shape as any;

    const rejected: unknown[] = [];
    form.rejected.watch((v: unknown) => rejected.push(v));
    form.submit();

    expect(rejected).toHaveLength(1);
    expect(form.age.$error.getState()).toBeTruthy();
  });

  it("submit passes with valid value", () => {
    const contract = createFormContract().field("age", (f) =>
      f<number>().default(21).validate(arktype(type("number >= 18"))),
    );
    const vm = createFormViewModel({ name: "a4", contract });
    const form = vm.instantiate().shape as any;

    const submitted: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));
    form.submit();

    expect(submitted).toEqual([{ age: 21 }]);
  });

  it("regex via arktype", () => {
    const contract = createFormContract().field("code", (f) =>
      f<string>().default("").validate(arktype(type(/^[A-Z]{3}-\d{3}$/))),
    );
    const vm = createFormViewModel({ name: "a5", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.code.changed("bad");
    expect(form.code.$error.getState()).toBeTruthy();

    form.code.changed("ABC-123");
    expect(form.code.$error.getState()).toBeNull();
  });
});
