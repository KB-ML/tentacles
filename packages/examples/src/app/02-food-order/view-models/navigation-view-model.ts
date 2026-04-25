import { createViewContract, createViewModel } from "@kbml-tentacles/core";

type Screen = "restaurants" | "menu" | "dish" | "order";

const contract = createViewContract()
  .store("screen", (s) => s<Screen>().default("restaurants"))
  .store("restaurantName", (s) => s<string>().default(""))
  .store("dishId", (s) => s<number | null>().default(null))
  .event("openRestaurant", (e) => e<string>())
  .event("openDish", (e) => e<number>())
  .event("openOrder", (e) => e<void>())
  .event("backToMenu", (e) => e<void>())
  .event("backToRestaurants", (e) => e<void>());

export const navigationViewModel = createViewModel({
  contract,
  fn: (model) => {
    model.$restaurantName
      .on(model.openRestaurant, (_, name) => name)
      .on(model.backToRestaurants, () => "");

    model.$dishId
      .on(model.openDish, (_, id) => id)
      .on(model.openRestaurant, () => null)
      .on(model.backToMenu, () => null)
      .on(model.backToRestaurants, () => null);

    model.$screen
      .on(model.openRestaurant, () => "menu" as const)
      .on(model.openDish, () => "dish" as const)
      .on(model.openOrder, () => "order" as const)
      .on(model.backToMenu, () => "menu" as const)
      .on(model.backToRestaurants, () => "restaurants" as const);

    return model;
  },
});
