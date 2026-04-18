/**
 * Re-exports from the contract layer's props contract types.
 *
 * Props contracts have two kinds: store props (reactive values) and event
 * props (callbacks). Each has its own descriptor metadata type and typed
 * builder; this file re-exports them under the names downstream code
 * imports.
 */
export type {
  AnyPropMeta,
  FreshPropName,
  PropEventFieldBuilder,
  PropEventMeta,
  PropEventResult,
  PropEventTyped,
  PropIsOptionalSymbol,
  PropKindSymbol,
  PropStoreFieldBuilder,
  PropStoreMeta,
  PropStoreResult,
  PropStoreTyped,
  PropValueSymbol,
} from "../../contract/types/props-contract-chain";
