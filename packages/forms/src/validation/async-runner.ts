import { createEvent, createStore, type EventCallable, type Store, sample } from "effector";
import type { AsyncValidatorEntry } from "../contract/form-contract-descriptors";
import type { ValidationResult, ValidatorCtx } from "../contract/types/validator";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AsyncSlot {
  controller: AbortController;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  promise: Promise<void>;
  resolve: () => void;
}

export interface AsyncFieldConfig {
  readonly path: string;
  readonly asyncValidators: AsyncValidatorEntry[];
  readonly setError: EventCallable<string | null>;
  readonly setValidating: EventCallable<boolean>;
}

// ─── AsyncRunner ────────────────────────────────────────────────────────────

export class AsyncRunner {
  private readonly slots = new Map<string, AsyncSlot>();
  private readonly fieldConfigs = new Map<string, AsyncFieldConfig>();

  readonly abort: EventCallable<string>;
  readonly abortAll: EventCallable<void>;
  readonly $validatingPaths: Store<ReadonlySet<string>>;

  private readonly _addValidating: EventCallable<string>;
  private readonly _removeValidating: EventCallable<string>;
  private readonly _clearValidating: EventCallable<void>;

  // Events that signal completion of abort — downstream can react via sample
  readonly aborted: EventCallable<string>;
  readonly allAborted: EventCallable<string[]>;

  constructor() {
    this.abort = createEvent<string>();
    this.abortAll = createEvent<void>();
    this.aborted = createEvent<string>();
    this.allAborted = createEvent<string[]>();

    this._addValidating = createEvent<string>();
    this._removeValidating = createEvent<string>();
    this._clearValidating = createEvent<void>();

    this.$validatingPaths = createStore<ReadonlySet<string>>(new Set())
      .on(this._addValidating, (set, path) => {
        const next = new Set(set);
        next.add(path);
        return next;
      })
      .on(this._removeValidating, (set, path) => {
        const next = new Set(set);
        next.delete(path);
        return next;
      })
      .on(this._clearValidating, () => new Set());

    // abort(path) → do imperative cleanup, then fire `aborted` event
    // The imperative work (clearTimeout, controller.abort) runs in .on() reducer
    // since it's synchronous and doesn't need async. The reducer returns void
    // (no store), so we use a hidden store as a trigger mechanism.
    //
    // Pattern: abort event → .map() does imperative work → fires result event
    sample({
      clock: this.abort,
      fn: (path) => {
        this.cancelSlotImperative(path);
        return path;
      },
      target: this.aborted,
    });

    sample({
      clock: this.abortAll,
      fn: () => {
        const paths = [...this.slots.keys()];
        for (const path of paths) this.cancelSlotImperative(path);
        return paths;
      },
      target: this.allAborted,
    });

    // Wire state cleanup from abort results
    sample({ clock: this.aborted, target: this._removeValidating });
    sample({ clock: this.allAborted, target: this._clearValidating });
  }

  registerField(config: AsyncFieldConfig): void {
    this.fieldConfigs.set(config.path, config);

    // Wire: when this field is aborted, set its validating to false
    sample({
      clock: this.aborted,
      filter: (path) => path === config.path,
      fn: () => false,
      target: config.setValidating,
    });

    // Wire: when all fields are aborted, set validating to false
    sample({
      clock: this.allAborted,
      filter: (paths) => paths.includes(config.path),
      fn: () => false,
      target: config.setValidating,
    });
  }

  /**
   * Schedule async validators for a field. Cancels any existing run.
   */
  schedule(path: string, value: unknown, ctx: ValidatorCtx, bypassDebounce = false): void {
    const config = this.fieldConfigs.get(path);
    if (!config || config.asyncValidators.length === 0) return;

    // Cancel existing slot (imperative: timer + abort only)
    this.cancelSlotImperative(path);

    // Signal state changes via events
    this._addValidating(path);
    config.setValidating(true);
    config.setError(null);

    const controller = new AbortController();
    let resolvePromise: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const debounceMs = bypassDebounce ? 0 : (config.asyncValidators[0]?.debounce ?? 0);

    const timer =
      debounceMs > 0
        ? setTimeout(() => this.executeAsync(path, value, ctx, controller), debounceMs)
        : null;

    this.slots.set(path, {
      controller,
      debounceTimer: timer,
      promise,
      resolve: resolvePromise!,
    });

    if (debounceMs === 0) {
      this.executeAsync(path, value, ctx, controller);
    }
  }

  /**
   * Cancel a slot's timer and abort controller. Pure imperative — no events fired.
   */
  private cancelSlotImperative(path: string): void {
    const slot = this.slots.get(path);
    if (!slot) return;
    if (slot.debounceTimer) clearTimeout(slot.debounceTimer);
    slot.controller.abort();
    slot.resolve();
    this.slots.delete(path);
  }

  /**
   * Run async validators. Results fire via config's setError/setValidating events.
   */
  private async executeAsync(
    path: string,
    value: unknown,
    ctx: ValidatorCtx,
    controller: AbortController,
  ): Promise<void> {
    const config = this.fieldConfigs.get(path);
    const slot = this.slots.get(path);
    if (!config || !slot) return;

    const ctxWithSignal: ValidatorCtx = { ...ctx, signal: controller.signal };

    try {
      let error: string | null = null;

      for (const entry of config.asyncValidators) {
        let result: ValidationResult;
        if (typeof entry.fn === "function") {
          result = await (entry.fn as Function)(value, ctxWithSignal);
        } else {
          result = await entry.fn.validate(value, ctxWithSignal);
        }

        if (controller.signal.aborted) return;

        if (result !== null) {
          error =
            typeof result === "string"
              ? result
              : Array.isArray(result)
                ? result.map((r) => (typeof r === "string" ? r : r.message)).join("; ")
                : null;
          break;
        }
      }

      if (!controller.signal.aborted) {
        config.setError(error);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (!controller.signal.aborted) {
        config.setError(`Validation threw: ${(err as Error).message}`);
      }
    } finally {
      if (!controller.signal.aborted) {
        config.setValidating(false);
        this._removeValidating(path);
        slot.resolve();
        this.slots.delete(path);
      }
    }
  }

  async flushAll(): Promise<void> {
    const pending = Array.from(this.slots.values()).map((s) => s.promise);
    await Promise.allSettled(pending);
  }

  hasPending(): boolean {
    return this.slots.size > 0;
  }
}
