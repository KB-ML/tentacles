import type { DeepErrors, DeepPartial, FormShape, ResetPayload } from "@kbml-tentacles/forms";
import { useUnit } from "effector-solid";
import type { Accessor } from "solid-js";

export interface UseFormResult<V> {
  values: Accessor<V>;
  errors: Accessor<DeepErrors<V>>;
  isValid: Accessor<boolean>;
  isDirty: Accessor<boolean>;
  isTouched: Accessor<boolean>;
  isSubmitting: Accessor<boolean>;
  isSubmitted: Accessor<boolean>;
  isSubmitSuccessful: Accessor<boolean>;
  submitCount: Accessor<number>;
  formError: Accessor<string | null>;
  disabled: Accessor<boolean>;
  submit: () => void;
  reset: (payload?: undefined | ResetPayload<V>) => void;
  setValues: (values: DeepPartial<V>) => void;
  clearErrors: (paths?: undefined | string | string[]) => void;
  validate: (paths?: undefined | string | string[]) => void;
  disable: (disabled: boolean) => void;
}

export function useForm<V extends Record<string, unknown>>(form: FormShape<V>): UseFormResult<V> {
  const bound = useUnit({
    values: form.$values,
    errors: form.$errors,
    isValid: form.$isValid,
    isDirty: form.$isDirty,
    isTouched: form.$isTouched,
    isSubmitting: form.$isSubmitting,
    isSubmitted: form.$isSubmitted,
    isSubmitSuccessful: form.$isSubmitSuccessful,
    submitCount: form.$submitCount,
    formError: form.$formError,
    disabled: form.$disabled,
    submit: form.submit,
    reset: form.reset,
    setValues: form.setValues,
    clearErrors: form.clearErrors,
    validate: form.validate,
    disable: form.disable,
  });

  return {
    values: bound.values as Accessor<V>,
    errors: bound.errors as Accessor<DeepErrors<V>>,
    isValid: bound.isValid as Accessor<boolean>,
    isDirty: bound.isDirty as Accessor<boolean>,
    isTouched: bound.isTouched as Accessor<boolean>,
    isSubmitting: bound.isSubmitting as Accessor<boolean>,
    isSubmitted: bound.isSubmitted as Accessor<boolean>,
    isSubmitSuccessful: bound.isSubmitSuccessful as Accessor<boolean>,
    submitCount: bound.submitCount as Accessor<number>,
    formError: bound.formError as Accessor<string | null>,
    disabled: bound.disabled as Accessor<boolean>,
    submit: bound.submit as () => void,
    reset: bound.reset as (payload?: undefined | ResetPayload<V>) => void,
    setValues: bound.setValues as (values: DeepPartial<V>) => void,
    clearErrors: bound.clearErrors as (paths?: undefined | string | string[]) => void,
    validate: bound.validate as (paths?: undefined | string | string[]) => void,
    disable: bound.disable as (disabled: boolean) => void,
  };
}
