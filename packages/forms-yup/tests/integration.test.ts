import { describe, expect, it } from "vitest";
import * as y from "yup";
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import { yup } from "../index";

describe("forms-yup integration", () => {
  it("rejects invalid field value", () => {
    const schema = y.string().email("Invalid email").required();
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(yup(schema)),
    );
    const vm = createFormViewModel({ name: "y1", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("bad");
    expect(form.email.$error.getState()).toBeTruthy();
  });

  it("passes valid value", () => {
    const schema = y.string().email();
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(yup(schema)),
    );
    const vm = createFormViewModel({ name: "y2", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("a@b.co");
    expect(form.email.$error.getState()).toBeNull();
  });

  it("submit rejected on yup failure", () => {
    const schema = y.number().min(18);
    const contract = createFormContract().field("age", (f) =>
      f<number>().default(5).validate(yup(schema)),
    );
    const vm = createFormViewModel({ name: "y3", contract });
    const form = vm.instantiate().shape as any;

    const rejected: unknown[] = [];
    form.rejected.watch((v: unknown) => rejected.push(v));
    form.submit();

    expect(rejected).toHaveLength(1);
    expect(form.age.$error.getState()).toBeTruthy();
  });

  it("submit passes with valid value", () => {
    const schema = y.number().min(18);
    const contract = createFormContract().field("age", (f) =>
      f<number>().default(21).validate(yup(schema)),
    );
    const vm = createFormViewModel({ name: "y4", contract });
    const form = vm.instantiate().shape as any;

    const submitted: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));
    form.submit();

    expect(submitted).toEqual([{ age: 21 }]);
  });

  it("collects multiple errors with criteriaMode=all", () => {
    const schema = y
      .string()
      .min(5, "Too short")
      .matches(/^[A-Z]/, "Must start uppercase");
    const contract = createFormContract().field("code", (f) =>
      f<string>().default("").validate(yup(schema)),
    );
    const vm = createFormViewModel({
      name: "y5",
      contract,
      validate: { mode: "all", criteriaMode: "all" },
    });
    const form = vm.instantiate().shape as any;

    form.code.changed("a");
    const err = form.code.$error.getState() as string;
    expect(err).toContain("Too short");
    expect(err).toContain("Must start uppercase");
  });
});
