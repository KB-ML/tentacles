import {
  createEvent,
  createStore,
  type Event,
  type EventCallable,
  type Store,
  sample,
} from "effector";

export interface SubmitOrchestratorConfig {
  readonly submit: EventCallable<void>;
  readonly $isSubmitting: Store<boolean> & { on: Function };
  readonly $isSubmitted: Store<boolean> & { on: Function };
  readonly $isSubmitSuccessful: Store<boolean> & { on: Function };
  readonly $submitCount: Store<number> & { on: Function };
  readonly $isValid: Store<boolean>;
  readonly $values: Store<unknown>;
  readonly $errors: Store<unknown>;
  readonly preventDoubleSubmit: boolean;
  readonly validateAll: EventCallable<void>;
  readonly showAllErrors: EventCallable<void>;
}

export interface SubmitOrchestratorResult {
  readonly submitted: Event<unknown>;
  readonly rejected: Event<unknown>;
}

/**
 * Wires the submit flow:
 * submit → validate → submitted | rejected
 */
export function wireSubmitOrchestrator(config: SubmitOrchestratorConfig): SubmitOrchestratorResult {
  const {
    submit,
    $isSubmitting,
    $isSubmitted,
    $isSubmitSuccessful,
    $submitCount,
    $isValid,
    $values,
    $errors,
    preventDoubleSubmit,
    validateAll,
    showAllErrors,
  } = config;

  const submitted = createEvent<unknown>();
  const rejected = createEvent<unknown>();
  const _submitGated = createEvent<void>();

  // Guard: prevent double submit
  if (preventDoubleSubmit) {
    sample({
      clock: submit,
      source: $isSubmitting,
      filter: (submitting) => !submitting,
      fn: () => undefined as void,
      target: _submitGated,
    });
  } else {
    sample({ clock: submit, target: _submitGated });
  }

  // 1. Set submitting state
  ($isSubmitting as any).on(_submitGated, () => true);
  ($isSubmitted as any).on(_submitGated, () => true);
  ($submitCount as any).on(_submitGated, (c: number) => c + 1);

  // 2. Show all errors + run validation
  sample({ clock: _submitGated, target: showAllErrors });
  sample({ clock: _submitGated, target: validateAll });

  // 3. After validation, check if valid
  // We use $isValid which is derived from $errorPaths
  // Since validation is sync, $isValid is already updated after validateAll fires
  const _validated = createEvent<void>();
  sample({ clock: validateAll, target: _validated });

  // Route to submitted or rejected
  sample({
    clock: _validated,
    source: { isValid: $isValid, values: $values },
    filter: ({ isValid }) => isValid,
    fn: ({ values }) => values,
    target: submitted,
  });

  sample({
    clock: _validated,
    source: { isValid: $isValid, errors: $errors },
    filter: ({ isValid }) => !isValid,
    fn: ({ errors }) => errors,
    target: rejected,
  });

  // 4. End submitting state
  ($isSubmitting as any).on(submitted, () => false);
  ($isSubmitting as any).on(rejected, () => false);
  ($isSubmitSuccessful as any).on(submitted, () => true);
  ($isSubmitSuccessful as any).on(rejected, () => false);

  return { submitted, rejected };
}
