import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import { zod } from "../index";

describe("forms-zod integration", () => {
  it("rejects invalid field value", () => {
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(zod(z.string().email("Invalid email"))),
    );
    const vm = createFormViewModel({ name: "z1", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("nope");
    expect(form.email.$error.getState()).toBe("Invalid email");
  });

  it("passes valid field value", () => {
    const contract = createFormContract().field("email", (f) =>
      f<string>().default("").validate(zod(z.string().email())),
    );
    const vm = createFormViewModel({ name: "z2", contract, validate: { mode: "all" } });
    const form = vm.instantiate().shape as any;

    form.email.changed("a@b.co");
    expect(form.email.$error.getState()).toBeNull();
  });

  it("submit rejected when schema fails", () => {
    const contract = createFormContract().field("name", (f) =>
      f<string>().default("a").validate(zod(z.string().min(3, "Too short"))),
    );
    const vm = createFormViewModel({ name: "z3", contract });
    const form = vm.instantiate().shape as any;

    const submitted: unknown[] = [];
    const rejected: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));
    form.rejected.watch((v: unknown) => rejected.push(v));
    form.submit();

    expect(submitted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(form.name.$error.getState()).toBe("Too short");
  });

  it("submit passes with valid values", () => {
    const contract = createFormContract().field("qty", (f) =>
      f<number>().default(5).validate(zod(z.number().int().min(1))),
    );
    const vm = createFormViewModel({ name: "z4", contract });
    const form = vm.instantiate().shape as any;

    const submitted: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));
    form.submit();

    expect(submitted).toEqual([{ qty: 5 }]);
  });

  it("criteriaMode=all — joins multiple issues", () => {
    const schema = z
      .string()
      .min(3, "Too short")
      .regex(/^[A-Z]/, "Must start uppercase");
    const contract = createFormContract().field("code", (f) =>
      f<string>().default("").validate(zod(schema)),
    );
    const vm = createFormViewModel({
      name: "z5",
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
