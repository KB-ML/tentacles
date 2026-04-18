import { combine, type Store } from "effector";
import type { FormContractChainImpl } from "../contract/form-contract-chain";
import type { FormFieldDescriptor } from "../contract/form-contract-descriptors";
import type { Field } from "../types/field";
import type { FormShape } from "../types/form-shape";
import { buildField } from "./build-field";
import { buildFormArray } from "./build-form-array";
import type { FormRuntimeContext } from "./form-runtime-context";

// ─── Well-known FormShape keys (always present on every form proxy) ─────────

const AGGREGATE_KEYS = new Set([
  "$values",
  "$errors",
  "$errorPaths",
  "$isValid",
  "$isDirty",
  "$isTouched",
  "$isValidating",
  "$dirtyFields",
  "$touchedFields",
  "$validatingFields",
  "$disabled",
]);

const INFRA_STORE_KEYS = new Set([
  "$isSubmitting",
  "$isSubmitted",
  "$isSubmitSuccessful",
  "$submitCount",
  "$formError",
]);

const INFRA_EVENT_KEYS = new Set([
  "submit",
  "reset",
  "resetTo",
  "setValues",
  "setValue",
  "setError",
  "setErrors",
  "clearErrors",
  "setFormError",
  "validate",
  "disable",
  "submitted",
  "rejected",
  "resetCompleted",
]);

const METADATA_KEYS = new Set(["__path", "kind", "__debug"]);

