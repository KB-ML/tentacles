import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createEvent, createStore } from "effector";
import { AsyncRunner } from "../src/validation/async-runner";
import type { ValidatorCtx } from "../src/contract/types/validator";

function makeCtx(): ValidatorCtx {
  return {
    values: {},
    rootValues: {},
    path: [],
    signal: new AbortController().signal,
  };
}

describe("AsyncRunner", () => {
  let runner: AsyncRunner;

  beforeEach(() => {
    runner = new AsyncRunner();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("basic async validator — schedules, resolves, updates error", async () => {
    vi.useRealTimers();
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    const $error = createStore<string | null>(null).on(setError, (_, e) => e);
    const $validating = createStore(false).on(setValidating, (_, v) => v);

    runner.registerField({
      path: "username",
      asyncValidators: [
        { fn: async (value: unknown) => (value === "taken" ? "Already taken" : null) },
      ],
      setError,
      setValidating,
    });

    runner.schedule("username", "taken", makeCtx());

    expect($validating.getState()).toBe(true);

    await runner.flushAll();

    expect($error.getState()).toBe("Already taken");
    expect($validating.getState()).toBe(false);
  });

  it("valid async — clears error", async () => {
    vi.useRealTimers();
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    const $error = createStore<string | null>("old error").on(setError, (_, e) => e);

    runner.registerField({
      path: "email",
      asyncValidators: [{ fn: async () => null }],
      setError,
      setValidating,
    });

    runner.schedule("email", "ok@test.com", makeCtx());
    await runner.flushAll();

    expect($error.getState()).toBeNull();
  });

  it("debounce — delays execution", async () => {
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    const $validating = createStore(false).on(setValidating, (_, v) => v);
    let callCount = 0;

    runner.registerField({
      path: "name",
      asyncValidators: [
        {
          fn: async () => { callCount++; return null; },
          debounce: 300,
        },
      ],
      setError,
      setValidating,
    });

    // Schedule — should NOT run immediately
    runner.schedule("name", "a", makeCtx());
    expect($validating.getState()).toBe(true); // eager

    // Fast-forward less than debounce
    vi.advanceTimersByTime(200);
    expect(callCount).toBe(0);

    // Schedule again — resets timer
    runner.schedule("name", "ab", makeCtx());
    vi.advanceTimersByTime(200);
    expect(callCount).toBe(0);

    // Complete debounce
    vi.advanceTimersByTime(200);
    // Need to flush microtasks
    vi.useRealTimers();
    await runner.flushAll();
    expect(callCount).toBe(1);
  });

  it("abort on stale — new schedule aborts previous", async () => {
    vi.useRealTimers();
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    const results: string[] = [];

    runner.registerField({
      path: "x",
      asyncValidators: [
        {
          fn: async (value: unknown, ctx: ValidatorCtx) => {
            await new Promise((r) => setTimeout(r, 50));
            if (ctx.signal.aborted) return null;
            const msg = `result-${value}`;
            results.push(msg);
            return msg;
          },
        },
      ],
      setError,
      setValidating,
    });

    // First schedule
    runner.schedule("x", "first", makeCtx());
    // Immediately schedule again — aborts first
    runner.schedule("x", "second", makeCtx());

    await runner.flushAll();

    // Only the second should have completed
    expect(results).toEqual(["result-second"]);
  });

  it("abort all — cancels everything", async () => {
    vi.useRealTimers();
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    const $validating = createStore(false).on(setValidating, (_, v) => v);

    runner.registerField({
      path: "a",
      asyncValidators: [
        { fn: async () => { await new Promise((r) => setTimeout(r, 100)); return "error"; } },
      ],
      setError,
      setValidating,
    });

    runner.schedule("a", "val", makeCtx());
    expect($validating.getState()).toBe(true);

    runner.abortAll();
    expect($validating.getState()).toBe(false);
    expect(runner.hasPending()).toBe(false);
  });

  it("validator that throws — surfaces error message", async () => {
    vi.useRealTimers();
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    const $error = createStore<string | null>(null).on(setError, (_, e) => e);

    runner.registerField({
      path: "x",
      asyncValidators: [
        { fn: async () => { throw new Error("Network failure"); } },
      ],
      setError,
      setValidating,
    });

    runner.schedule("x", "val", makeCtx());
    await runner.flushAll();

    expect($error.getState()).toBe("Validation threw: Network failure");
  });

  it("$validatingPaths tracks active validators", async () => {
    vi.useRealTimers();
    const setErrorA = createEvent<string | null>();
    const setValidatingA = createEvent<boolean>();
    const setErrorB = createEvent<string | null>();
    const setValidatingB = createEvent<boolean>();

    runner.registerField({
      path: "a",
      asyncValidators: [
        { fn: async () => { await new Promise((r) => setTimeout(r, 50)); return null; } },
      ],
      setError: setErrorA,
      setValidating: setValidatingA,
    });

    runner.registerField({
      path: "b",
      asyncValidators: [
        { fn: async () => { await new Promise((r) => setTimeout(r, 50)); return null; } },
      ],
      setError: setErrorB,
      setValidating: setValidatingB,
    });

    runner.schedule("a", "v1", makeCtx());
    runner.schedule("b", "v2", makeCtx());

    expect(runner.$validatingPaths.getState().has("a")).toBe(true);
    expect(runner.$validatingPaths.getState().has("b")).toBe(true);

    await runner.flushAll();

    expect(runner.$validatingPaths.getState().size).toBe(0);
  });

  it("bypass debounce — fires immediately (for submit)", async () => {
    vi.useRealTimers();
    const setError = createEvent<string | null>();
    const setValidating = createEvent<boolean>();
    let called = false;

    runner.registerField({
      path: "x",
      asyncValidators: [
        {
          fn: async () => { called = true; return null; },
          debounce: 5000,
        },
      ],
      setError,
      setValidating,
    });

    runner.schedule("x", "val", makeCtx(), true); // bypassDebounce
    await runner.flushAll();

    expect(called).toBe(true);
  });
});
