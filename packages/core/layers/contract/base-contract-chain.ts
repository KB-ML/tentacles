import type { Store } from "effector";
import { TentaclesError } from "../shared/tentacles-error";
import { registerChainOps } from "./contract-chain-strategy";
import { ContractFieldKind } from "./enums";
import { createEventFieldBuilder } from "./event-field-builder";
import { createStoreFieldBuilder } from "./store-field-builder";

export type FactoryDefaults = Record<string, (data: Record<string, unknown>) => unknown>;

// Phantom keys for type-level access — defined on the base class so that
// extractors work uniformly on both ModelContractChain and ViewContractChain.
export declare const _bcStores: unique symbol;
export declare const _bcEvents: unique symbol;
export declare const _bcDerived: unique symbol;

/**
 * Abstract base class for data-shape contracts (model & view flavors).
 *
 * Holds the shared chain state — fields, factory defaults, sid root — and the
 * protected helpers (`_addStore`, `_addEvent`, `_addDerived`) that concrete
 * subclasses call from their own typed public methods.
 *
 * Does not expose any typed public methods itself; those live on the subclass
 * so each flavor can carry its own accumulator generics.
 */
export abstract class BaseContractChain<
  Stores extends Record<string, unknown> = {},
  Events extends Record<string, unknown> = {},
  Derived extends Record<string, unknown> = {},
