import {
  combine,
  createEvent,
  createStore,
  type EventCallable,
  type Store,
  sample,
} from "effector";
import type { FormFieldDescriptor } from "../contract/form-contract-descriptors";
import type { Field, SetFieldValuePayload } from "../types/field";
import { deepEqual } from "../utils/deep-equal";

export interface BuildFieldOptions {
  readonly path: readonly (string | number)[];
  readonly makeSid: (suffix: string) => string;
}

/**
 * Materialize a single `Field<T>` from its descriptor.
 * All stores and events are created with deterministic SIDs.
 */
export function buildField<T>(
  descriptor: FormFieldDescriptor,
  options: BuildFieldOptions,
): Field<T> {
  const { path, makeSid } = options;
  const pathStr = path.join(".");

  // ─── Stores ─────────────────────────────────────────────────────────────

  const initialValue = descriptor.hasDefault ? descriptor.defaultValue : undefined;

  const $value = createStore<T>(initialValue as T, {
    sid: makeSid(`${pathStr}:value`),
    skipVoid: false,
  });
  const $default = createStore<T>(initialValue as T, {
    sid: makeSid(`${pathStr}:default`),
    skipVoid: false,
  });
  const $initial = createStore<T>(initialValue as T, {
    sid: makeSid(`${pathStr}:initial`),
    skipVoid: false,
  });
  const $error = createStore<string | null>(null, { sid: makeSid(`${pathStr}:error`) });
  const $warning = createStore<string | null>(null, { sid: makeSid(`${pathStr}:warning`) });
  const $touched = createStore<boolean>(false, { sid: makeSid(`${pathStr}:touched`) });
  const $validating = createStore<boolean>(false, { sid: makeSid(`${pathStr}:validating`) });
  const $disabled = createStore<boolean>(descriptor.isDisabled, {
    sid: makeSid(`${pathStr}:disabled`),
  });

  const $dirty: Store<boolean> = combine($value, $initial, (v, i) => !deepEqual(v, i));

  // ─── Events ─────────────────────────────────────────────────────────────

  const changed = createEvent<T>();
  const blurred = createEvent<void>();
  const setValue = createEvent<SetFieldValuePayload<T>>();
  const setError = createEvent<string | null>();
  const setWarning = createEvent<string | null>();
  const reset = createEvent<void>();
  const resetTo = createEvent<T>();
  const validate = createEvent<void>();

  // ─── Wiring: changed ────────────────────────────────────────────────────

  $value.on(changed, (_, v) => v);
  $touched.on(changed, () => true);

  // ─── Wiring: blurred ────────────────────────────────────────────────────

  $touched.on(blurred, () => true);

  // ─── Wiring: setValue ───────────────────────────────────────────────────

  sample({
    clock: setValue,
    fn: (payload) => payload.value,
    target: $value,
  });

  sample({
    clock: setValue,
    filter: (payload) => payload.shouldTouch === true,
    fn: () => true,
    target: $touched,
  });

  // ─── Wiring: setError / setWarning ──────────────────────────────────────

  $error.on(setError, (_, e) => e);
  $warning.on(setWarning, (_, w) => w);

  // ─── Wiring: reset ─────────────────────────────────────────────────────

  sample({
    clock: reset,
    source: $default,
    target: [$value, $initial],
  });

  $error.on(reset, () => null);
  $warning.on(reset, () => null);
  $touched.on(reset, () => false);
  $validating.on(reset, () => false);

  // ─── Wiring: resetTo ──────────────────────────────────────────────────

  $initial.on(resetTo, (_, v) => v);
  $value.on(resetTo, (_, v) => v);
  $error.on(resetTo, () => null);
  $warning.on(resetTo, () => null);
  $touched.on(resetTo, () => false);
  $validating.on(resetTo, () => false);

  // ─── Build Field<T> ────────────────────────────────────────────────────

  return {
    $value,
    $default,
    $initial,
    $error,
    $warning,
    $dirty,
    $touched,
    $validating,
    $disabled,
    changed,
    blurred,
    setValue,
    setError,
    setWarning,
    reset,
    resetTo,
    validate,
    __path: path,
    __transform: descriptor.transform
      ? {
          parse: descriptor.transform.parse as (d: unknown) => T,
          format: descriptor.transform.format as (v: T) => unknown,
        }
      : undefined,
    kind: "field",
  } as Field<T>;
}
