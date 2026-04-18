// ─── Hidden phantom keys (unique symbols don't appear in autocomplete) ───

declare const _propValue: unique symbol;
declare const _propIsOptional: unique symbol;
declare const _propKind: unique symbol;
declare const _propStoreResult: unique symbol;
declare const _propEventResult: unique symbol;

/** Store-prop metadata (accumulator entry on a props chain) */
export interface PropStoreMeta<T = unknown, IsOptional extends boolean = boolean> {
  readonly [_propKind]: "store";
  readonly [_propValue]: T;
  readonly [_propIsOptional]: IsOptional;
}

/** Event-prop metadata (accumulator entry on a props chain) */
export interface PropEventMeta<T = unknown, IsOptional extends boolean = boolean> {
  readonly [_propKind]: "event";
  readonly [_propValue]: T;
  readonly [_propIsOptional]: IsOptional;
}

export type AnyPropMeta = PropStoreMeta<any, boolean> | PropEventMeta<any, boolean>;

/** Result marker returned by the store-prop builder */
export interface PropStoreResult<T, IsOptional extends boolean> {
  readonly [_propStoreResult]: true;
  readonly [_propValue]: T;
  readonly [_propIsOptional]: IsOptional;
}

/** Result marker returned by the event-prop builder */
export interface PropEventResult<T, IsOptional extends boolean> {
  readonly [_propEventResult]: true;
  readonly [_propValue]: T;
  readonly [_propIsOptional]: IsOptional;
}

/** Chainable store-prop typed result — `.optional()` flips the IsOptional flag */
export type PropStoreTyped<T, IsOptional extends boolean = false> = PropStoreResult<T, IsOptional> &
  (IsOptional extends true
    ? {}
    : {
        optional(): PropStoreTyped<T, true>;
      });

/** Chainable event-prop typed result — `.optional()` flips the IsOptional flag */
export type PropEventTyped<T, IsOptional extends boolean = false> = PropEventResult<T, IsOptional> &
  (IsOptional extends true
    ? {}
    : {
        optional(): PropEventTyped<T, true>;
      });

/**
 * Callable store-prop field builder. Invoke as `s<T>()` to declare a store
 * prop type (reactive value passed down from the caller).
 */
export type PropStoreFieldBuilder = <T>() => PropStoreTyped<T, false>;

/**
 * Callable event-prop field builder. Invoke as `e<T>()` to declare an event
 * prop type (callback invoked by the view model — `T` is the payload type).
 */
export type PropEventFieldBuilder = <T>() => PropEventTyped<T, false>;

/** Collision guard for duplicate prop names */
export type FreshPropName<
  K extends string,
  Props extends Record<string, unknown>,
> = K extends keyof Props ? never : K;

// ─── Accessor symbols ───

export type PropValueSymbol = typeof _propValue;
export type PropIsOptionalSymbol = typeof _propIsOptional;
export type PropKindSymbol = typeof _propKind;