> {
  // Phantom properties for type-level access (never exist at runtime)
  declare readonly [_bcStores]: Stores;
  declare readonly [_bcEvents]: Events;
  declare readonly [_bcDerived]: Derived;

  protected readonly fields: Record<string, Record<string, unknown>> = {};
  protected readonly factoryDefaults: FactoryDefaults = {};

  constructor(protected readonly sidRoot?: string) {
    registerChainOps(this, {
      entityNames: () => Object.keys(this.fields),

      createEmpty: () => {
        const Ctor = this.constructor as new (sidRoot?: string) => BaseContractChain;
        return new Ctor(this.sidRoot);
      },

      copyEntities: (source, names) => {
        const src = source as BaseContractChain;
        const srcFields = src.getFields();
        const srcDefaults = src.getFactoryDefaults();
        for (const key of names) {
          const field = srcFields[key];
          if (field) this.fields[key] = field;
          const factory = srcDefaults[key];
          if (factory) this.factoryDefaults[key] = factory;
        }
      },

      copyAll: (source) => {
        const src = source as BaseContractChain;
        for (const [key, value] of Object.entries(src.getFields())) {
          this.fields[key] = value;
        }
        for (const [key, factory] of Object.entries(src.getFactoryDefaults())) {
          if (factory) this.factoryDefaults[key] = factory;
        }
      },

      applyPartial: (source) => {
        const src = source as BaseContractChain;
        for (const [key, entity] of Object.entries(src.getFields())) {
          if (entity.kind === ContractFieldKind.State) {
            this.fields[key] = {
              ...entity,
              hasDefault: true,
              defaultValue: "defaultValue" in entity ? entity.defaultValue : undefined,
            };
          } else {
            this.fields[key] = entity;
          }
        }
        for (const [key, factory] of Object.entries(src.getFactoryDefaults())) {
          if (factory) this.factoryDefaults[key] = factory;
        }
      },

      applyRequired: (source) => {
        const src = source as BaseContractChain;
        const srcFields = src.getFields();
        for (const [key, entity] of Object.entries(srcFields)) {
          if (entity.kind === ContractFieldKind.State) {
            const { defaultValue: _, ...rest } = entity;
            this.fields[key] = { ...rest, hasDefault: false };
          } else {
            this.fields[key] = entity;
          }
        }
        for (const [key, factory] of Object.entries(src.getFactoryDefaults())) {
          if (!srcFields[key] || srcFields[key].kind !== ContractFieldKind.State) {
            this.factoryDefaults[key] = factory;
          }
        }
      },

      validateRefs: (dropDangling) => {
        const fieldNames = new Set(Object.keys(this.fields));
        for (const [key, entity] of Object.entries(this.fields)) {
          if (entity.kind === ContractFieldKind.Inverse) {
            const refField = entity.refField as string | undefined;
            if (refField && !fieldNames.has(refField)) {
              if (dropDangling) {
                delete this.fields[key];
                continue;
              }
              throw new TentaclesError(
                `Contract utility: inverse "${key}" references missing field "${refField}"`,
              );
            }
          }
        }
      },
    });
  }

  /** Add a store field to the chain. Called from the typed public method. */
  protected _addStore(name: string, builder: (s: unknown) => unknown): void {
    const s = createStoreFieldBuilder();
    // Compat: @effector/swc-plugin may wrap the builder as { sid, name, and: fn }.
    // Unwrap the inner function so the chain keeps working when the plugin
    // decides the call site is factory-like.
    if (
      typeof builder !== "function" &&
      builder !== null &&
      typeof builder === "object" &&
      typeof (builder as { and?: unknown }).and === "function"
    ) {
      builder = (builder as { and: (s: unknown) => unknown }).and;
    }
    const result = builder(s);
    const descriptor = (
      result as {
        toDescriptor(): {
          store: Record<string, unknown>;
          factoryDefault?: (data: Record<string, unknown>) => unknown;
        };
      }
    ).toDescriptor();
    if (descriptor.factoryDefault) {
      this.factoryDefaults[name] = descriptor.factoryDefault;
    }
    this.fields[name] = descriptor.store;
  }

  /** Add an event field to the chain. Called from the typed public method. */
  protected _addEvent(name: string, builder: (e: unknown) => unknown): void {
    const e = createEventFieldBuilder();
    if (
      typeof builder !== "function" &&
      builder !== null &&
      typeof builder === "object" &&
      typeof (builder as { and?: unknown }).and === "function"
    ) {
      builder = (builder as { and: (e: unknown) => unknown }).and;
    }
    this.fields[name] = (builder as Function)(e) as Record<string, unknown>;
  }

  /** Add a derived (computed) field to the chain. Called from the typed public method. */
  protected _addDerived(
    name: string,
    factory: (stores: Record<string, unknown>) => Store<unknown>,
  ): void {
    this.fields[name] = { kind: ContractFieldKind.Computed, factory };
  }

  /**
   * Compose another chain into this one. Throws on field name collisions.
   * Subclasses override the public signature with precise types.
   */
  protected _merge(source: BaseContractChain<any, any, any>): void {
    const sourceFields = source.getFields();
    const sourceDefaults = source.getFactoryDefaults();

    for (const key of Object.keys(sourceFields)) {
      if (key in this.fields) {
        throw new TentaclesError(
          `Contract merge collision: field "${key}" already exists in the target contract`,
        );
      }
      const field = sourceFields[key];
      if (field !== undefined) this.fields[key] = field;
    }

    for (const [key, factory] of Object.entries(sourceDefaults)) {
      if (factory) {
        this.factoryDefaults[key] = factory;
      }
    }
  }

  /** @internal */
  getFields(): Record<string, Record<string, unknown>> {
    return this.fields;
  }

  /** @internal */
  getFactoryDefaults(): FactoryDefaults {
    return this.factoryDefaults;
  }

  /** @internal */
  getSidRoot(): string | undefined {
    return this.sidRoot;
  }
}

/** Extract Stores type from any BaseContractChain subclass */
export type BCStores<T> = T extends { readonly [_bcStores]: infer S } ? S : never;
/** Extract Events type from any BaseContractChain subclass */
export type BCEvents<T> = T extends { readonly [_bcEvents]: infer E } ? E : never;
/** Extract Derived type from any BaseContractChain subclass */
export type BCDerived<T> = T extends { readonly [_bcDerived]: infer D } ? D : never;
