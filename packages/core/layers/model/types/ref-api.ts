import type { EventCallable, StoreWritable } from "effector";
import type { ModelInstanceId } from "./model-intsance-id";

export type RefManyApi = {
  $ids: StoreWritable<ModelInstanceId[]>;
  add: EventCallable<ModelInstanceId>;
  remove: EventCallable<ModelInstanceId>;
};

export type RefOneApi = {
  $id: StoreWritable<ModelInstanceId | null>;
  set: EventCallable<ModelInstanceId>;
  clear: EventCallable<void>;
};
