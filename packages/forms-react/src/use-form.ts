import type { DeepErrors, DeepPartial, FormShape, ResetPayload } from "@kbml-tentacles/forms";
import { useUnit } from "effector-react";

export interface UseFormResult<V> {
  values: V;
  errors: DeepErrors<V>;
  isValid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  isSubmitting: boolean;
  isSubmitted: boolean;
  isSubmitSuccessful: boolean;
  submitCount: number;
  formError: string | null;
  disabled: boolean;
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
    values: bound.values,
    errors: bound.errors,
    isValid: bound.isValid,
    isDirty: bound.isDirty,
    isTouched: bound.isTouched,
    isSubmitting: bound.isSubmitting,
    isSubmitted: bound.isSubmitted,
    isSubmitSuccessful: bound.isSubmitSuccessful,
    submitCount: bound.submitCount,
    formError: bound.formError,
    disabled: bound.disabled,
    submit: bound.submit,
    reset: bound.reset,
    setValues: bound.setValues,
    clearErrors: bound.clearErrors,
    validate: bound.validate,
    disable: bound.disable,
  };
}
