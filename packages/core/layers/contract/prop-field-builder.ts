/**
 * Shared implementation for prop field builders. Both store-props and
 * event-props share the same shape: an `.optional()` toggle and a
 * `.toDescriptor()` reader. Only the `kind` discriminant differs.
 */
class PropTypedImpl {
  private _isOptional = false;

  constructor(private readonly kind: "store" | "event") {}

  optional(): this {
    this._isOptional = true;
    return this;
  }

  toDescriptor(): PropDescriptor {
    return { kind: this.kind, isOptional: this._isOptional };
  }
}

/**
 * Create a callable store-prop field builder. Invoked as `s<T>()` to produce
 * a typed store-prop result.
 */
export function createPropStoreFieldBuilder(): () => PropTypedImpl {
  return function propStoreFieldBuilder() {
    return new PropTypedImpl("store");
  };
}

/**
 * Create a callable event-prop field builder. Invoked as `e<T>()` to produce
 * a typed event-prop result.
 */
export function createPropEventFieldBuilder(): () => PropTypedImpl {
  return function propEventFieldBuilder() {
    return new PropTypedImpl("event");
  };
}

export interface PropDescriptor {
  kind: "store" | "event";
  isOptional: boolean;
}