const ALL_WELL_KNOWN = new Set([
  ...AGGREGATE_KEYS,
  ...INFRA_STORE_KEYS,
  ...INFRA_EVENT_KEYS,
  ...METADATA_KEYS,
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOrCreate<T>(cache: Map<string, unknown>, key: string, factory: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = factory();
  cache.set(key, value);
  return value;
}

/**
 * Resolve a sub-contract. If it's a thunk (for recursive forms), call it.
 */
function resolveContract(
  contractOrThunk: unknown,
  isThunk: boolean,
): FormContractChainImpl<any, any> {
  if (isThunk) return (contractOrThunk as () => FormContractChainImpl<any, any>)();
  return contractOrThunk as FormContractChainImpl<any, any>;
}

/**
 * Materialize a field and return it. Handles caching.
 */
function materializeField(
  name: string,
  descriptor: FormFieldDescriptor,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): Field<unknown> {
  const childPath = [...path, name];
  const cacheKey = `field:${childPath.join(".")}`;

  return getOrCreate(context.cache, cacheKey, () =>
    buildField(descriptor, {
      path: childPath,
      makeSid: context.makeSid,
    }),
  );
}

/**
 * Materialize a sub-form proxy.
 */
function materializeSubForm(
  name: string,
  contractOrThunk: unknown,
  isThunk: boolean,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): FormShape<any> {
  const childPath = [...path, name];
  const cacheKey = `sub:${childPath.join(".")}`;

  return getOrCreate(context.cache, cacheKey, () => {
    const subContract = resolveContract(contractOrThunk, isThunk);
    return createFormShapeProxy(subContract, childPath, context);
  });
}

// ─── Aggregate builders ─────────────────────────────────────────────────────

function buildFieldStoresMap(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
  storeKey: "$value" | "$error" | "$dirty" | "$touched" | "$validating",
): Record<string, Store<unknown>> {
  const result: Record<string, Store<unknown>> = {};

  for (const [name, desc] of Object.entries(contract.getFieldDescriptors())) {
    const field = materializeField(name, desc, path, context);
    result[name] = field[storeKey] as Store<unknown>;
  }

  for (const [name, desc] of Object.entries(contract.getSubDescriptors())) {
    const sub = materializeSubForm(name, desc.contract, desc.isThunk, path, context);
    // Map aggregate key from sub-form
    const aggKey =
      storeKey === "$value"
        ? "$values"
        : storeKey === "$error"
          ? "$errors"
          : storeKey === "$dirty"
            ? "$isDirty"
            : storeKey === "$touched"
              ? "$isTouched"
              : "$isValidating";
    result[name] = (sub as unknown as Record<string, Store<unknown>>)[aggKey]!;
  }

  // Arrays are materialized on demand in Phase 7; skip for now

  return result;
}

function buildValuesCombine(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): Store<Record<string, unknown>> {
  const stores = buildFieldStoresMap(contract, path, context, "$value");

  // Add sub-form $values
  for (const [name, desc] of Object.entries(contract.getSubDescriptors())) {
    const sub = materializeSubForm(name, desc.contract, desc.isThunk, path, context);
    stores[name] = (sub as any).$values;
  }

  // Add array $values
  for (const name of Object.keys(contract.getArrayDescriptors())) {
    const childPath = [...path, name];
    const cacheKey = `array:${childPath.join(".")}`;
    const arr = context.cache.get(cacheKey) as { $values: Store<unknown> } | undefined;
    if (arr) stores[name] = arr.$values;
  }

  const keys = Object.keys(stores);
  if (keys.length === 0) return combine(() => ({})) as Store<Record<string, unknown>>;

  return combine(stores, (snapshot) => ({ ...snapshot })) as Store<Record<string, unknown>>;
}

function buildErrorsCombine(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): Store<Record<string, unknown>> {
  const stores: Record<string, Store<unknown>> = {};

  for (const [name, desc] of Object.entries(contract.getFieldDescriptors())) {
    const field = materializeField(name, desc, path, context);
    stores[name] = field.$error;
  }

  for (const [name, desc] of Object.entries(contract.getSubDescriptors())) {
    const sub = materializeSubForm(name, desc.contract, desc.isThunk, path, context);
    stores[name] = (sub as any).$errors;
  }

  const keys = Object.keys(stores);
  if (keys.length === 0) return combine(() => ({})) as Store<Record<string, unknown>>;

  return combine(stores, (snapshot) => ({ ...snapshot })) as Store<Record<string, unknown>>;
}

function buildErrorPathsCombine(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): Store<ReadonlyMap<string, string>> {
  const stores: Record<string, Store<unknown>> = {};

  for (const [name, desc] of Object.entries(contract.getFieldDescriptors())) {
    const field = materializeField(name, desc, path, context);
    stores[name] = field.$error;
  }

  for (const [name, desc] of Object.entries(contract.getSubDescriptors())) {
    const sub = materializeSubForm(name, desc.contract, desc.isThunk, path, context);
    stores[name] = (sub as any).$errorPaths;
  }

  const keys = Object.keys(stores);
  if (keys.length === 0) {
    return combine(() => new Map<string, string>()) as Store<ReadonlyMap<string, string>>;
  }

  return combine(stores, (snapshot) => {
    const result = new Map<string, string>();
    for (const [name, val] of Object.entries(snapshot)) {
      if (val instanceof Map) {
        // Sub-form errorPaths — prefix each key
        for (const [subPath, msg] of val as Map<string, string>) {
          result.set(`${name}.${subPath}`, msg);
        }
      } else if (typeof val === "string") {
        // Leaf field error
        result.set(name, val);
      }
      // null means no error — skip
    }
    return result;
  }) as Store<ReadonlyMap<string, string>>;
}

function buildBooleanAggregate(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
  fieldKey: "$dirty" | "$touched" | "$validating",
  formKey: "$isDirty" | "$isTouched" | "$isValidating",
): Store<boolean> {
  const stores: Store<boolean>[] = [];

  for (const [name, desc] of Object.entries(contract.getFieldDescriptors())) {
    const field = materializeField(name, desc, path, context);
    stores.push(field[fieldKey]);
  }

  for (const [name, desc] of Object.entries(contract.getSubDescriptors())) {
    const sub = materializeSubForm(name, desc.contract, desc.isThunk, path, context);
    stores.push((sub as any)[formKey]);
  }

  if (stores.length === 0) return combine(() => false) as Store<boolean>;

  return combine(stores, (list) => list.some(Boolean));
}

function buildPathSetAggregate(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
  fieldKey: "$dirty" | "$touched" | "$validating",
  subFormKey: "$dirtyFields" | "$touchedFields" | "$validatingFields",
): Store<ReadonlySet<string>> {
  const sources: Record<string, Store<unknown>> = {};

  for (const [name, desc] of Object.entries(contract.getFieldDescriptors())) {
    const field = materializeField(name, desc, path, context);
    sources[name] = field[fieldKey];
  }

  for (const [name, desc] of Object.entries(contract.getSubDescriptors())) {
    const sub = materializeSubForm(name, desc.contract, desc.isThunk, path, context);
    sources[`__sub__${name}`] = (sub as any)[subFormKey];
  }

  const keys = Object.keys(sources);
  if (keys.length === 0) return combine(() => new Set<string>()) as Store<ReadonlySet<string>>;

  return combine(sources, (snapshot) => {
    const result = new Set<string>();
    for (const [key, val] of Object.entries(snapshot)) {
      if (key.startsWith("__sub__")) {
        const subName = key.slice(7);
        for (const subPath of val as Set<string>) {
          result.add(`${subName}.${subPath}`);
        }
      } else if (val === true) {
        result.add(key);
      }
    }
    return result;
  }) as Store<ReadonlySet<string>>;
}

// ─── createFormShapeProxy ───────────────────────────────────────────────────

/**
 * Build a lazy form shape proxy for a given contract subtree.
 * Property access materializes fields/sub-forms/arrays on demand.
 */
export function createFormShapeProxy<V extends Record<string, unknown>>(
  contract: FormContractChainImpl<any, any>,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): FormShape<V> {
  const localCache = new Map<string, unknown>();

  // `proxy` is captured by the handler closure for self-referencing aggregates
  // (e.g. $isValid reads $errorPaths from the same proxy)
  let proxy: FormShape<V>;

  const handler: ProxyHandler<FormShape<V>> = {
    get(_, key) {
      if (typeof key === "symbol") return undefined;
      const k = key as string;

      // ─── Metadata ───────────────────────────────────────────────────
      if (k === "__path") return path;
      if (k === "kind") return "form";
      if (k === "__debug") {
        return () => {
          for (const name of contract.entityNames()) {
            void (proxy as unknown as Record<string, unknown>)[name];
          }
          for (const agg of AGGREGATE_KEYS) {
            void (proxy as unknown as Record<string, unknown>)[agg];
          }
          return proxy;
        };
      }

      // ─── Aggregate stores (lazy) ───────────────────────────────────
      if (k === "$values") {
        return getOrCreate(localCache, k, () => buildValuesCombine(contract, path, context));
      }
      if (k === "$errors") {
        return getOrCreate(localCache, k, () => buildErrorsCombine(contract, path, context));
      }
      if (k === "$errorPaths") {
        return getOrCreate(localCache, k, () => buildErrorPathsCombine(contract, path, context));
      }
      if (k === "$isValid") {
        return getOrCreate(localCache, k, () => {
          const $errorPaths = (proxy as any).$errorPaths as Store<ReadonlyMap<string, string>>;
          return $errorPaths.map((m) => m.size === 0);
        });
      }
      if (k === "$isDirty") {
        return getOrCreate(localCache, k, () =>
          buildBooleanAggregate(contract, path, context, "$dirty", "$isDirty"),
        );
      }
      if (k === "$isTouched") {
        return getOrCreate(localCache, k, () =>
          buildBooleanAggregate(contract, path, context, "$touched", "$isTouched"),
        );
      }
      if (k === "$isValidating") {
        return getOrCreate(localCache, k, () =>
          buildBooleanAggregate(contract, path, context, "$validating", "$isValidating"),
        );
      }
      if (k === "$dirtyFields") {
        return getOrCreate(localCache, k, () =>
          buildPathSetAggregate(contract, path, context, "$dirty", "$dirtyFields"),
        );
      }
      if (k === "$touchedFields") {
        return getOrCreate(localCache, k, () =>
          buildPathSetAggregate(contract, path, context, "$touched", "$touchedFields"),
        );
      }
      if (k === "$validatingFields") {
        return getOrCreate(localCache, k, () =>
          buildPathSetAggregate(contract, path, context, "$validating", "$validatingFields"),
        );
      }
      if (k === "$disabled") {
        return getOrCreate(localCache, k, () => {
          const infra = context.infrastructure["$disabled"];
          return infra ?? combine(() => false);
        });
      }

      // ─── Infrastructure stores/events ───────────────────────────────
      if (INFRA_STORE_KEYS.has(k) || INFRA_EVENT_KEYS.has(k)) {
        return context.infrastructure[k];
      }

      // ─── Fields / sub-forms / arrays ────────────────────────────────
      const fieldDesc = contract.getFieldDescriptors()[k];
      if (fieldDesc) {
        return materializeField(k, fieldDesc, path, context);
      }

      const subDesc = contract.getSubDescriptors()[k];
      if (subDesc) {
        return materializeSubForm(k, subDesc.contract, subDesc.isThunk, path, context);
      }

      const arrayDesc = contract.getArrayDescriptors()[k];
      if (arrayDesc) {
        const childPath = [...path, k];
        const cacheKey = `array:${childPath.join(".")}`;
        if (context.cache.has(cacheKey)) return context.cache.get(cacheKey);
        return buildFormArray(arrayDesc, childPath, context);
      }

      return undefined;
    },

    has(_, key) {
      if (typeof key === "symbol") return false;
      return contract.hasEntity(key as string) || ALL_WELL_KNOWN.has(key as string);
    },

    ownKeys() {
      return [...contract.entityNames(), ...ALL_WELL_KNOWN];
    },

    getOwnPropertyDescriptor(_, key) {
      if (typeof key === "symbol") return undefined;
      const k = key as string;
      if (contract.hasEntity(k) || ALL_WELL_KNOWN.has(k)) {
        return { enumerable: true, configurable: true };
      }
      return undefined;
    },
  };

  proxy = new Proxy({} as FormShape<V>, handler);
  return proxy;
}
