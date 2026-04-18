import { createEvent, createStore, type StoreWritable, sample } from "effector";
import { ContractFieldKind } from "../contract";

/**
 * Creates plain effector stores/events from a contract for ViewModel use.
 *
 * Unlike Model's createUnits (which uses $dataMap-backed virtual stores),
 * ViewModel stores are simple createStore() calls — no instance caching,
 * no $dataMap, no SID registry. Simpler because ViewModels are ephemeral
 * per-component instances, not persistent data entities.
 */
export function createViewModelUnits(
  contract: Record<string, Record<string, unknown>>,
  makeSid: (field: string) => string,
  factoryDefaults?: Record<string, (data: Record<string, unknown>) => unknown>,
): Record<string, unknown> {
  const units: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};

  // Pass 1: resolve static defaults
  for (const key of Object.keys(contract)) {
    const entity = contract[key];
    if (!entity || entity.kind !== ContractFieldKind.State) continue;
    if (entity.hasDefault) {
      data[key] = entity.defaultValue;
    }
  }

  // Pass 2: resolve factory defaults (depend on previously resolved statics)
  if (factoryDefaults) {
    for (const key of Object.keys(factoryDefaults)) {
      const factory = factoryDefaults[key];
      if (factory) {
        data[key] = factory(data);
      }
    }
  }

  // Pass 3: create stores and events (bare-keyed internally)
  for (const key of Object.keys(contract)) {
    const entity = contract[key];
    if (!entity) continue;
    if (entity.kind === ContractFieldKind.Computed) continue;

    if (entity.kind === ContractFieldKind.State) {
      const store = createStore(data[key], { sid: makeSid(key) });
      const set = createEvent({ sid: makeSid(`${key}:set`) });
      store.on(set, (_: unknown, v: unknown) => v);
      Object.defineProperty(store, "set", { value: set, configurable: true });
      units[key] = store;
    } else if (entity.kind === ContractFieldKind.Event) {
      units[key] = createEvent({ sid: makeSid(key) });
    }
  }

  // Pass 4: computed stores — build $-prefixed view for factories
  const prefixedView: Record<string, unknown> = {};
  for (const key of Object.keys(units)) {
    const entity = contract[key];
    if (!entity) continue;
    const needsPrefix = entity.kind === ContractFieldKind.State;
    prefixedView[needsPrefix ? `$${key}` : key] = units[key];
  }
  for (const key of Object.keys(contract)) {
    const entity = contract[key];
    if (!entity || entity.kind !== ContractFieldKind.Computed) continue;
    const factory = entity.factory as (stores: Record<string, unknown>) => unknown;
    const store = factory(prefixedView);
    units[key] = store;
    prefixedView[`$${key}`] = store;
  }

  // Pass 5: resetOn wiring (uses bare keys internally)
  for (const key of Object.keys(contract)) {
    const entity = contract[key];
    if (!entity || entity.kind !== ContractFieldKind.State) continue;
    const resetOn = entity.resetOn as string[] | undefined;
    if (!resetOn || resetOn.length === 0) continue;

    const target = units[key] as StoreWritable<unknown>;
    const defaultValue = entity.defaultValue;

    for (const sourceField of resetOn) {
      const source = units[sourceField] as StoreWritable<unknown> | undefined;
      if (source) {
        sample({ clock: source.updates, fn: () => defaultValue, target });
      }
    }
  }

  // Return $-prefixed view for the ViewModel fn
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(units)) {
    const entity = contract[key];
    if (!entity) continue;
    const needsPrefix =
      entity.kind === ContractFieldKind.State || entity.kind === ContractFieldKind.Computed;
    result[needsPrefix ? `$${key}` : key] = units[key];
  }
  return result;
}
