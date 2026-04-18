import type { FormContractChainImpl } from "../contract/form-contract-chain";

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

  /** SID factory: produces deterministic SIDs */
  makeSid(suffix: string): string;
}

let nextInstanceId = 0;

export function createFormRuntimeContext(
  formName: string,
  rootContract: FormContractChainImpl<any, any>,
  infrastructure: Record<string, unknown>,
  sidRoot?: string,
): FormRuntimeContext {
  const instanceId = nextInstanceId++;
  const sidPrefix = sidRoot ? `${sidRoot}|` : "";
  return {
    formName,
    rootContract,
    infrastructure,
    cache: new Map(),
    makeSid(suffix: string) {
      return `${sidPrefix}tentacles:forms:${formName}:${instanceId}:${suffix}`;
    },
  };
}
