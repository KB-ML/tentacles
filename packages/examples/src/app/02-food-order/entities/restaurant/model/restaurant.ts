import { createContract } from "@kbml-tentacles/core";

export const restaurantContract = createContract()
  .store("name", (s) => s<string>())
  .store("description", (s) => s<string>())
  .store("category", (s) => s<string[]>().default([]))
  .ref("dishes", "many")
  .pk("name");
