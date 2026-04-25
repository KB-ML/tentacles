import { createContract } from "@kbml-tentacles/core";

export const dishContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("name", (s) => s<string>())
  .store("description", (s) => s<string>())
  .store("price", (s) => s<number>())
  .inverse("restaurant", "dishes")
  .ref("additives", "many")
  .pk("id");
