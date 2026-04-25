import { createContract } from "@kbml-tentacles/core";
import type { AdditiveKind, AdditiveOption } from "./types";

export const additiveContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("name", (s) => s<string>())
  .store("required", (s) => s<boolean>().default(false))
  .store("price", (s) => s<number>().default(0))
  .store("amountPerItem", (s) => s<"single" | "many">().default("single"))
  .store("options", (s) => s<AdditiveOption[]>().default([]))
  .derived("kind", (s) =>
    s.$options.map<AdditiveKind>((options) =>
      options && options.length > 0 ? "select" : "simple",
    ),
  )
  .inverse("dish", "additives")
  .pk("id");
