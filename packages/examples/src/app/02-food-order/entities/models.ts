import { createModel } from "@kbml-tentacles/core";
import { additiveContract } from "./additive/model/additive";
import { cartItemContract } from "./cart-item/model/cart-item";
import { dishContract } from "./dish/model/dish";
import { restaurantContract } from "./restaurant/model/restaurant";

export const restaurantModel = createModel({
  contract: restaurantContract,
  refs: { dishes: () => dishModel },
});

export const dishModel = createModel({
  contract: dishContract,
  refs: {
    restaurant: () => restaurantModel,
    additives: () => additiveModel,
  },
});

export const additiveModel = createModel({
  contract: additiveContract,
  refs: { dish: () => dishModel },
});

export const cartItemModel = createModel({
  contract: cartItemContract,
  refs: { dish: () => dishModel },
});
