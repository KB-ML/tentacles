import { describe, expect, it } from "vitest";
import Joi from "joi";
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import { joi } from "../index";

describe("forms-joi integration", () => {
  it("rejects invalid field value", () => {
    const schema = Joi.string().email({ tlds: { allow: false } }).required();
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("x").validate(joi(schema)),
    );
    const vm = createFormViewModel({ name: "j1", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("bad");
    expect(form.email.$error.getState()).toBeTruthy();
  });

  it("passes valid value", () => {
    const schema = Joi.string().email({ tlds: { allow: false } });
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(joi(schema)),
    );
    const vm = createFormViewModel({ name: "j2", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("a@b.co");
    expect(form.email.$error.getState()).toBeNull();
  });

  it("submit rejected on joi failure", () => {
    const schema = Joi.number().min(1).required();
    const contract = createFormContract().field("qty", (f) =>
      f<number>().default(0).validate(joi(schema)),
    );
    const vm = createFormViewModel({ name: "j3", contract });
    const form = vm.instantiate().shape as any;

    const rejected: unknown[] = [];
    form.rejected.watch((v: unknown) => rejected.push(v));
    form.submit();

    expect(rejected).toHaveLength(1);
    expect(form.qty.$error.getState()).toBeTruthy();
  });

  it("submit passes with valid value", () => {
    const schema = Joi.number().min(1);
    const contract = createFormContract().field("qty", (f) =>
      f<number>().default(5).validate(joi(schema)),
    );
    const vm = createFormViewModel({ name: "j4", contract });
    const form = vm.instantiate().shape as any;

    const submitted: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));
    form.submit();

    expect(submitted).toEqual([{ qty: 5 }]);
  });

  it("abortEarly=false — errors present", () => {
    const schema = Joi.string().min(5).pattern(/^[A-Z]/);
    const contract = createFormContract().field("code", (f) =>
      f<string>().default("").validate(joi(schema)),
    );
    const vm = createFormViewModel({
      name: "j5",
      contract,
      validate: { mode: "all", criteriaMode: "all" },
    });
    const form = vm.instantiate().shape as any;

    form.code.changed("ab");
    const err = form.code.$error.getState() as string;
    expect(err).toBeTruthy();
    expect(err).toMatch(/5|length|pattern/i);
  });
});
