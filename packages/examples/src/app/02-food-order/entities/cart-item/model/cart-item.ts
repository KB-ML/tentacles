import { createContract } from "@kbml-tentacles/core";
import type { AdditiveSelection } from "../../additive/model/types";

export const cartItemContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("restaurantName", (s) => s<string>())
  .store("dishId", (s) => s<number>())
  .store("selections", (s) => s<AdditiveSelection[]>().default([]))
  .ref("dish", "one", { fk: "dishId" })
  .pk("id");
