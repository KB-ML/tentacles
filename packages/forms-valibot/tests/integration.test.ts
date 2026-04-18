import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import { valibot } from "../index";

describe("forms-valibot integration", () => {
  it("rejects invalid field value", () => {
    const schema = v.pipe(v.string(), v.email("Invalid email"));
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(valibot(schema)),
    );
    const vm = createFormViewModel({ name: "v1", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("bad");
    expect(form.email.$error.getState()).toBe("Invalid email");
  });

  it("passes valid value", () => {
    const schema = v.pipe(v.string(), v.email());
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(valibot(schema)),
    );
    const vm = createFormViewModel({ name: "v2", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("a@b.co");
    expect(form.email.$error.getState()).toBeNull();
  });

  it("submit rejected on valibot failure", () => {
    const schema = v.pipe(v.number(), v.minValue(1, "Too small"));
    const contract = createFormContract().field("qty", (f) =>
      f<number>().default(0).validate(valibot(schema)),
    );
    const vm = createFormViewModel({ name: "v3", contract });
    const form = vm.instantiate().shape as any;

    const rejected: unknown[] = [];
    form.rejected.watch((x: unknown) => rejected.push(x));
    form.submit();

    expect(rejected).toHaveLength(1);
    expect(form.qty.$error.getState()).toBe("Too small");
  });

  it("submit passes with valid value", () => {
    const schema = v.pipe(v.number(), v.minValue(1));
    const contract = createFormContract().field("qty", (f) =>
      f<number>().default(5).validate(valibot(schema)),
    );
    const vm = createFormViewModel({ name: "v4", contract });
    const form = vm.instantiate().shape as any;

    const submitted: unknown[] = [];
    form.submitted.watch((x: unknown) => submitted.push(x));
    form.submit();

    expect(submitted).toEqual([{ qty: 5 }]);
  });

  it("reports valibot issue messages", () => {
    const schema = v.pipe(
      v.string(),
      v.minLength(5, "Too short"),
      v.regex(/^[A-Z]/, "Must start uppercase"),
    );
    const contract = createFormContract().field("code", (f) =>
      f<string>().default("").validate(valibot(schema)),
    );
    const vm = createFormViewModel({
      name: "v5",
      contract,
      validate: { mode: "all", criteriaMode: "all" },
    });
    const form = vm.instantiate().shape as any;

    form.code.changed("a");
    const err = form.code.$error.getState() as string;
    expect(err).toMatch(/Too short|Must start uppercase/);
  });
});
