import { createEvent, type EventCallable, type Store, sample } from "effector";
import type { Field } from "../types/field";
import type { KeepStateOptions } from "../types/form-shape";

export interface ResetOrchestratorConfig {
  readonly reset: EventCallable<void | null | (KeepStateOptions & { values?: unknown })>;
  readonly resetTo: EventCallable<unknown | null | undefined>;
  readonly $isSubmitted: Store<boolean> & { on: Function };
  readonly $isSubmitSuccessful: Store<boolean> & { on: Function };
  readonly $submitCount: Store<number> & { on: Function };
  readonly $formError: Store<string | null> & { on: Function };
  readonly fields: { path: string; field: Field<unknown> }[];
}

/**
 * Wires reset and resetTo events.
 * Resets all fields to their $initial values (or new values if provided).
 * Honors KeepStateOptions flags.
 */
export function wireResetOrchestrator(config: ResetOrchestratorConfig): {
  resetCompleted: EventCallable<unknown>;
} {
  const { reset, resetTo, $isSubmitted, $isSubmitSuccessful, $submitCount, $formError, fields } =
    config;

  const resetCompleted = createEvent<unknown>();

  // reset() — resets all fields
  const _doReset = createEvent<KeepStateOptions & { values?: unknown }>();

  sample({
    clock: reset,
    fn: (payload) => (payload ?? {}) as KeepStateOptions & { values?: unknown },
    target: _doReset,
  });

  // resetTo(values) → reset with new values; null/undefined → reset to defaults
  sample({
    clock: resetTo,
    fn: (values) => (values == null ? {} : { values }) as KeepStateOptions & { values?: unknown },
    target: _doReset,
  });

  // Wire each field's reset/clearError via sample — no watch needed
  for (const { path, field } of fields) {
    // Reset to defaults when no values provided, or field not in provided values
    sample({
      clock: _doReset,
      filter: (opts) =>
        !opts.keepValues &&
        (opts.values == null || !Object.hasOwn(opts.values as Record<string, unknown>, path)),
      target: field.reset,
    });
    // Reset to specific values when provided
    sample({
      clock: _doReset,
      filter: (opts) =>
        !opts.keepValues &&
        opts.values != null &&
        Object.hasOwn(opts.values as Record<string, unknown>, path),
      fn: (opts) => (opts.values as Record<string, unknown>)[path],
      target: field.resetTo,
    });
    sample({
      clock: _doReset,
      filter: (opts) => !opts.keepErrors,
      fn: () => null,
      target: field.setError,
    });
  }

  // Reset form-level state
  if ($isSubmitted) {
    $isSubmitted.on(_doReset, (_: boolean, opts: KeepStateOptions) =>
      opts.keepIsSubmitted ? _ : false,
    );
  }
  if ($isSubmitSuccessful) {
    $isSubmitSuccessful.on(_doReset, (_: boolean, opts: KeepStateOptions) =>
      opts.keepIsSubmitSuccessful ? _ : false,
    );
  }
  if ($submitCount) {
    $submitCount.on(_doReset, (_: number, opts: KeepStateOptions) =>
      opts.keepSubmitCount ? _ : 0,
    );
  }
  $formError.on(_doReset, () => null);

  sample({ clock: _doReset, fn: () => ({}), target: resetCompleted });

  return { resetCompleted };
}
