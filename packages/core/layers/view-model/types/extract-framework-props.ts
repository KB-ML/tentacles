import type {
  AnyPropMeta,
  PropEventMeta,
  PropStoreMeta,
  PropValueSymbol,
} from "../../contract/types/props-contract-chain";

// ─── Resolve a single prop value type ───

export type ResolvePropType<P extends AnyPropMeta, _Generics = {}> = P[PropValueSymbol];

// ─── Key filters ───

type RequiredStoreProps<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K] extends PropStoreMeta<any, false> ? K : never;
}[keyof Props];

type OptionalStoreProps<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K] extends PropStoreMeta<any, true> ? K : never;
}[keyof Props];

type RequiredEventProps<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K] extends PropEventMeta<any, false> ? K : never;
}[keyof Props];

type OptionalEventProps<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K] extends PropEventMeta<any, true> ? K : never;
}[keyof Props];

/**
 * What React/Solid/etc components receive. Store props are raw values,
 * event props are callbacks with the payload type. Each can be marked
 * optional via `.optional()` on the builder.
 */
export type ExtractFrameworkProps<Props extends Record<string, AnyPropMeta>, Generics = {}> = {
  [K in RequiredStoreProps<Props>]: ResolvePropType<Props[K], Generics>;
} & {
  [K in OptionalStoreProps<Props>]?: ResolvePropType<Props[K], Generics>;
} & {
  [K in RequiredEventProps<Props>]: (payload: ResolvePropType<Props[K], Generics>) => void;
} & {
  [K in OptionalEventProps<Props>]?: (payload: ResolvePropType<Props[K], Generics>) => void;
};
