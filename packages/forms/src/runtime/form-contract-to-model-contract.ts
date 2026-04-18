import { createContract } from "@kbml-tentacles/core";
import type { FormContractChainImpl } from "../contract/form-contract-chain";

/**
 * Convert a form row contract into a model contract suitable for `createModel`.
 *
 * - Adds a synthetic `__rowId` store with `.autoincrement()` + `.pk("__rowId")`
 * - For each form field descriptor, adds a store with the field's static default
 * - Factory defaults are NOT included in the model contract (they're resolved
 *   by the form layer's `applyDefaults` before passing to `createFx`)
 */
export function formContractToModelContract(formContract: FormContractChainImpl<any, any>) {
  let chain = createContract().store("__rowId", (s) => s<number>().autoincrement());

  // Add a store for each leaf field
  for (const [name, desc] of Object.entries(formContract.getFieldDescriptors())) {
    if (desc.hasDefault && !desc.isFactory) {
      chain = chain.store(name as any, (s: any) => s().default(desc.defaultValue));
    } else {
      chain = chain.store(name as any, (s: any) => s());
    }
  }

  return chain.pk("__rowId");
}

/**
 * Resolve static and factory defaults for a form row contract.
 * Used by `append()` and `prepend()` to fill missing fields before `createFx`.
 */
export function applyDefaults(
  formContract: FormContractChainImpl<any, any>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  const descriptors = formContract.getFieldDescriptors();

  // Pass 1: static defaults
  for (const [name, desc] of Object.entries(descriptors)) {
    if (result[name] === undefined && desc.hasDefault && !desc.isFactory) {
      result[name] = desc.defaultValue;
    }
  }

  // Pass 2: factory defaults (can reference static-defaulted fields)
  for (const [name, desc] of Object.entries(descriptors)) {
    if (result[name] === undefined && desc.hasDefault && desc.isFactory) {
      result[name] = (desc.defaultValue as Function)(result);
    }
  }

  return result;
}
