import type { Model } from "../model";
import type { ModelInstanceId } from "./model-intsance-id";

export type InstanceMeta = {
  __id: ModelInstanceId;
  __model: Model<any, any, any>;
};
