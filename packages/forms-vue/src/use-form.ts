import type { DeepErrors, DeepPartial, FormShape, ResetPayload } from "@kbml-tentacles/forms";
import { useUnit } from "effector-vue/composition";
import type { Ref } from "vue";

export interface UseFormResult<V> {
  values: Ref<V>;
  errors: Ref<DeepErrors<V>>;
  isValid: Ref<boolean>;
  isDirty: Ref<boolean>;
  isTouched: Ref<boolean>;
  isSubmitting: Ref<boolean>;
  isSubmitted: Ref<boolean>;
  isSubmitSuccessful: Ref<boolean>;
  submitCount: Ref<number>;
  formError: Ref<string | null>;
  disabled: Ref<boolean>;
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
    values: bound.values as Ref<V>,
    errors: bound.errors as Ref<DeepErrors<V>>,
    isValid: bound.isValid as Ref<boolean>,
    isDirty: bound.isDirty as Ref<boolean>,
    isTouched: bound.isTouched as Ref<boolean>,
    isSubmitting: bound.isSubmitting as Ref<boolean>,
    isSubmitted: bound.isSubmitted as Ref<boolean>,
    isSubmitSuccessful: bound.isSubmitSuccessful as Ref<boolean>,
    submitCount: bound.submitCount as Ref<number>,
    formError: bound.formError as Ref<string | null>,
    disabled: bound.disabled as Ref<boolean>,
    submit: bound.submit as () => void,
    reset: bound.reset as (payload?: undefined | ResetPayload<V>) => void,
    setValues: bound.setValues as (values: DeepPartial<V>) => void,
    clearErrors: bound.clearErrors as (paths?: undefined | string | string[]) => void,
    validate: bound.validate as (paths?: undefined | string | string[]) => void,
    disable: bound.disable as (disabled: boolean) => void,
  };
}
