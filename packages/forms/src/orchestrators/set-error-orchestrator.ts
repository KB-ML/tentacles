import { createEvent, type EventCallable, type Store, sample } from "effector";
import type { Field } from "../types/field";
import type { SetErrorPayload } from "../types/form-shape";

export interface SetErrorOrchestratorConfig {
  readonly setError: EventCallable<SetErrorPayload>;
  readonly setErrors: EventCallable<Record<string, string>>;
  readonly clearErrors: EventCallable<void | string | string[]>;
  readonly setFormError: EventCallable<string | null>;
  readonly $formError: Store<string | null> & { on: Function };
  readonly formProxy: unknown;
  readonly fields: { path: string; field: Field<unknown> }[];
}

function normalizePath(path: string | (string | number)[]): string {
  return Array.isArray(path) ? path.join(".") : path;
}

export function wireSetErrorOrchestrator(config: SetErrorOrchestratorConfig): void {
  const { setError, setErrors, clearErrors, setFormError, $formError, fields } = config;

  // Wire setFormError → $formError via .on()
  $formError.on(setFormError, (_: string | null, msg: string | null) => msg);

  // __root__ → setFormError
  sample({
    clock: setError,
    filter: (payload) => normalizePath(payload.path) === "__root__",
    fn: (payload) => payload.error,
    target: setFormError,
  });

  // Pre-compute Set for clearErrors — O(P) once instead of O(P) per field
  const _clearPathsSet = createEvent<Set<string> | null>();
  sample({
    clock: clearErrors,
    fn: (paths) => {
      if (paths === undefined) return null; // null = clear all
      const list = Array.isArray(paths) ? paths : [paths];
      return new Set(list);
    },
    target: _clearPathsSet,
  });

  // Per-field wiring: setError / setErrors / clearErrors all route via sample
  for (const { path: fieldPath, field } of fields) {
    // setError targeting this field
    sample({
      clock: setError,
      filter: (payload) => normalizePath(payload.path) === fieldPath,
      fn: (payload) => payload.error,
      target: field.setError,
    });

    // setErrors containing this field's path — O(1) via 'in' operator
    sample({
      clock: setErrors,
      filter: (pathMap) => fieldPath in pathMap,
      fn: (pathMap) => pathMap[fieldPath] ?? null,
      target: field.setError,
    });

    // clearErrors: null = clear all, Set = clear matching — O(1) Set.has per field
    sample({
      clock: _clearPathsSet,
      filter: (set) => set === null || set.has(fieldPath),
      fn: () => null,
      target: field.setError,
    });
  }

  // clearErrors(undefined) also clears form error
  sample({
    clock: _clearPathsSet,
    filter: (set) => set === null,
    fn: () => null,
    target: setFormError,
  });
}
