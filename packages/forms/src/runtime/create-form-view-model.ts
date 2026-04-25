import {
  createViewContract,
  createViewModel,
  detectSidRoot,
  type PropsContractChainImpl,
} from "@kbml-tentacles/core";
import { type EventCallable, sample } from "effector";
import {
  FormContractChainImpl,
  FormContractError,
  type InferFieldsFromChain,
} from "../contract/form-contract-chain";
import type { ReValidationMode, ValidationMode } from "../contract/types/validator";
import { wireResetOrchestrator } from "../orchestrators/reset-orchestrator";
import { wireSetErrorOrchestrator } from "../orchestrators/set-error-orchestrator";
import { wireSubmitOrchestrator } from "../orchestrators/submit-orchestrator";
import type {
  FormFieldAccessors,
  FormShape,
  KeepStateOptions,
  SetErrorPayload,
  SetValuePayload,
} from "../types/form-shape";
import { type FieldEntry, ValidationRunner } from "../validation/validation-runner";
import { createFormShapeProxy } from "./build-form-shape";
import { createFormRuntimeContext } from "./form-runtime-context";

// ─── Config types ───────────────────────────────────────────────────────────

/** Inferred form shape: FormShape + per-field accessor (Field / FormShape / FormArrayShape). */
type InferFormShape<FC> =
  FC extends FormContractChainImpl<infer Fields, infer _CV>
    ? FormShape<Fields & Record<string, unknown>> &
        FormFieldAccessors<Fields & Record<string, unknown>>
    : FormShape<Record<string, unknown>>;

export interface FormViewModelConfig<FC, R = InferFormShape<FC>> {
  readonly name?: string;
  readonly contract: FC;
  readonly props?: PropsContractChainImpl<any>;
  readonly validate?: {
    mode?: ValidationMode;
    reValidate?: ReValidationMode;
    criteriaMode?: "firstError" | "all";
    delayError?: number;
  };
  readonly resetOptions?: KeepStateOptions;
  readonly preventDoubleSubmit?: boolean;
  readonly initialValues?: Record<string, unknown>;
  readonly fn?: (form: InferFormShape<FC>, ctx: Record<string, unknown>) => R;
}

// ─── createFormViewModel ────────────────────────────────────────────────────

/**
 * Create a form view model from a form contract.
 *
 * Returns a standard `ViewModelDefinition` — `.create()`, `.extend()`,
 * `<View>`, `useModel` all work unchanged.
 */
export function createFormViewModel<
  FC extends FormContractChainImpl<any, any>,
  R = InferFormShape<FC>,
