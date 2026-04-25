import type { EventCallable } from "effector";
import type { FormContractChainImpl } from "../contract/form-contract-chain";
import type { ValidationConfig } from "../validation/validation-modes";

/**
 * Shared context passed to all builders (buildField, buildSubForm, buildFormArray)
 * during form shape materialization.
 */
export interface FormRuntimeContext {
  /** Form name from createFormViewModel config */
  readonly formName: string;

  /** Root form contract */
  readonly rootContract: FormContractChainImpl<any, any>;

  /** Infrastructure stores and events from the auto-generated ViewContractChain */
  readonly infrastructure: Record<string, unknown>;

  /** Shared memoization across the proxy tree: pathString → materialized object */
  readonly cache: Map<string, unknown>;

  /** Validation config — used by per-row runners in buildFormArray */
  readonly validationConfig?: Partial<ValidationConfig>;

  /**
   * Parent form's validation broadcast events. Per-row runners subscribe so
   * parent-level `validateAll` / `showAllErrors` propagate to array rows.
   *
   * Mutable: assigned after the parent `ValidationRunner` is constructed,
   * since the proxy tree (and therefore array row fns) may materialize lazily.
   */
  parentValidation?: {
    readonly validateAll: EventCallable<void>;
    readonly showAllErrors: EventCallable<void>;
  };

  /** SID factory: produces deterministic SIDs */
  makeSid(suffix: string): string;
}

let nextInstanceId = 0;

export function createFormRuntimeContext(
  formName: string,
  rootContract: FormContractChainImpl<any, any>,
  infrastructure: Record<string, unknown>,
  sidRoot?: string,
  validationConfig?: Partial<ValidationConfig>,
  parentValidation?: FormRuntimeContext["parentValidation"],
): FormRuntimeContext {
  const instanceId = nextInstanceId++;
  const sidPrefix = sidRoot ? `${sidRoot}|` : "";
  return {
    formName,
    rootContract,
    infrastructure,
    cache: new Map(),
    validationConfig,
    parentValidation,
    makeSid(suffix: string) {
      return `${sidPrefix}tentacles:forms:${formName}:${instanceId}:${suffix}`;
    },
  };
}
