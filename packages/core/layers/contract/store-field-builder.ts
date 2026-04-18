import { ContractFieldKind } from "./enums";

export interface StoreDescriptor {
  store: Record<string, unknown>;
  factoryDefault?: (data: Record<string, unknown>) => unknown;
}

/**
 * Create a callable store field builder.
 *
 * Invoked as `s<T>()` to produce a typed store result. The returned value is
 * a function (no per-builder state) — no `.type<T>()` method. Each call
 * returns a fresh `StoreTypedImpl` ready for chaining (`default`, `unique`,
 * `index`, `autoincrement`, `resetOn`).
 */
export function createStoreFieldBuilder(): () => StoreTypedImpl {
  return function storeFieldBuilder(): StoreTypedImpl {
    return new StoreTypedImpl();
  };
}

export class StoreTypedImpl {
  private _hasDefault = false;
  private _defaultValue: unknown = undefined;
  private _isFactory = false;
  private _isUnique = false;
  private _isIndexed = false;
  private _isAutoIncrement = false;
  private _resetOn: string[] = [];

  default(valueOrFactory: unknown): this {
    this._hasDefault = true;
    if (typeof valueOrFactory === "function") {
      this._isFactory = true;
    }
    this._defaultValue = valueOrFactory;
    return this;
  }

  unique(): this {
    this._isUnique = true;
    return this;
  }

  index(): this {
    this._isIndexed = true;
    return this;
  }

  autoincrement(): this {
    this._isAutoIncrement = true;
    this._hasDefault = true;
    return this;
  }

  resetOn(...fields: string[]): this {
    this._resetOn = [...this._resetOn, ...fields];
    return this;
  }

  toDescriptor(): StoreDescriptor {
    const store: Record<string, unknown> = {
      kind: ContractFieldKind.State,
      isUnique: this._isUnique,
      isIndexed: this._isIndexed,
      hasDefault: this._hasDefault,
      isAutoIncrement: this._isAutoIncrement,
    };

    if (this._hasDefault && !this._isFactory && !this._isAutoIncrement) {
      store.defaultValue = this._defaultValue;
    }
    if (this._resetOn.length > 0) {
      store.resetOn = this._resetOn;
    }

    return {
      store,
      factoryDefault: this._isFactory
        ? (this._defaultValue as (data: Record<string, unknown>) => unknown)
        : undefined,
    };
  }
}