>(config: FormViewModelConfig<FC, R>) {
  // Capture the user-level sidRoot BEFORE inner factory calls (createViewContract,
  // createViewModel) create their own withFactory scopes and shadow it.
  const sidRoot = detectSidRoot();

  const {
    name = "unnamed",
    contract,
    props,
    validate,
    preventDoubleSubmit = true,
    fn: userFn,
  } = config;

  if (!(contract instanceof FormContractChainImpl)) {
    throw new FormContractError("createFormViewModel: `contract` must be a FormContractChainImpl");
  }

  // 1. Build a minimal ViewContractChain for infrastructure stores/events
  const infraContract = createViewContract()
    .store("__formIsSubmitting", (s) => s<boolean>().default(false))
    .store("__formIsSubmitted", (s) => s<boolean>().default(false))
    .store("__formIsSubmitSuccessful", (s) => s<boolean>().default(false))
    .store("__formSubmitCount", (s) => s<number>().default(0))
    .store("__formFormError", (s) => s<string | null>().default(null))
    .store("__formDisabled", (s) => s<boolean>().default(false))
    .event("__formSubmit", (e) => e<void>())
    .event("__formReset", (e) => e<void | any>())
    .event("__formResetTo", (e) => e<any>())
    .event("__formSetValues", (e) => e<any>())
    .event("__formSetValue", (e) => e<SetValuePayload>())
    .event("__formSetError", (e) => e<SetErrorPayload>())
    .event("__formSetErrors", (e) => e<Record<string, string>>())
    .event("__formClearErrors", (e) => e<void | string | string[]>())
    .event("__formSetFormError", (e) => e<string | null>())
    .event("__formValidate", (e) => e<void | string | string[]>())
    .event("__formDisable", (e) => e<boolean>());

  // 2. Wrap createViewModel
  return createViewModel({
    contract: infraContract,
    name,
    props: props as PropsContractChainImpl<any> | undefined,
    fn: (stores: any, ctx: any) => {
      // Map infrastructure stores from the auto-generated names
      const infrastructure: Record<string, unknown> = {
        $isSubmitting: stores.$__formIsSubmitting,
        $isSubmitted: stores.$__formIsSubmitted,
        $isSubmitSuccessful: stores.$__formIsSubmitSuccessful,
        $submitCount: stores.$__formSubmitCount,
        $formError: stores.$__formFormError,
        $disabled: stores.$__formDisabled,
        submit: stores.__formSubmit,
        reset: stores.__formReset,
        resetTo: stores.__formResetTo,
        setValues: stores.__formSetValues,
        setValue: stores.__formSetValue,
        setError: stores.__formSetError,
        setErrors: stores.__formSetErrors,
        clearErrors: stores.__formClearErrors,
        setFormError: stores.__formSetFormError,
        validate: stores.__formValidate,
        disable: stores.__formDisable,
      };

      // 3. Build form runtime context (validation config + parent broadcast
      //    events are wired below once the runner is created).
      const formContext = createFormRuntimeContext(
        name,
        contract,
        infrastructure,
        sidRoot,
        validate,
      );

      // 4. Build the lazy form shape proxy
      const formShape = createFormShapeProxy(contract, [], formContext);

      // 5. Collect field entries recursively (including sub-form fields)
      const fieldEntries: FieldEntry[] = [];
      collectFields(contract, formShape, [], fieldEntries);

      function collectFields(
        c: FormContractChainImpl<any, any>,
        proxy: any,
        prefix: string[],
        out: FieldEntry[],
      ) {
        for (const [fieldName, desc] of Object.entries(c.getFieldDescriptors())) {
          const field = proxy[fieldName];
          if (field?.kind === "field") {
            const fullPath = [...prefix, fieldName].join(".");
            out.push({ path: fullPath, field, descriptor: desc });
          }
        }
        for (const [subName, subDesc] of Object.entries(c.getSubDescriptors())) {
          const subProxy = proxy[subName];
          const subContract = subDesc.isThunk ? (subDesc.contract as Function)() : subDesc.contract;
          if (subProxy?.kind === "form") {
            collectFields(subContract, subProxy, [...prefix, subName], out);
          }
        }
      }

      // 6. Wire validation runner
      const validationRunner = new ValidationRunner({
        fields: fieldEntries,
        validationConfig: validate,
        crossValidators: contract.getCrossValidators().map((cv) => cv.validator),
      });

      // Expose runner's broadcast events to descendants (array rows) so
      // `validateAll` / `showAllErrors` propagate into per-row runners.
      formContext.parentValidation = {
        validateAll: validationRunner.validateAll,
        showAllErrors: validationRunner.showAllErrors,
      };

      // Wire form-level `validate()` → validateAll + showAllErrors. Without
      // this, `shape.validate()` is a no-op.
      sample({
        clock: infrastructure.validate as EventCallable<void | string | string[]>,
        target: validationRunner.validateAll,
      });
      sample({
        clock: infrastructure.validate as EventCallable<void | string | string[]>,
        target: validationRunner.showAllErrors,
      });

      // 7. Wire submit orchestrator
      const { submitted, rejected } = wireSubmitOrchestrator({
        submit: infrastructure.submit as EventCallable<void>,
        $isSubmitting: infrastructure.$isSubmitting as any,
        $isSubmitted: infrastructure.$isSubmitted as any,
        $isSubmitSuccessful: infrastructure.$isSubmitSuccessful as any,
        $submitCount: infrastructure.$submitCount as any,
        $isValid: (formShape as any).$isValid,
        $values: (formShape as any).$values,
        $errors: (formShape as any).$errors,
        preventDoubleSubmit,
        validateAll: validationRunner.validateAll,
        showAllErrors: validationRunner.showAllErrors,
      });

      // Attach lifecycle events to infrastructure
      (infrastructure as any).submitted = submitted;
      (infrastructure as any).rejected = rejected;

      // 8. Wire reset orchestrator
      const { resetCompleted } = wireResetOrchestrator({
        reset: infrastructure.reset as EventCallable<any>,
        resetTo: infrastructure.resetTo as EventCallable<any>,
        $isSubmitted: infrastructure.$isSubmitted as any,
        $isSubmitSuccessful: infrastructure.$isSubmitSuccessful as any,
        $submitCount: infrastructure.$submitCount as any,
        $formError: infrastructure.$formError as any,
        fields: fieldEntries,
      });
      (infrastructure as any).resetCompleted = resetCompleted;

      // 9. Wire set-error orchestrator
      wireSetErrorOrchestrator({
        setError: infrastructure.setError as EventCallable<SetErrorPayload>,
        setErrors: infrastructure.setErrors as EventCallable<Record<string, string>>,
        clearErrors: infrastructure.clearErrors as EventCallable<any>,
        setFormError: infrastructure.setFormError as EventCallable<string | null>,
        $formError: infrastructure.$formError as any,
        formProxy: formShape,
        fields: fieldEntries,
      });

      // 10. Wire setValues — distribute partial values to individual fields
      const setValuesEvent = infrastructure.setValues as EventCallable<Record<string, unknown>>;
      for (const { path, field } of fieldEntries) {
        sample({
          clock: setValuesEvent,
          filter: (values: Record<string, unknown>) => Object.hasOwn(values, path),
          fn: (values: Record<string, unknown>) => values[path],
          target: field.changed,
        });
      }

      // 11. Kick off initial validation when mode shows errors eagerly, so
      //     defaults-based errors (e.g. required) appear on mount rather
      //     than only after the first change/blur/submit.
      const initialMode = validate?.mode ?? "submit";
      if (initialMode === "all" || initialMode === "change") {
        validationRunner.validateAll();
      }

      // 12. Call user fn if provided
      if (userFn) {
        return userFn(formShape as InferFormShape<FC>, ctx);
      }

      return formShape as InferFormShape<FC>;
    },
  }) as unknown as import("@kbml-tentacles/core").ViewModelDefinition<R>;
}
