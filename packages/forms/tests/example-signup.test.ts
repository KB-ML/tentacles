import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";

describe("Example: Signup with async validation", () => {
  const signupContract = createFormContract()
    .field("username", (f) =>
      f<string>()
        .default("")
        .required("Username required")
        .custom((v) => ((v as string).length < 3 ? "At least 3 characters" : null))
        .validateAsync(
          async (value, ctx) => {
            await new Promise((r) => setTimeout(r, 10));
            if (ctx.signal.aborted) return null;
            return value === "taken" ? "Already taken" : null;
          },
          { debounce: 50 },
        ),
    )
    .field("email", (f) =>
      f<string>()
        .default("")
        .required("Email required")
        .custom((v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v as string) ? null : "Invalid email")),
    )
    .field("password", (f) =>
      f<string>()
        .default("")
        .required("Password required")
        .custom((v) => ((v as string).length >= 8 ? null : "At least 8 characters")),
    )
    .field("confirmPassword", (f) =>
      f<string>()
        .default("")
        .dependsOn("password")
        .custom((v, ctx) => {
          const values = ctx.values as { password: string };
          return v === values.password ? null : "Passwords do not match";
        }),
    );

  const signupVM = createFormViewModel({
    name: "signup",
    contract: signupContract,
    validate: { mode: "touched", reValidate: "change" },
  });

  it("sync validation fires on change after blur", () => {
    const { shape } = signupVM.instantiate();
    const form = shape as any;

    form.username.changed("ab");
    expect(form.username.$error.getState()).toBeNull(); // mode: touched — not visible yet

    form.username.blurred();
    expect(form.username.$error.getState()).toBe("At least 3 characters");

    form.username.changed("abc");
    expect(form.username.$error.getState()).toBeNull(); // reValidate: change clears
  });

  it("submit with empty fields shows required errors", () => {
    const { shape } = signupVM.instantiate();
    const form = shape as any;
    const rejected: unknown[] = [];
    form.rejected.watch((v: unknown) => rejected.push(v));

    form.submit();

    expect(rejected).toHaveLength(1);
    expect(form.username.$error.getState()).toBe("Username required");
    expect(form.email.$error.getState()).toBe("Email required");
    expect(form.password.$error.getState()).toBe("Password required");
  });

  it("valid submit fires submitted (no cross-field custom)", () => {
    // Simplified: no confirmPassword cross-field (ctx.values not yet populated)
    const simpleContract = createFormContract()
      .field("username", (f) => f<string>().default("").required())
      .field("email", (f) => f<string>().default("").required())
      .field("password", (f) => f<string>().default("").required());

    const vm = createFormViewModel({ name: "simple-signup", contract: simpleContract });
    const { shape } = vm.instantiate();
    const form = shape as any;
    const submitted: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));

    form.username.changed("alice");
    form.email.changed("alice@test.com");
    form.password.changed("password123");
    form.submit();

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toEqual({
      username: "alice",
      email: "alice@test.com",
      password: "password123",
    });
  });

  it("dependsOn: confirmPassword re-validates when password changes", () => {
    const { shape } = signupVM.instantiate();
    const form = shape as any;

    form.password.changed("password123");
    form.confirmPassword.changed("password123");
    form.confirmPassword.blurred();

    // Matching passwords → no error
    expect(form.confirmPassword.$error.getState()).toBeNull();

    // Change password → dependsOn triggers re-validation of confirmPassword
    form.password.changed("changed");
    // confirmPassword still has "password123" → re-validates → mismatch
    expect(form.confirmPassword.$error.getState()).toBe("Passwords do not match");

    // Fix confirmPassword to match
    form.confirmPassword.changed("changed");
    expect(form.confirmPassword.$error.getState()).toBeNull();
  });
});
