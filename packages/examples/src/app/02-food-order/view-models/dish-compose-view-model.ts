import { createPropsContract, createViewContract, createViewModel, eq } from "@kbml-tentacles/core";
import { combine, sample } from "effector";
import type { AdditiveSelection } from "../entities/additive";
import { additiveModel } from "../entities/additive";
import { cartItemModel } from "../entities/cart-item";
import { dishModel } from "../entities/dish";
import { itemTotal } from "../shared/pricing";

const contract = createViewContract()
  .store("selections", (s) => s<AdditiveSelection[]>().default([]))
  .event("chooseAdditive", (e) => e<{ additiveName: string; choice: string }>())
  .event("removeAdditive", (e) => e<string>())
  .event("addToCart", (e) => e<void>());

const props = createPropsContract()
  .store("restaurantName", (s) => s<string>())
  .store("dishId", (s) => s<number | null>());

export const dishComposeViewModel = createViewModel({
  contract,
  props,
  fn: (model, ctx) => {
    const $restaurantName = ctx.props.$restaurantName;
    const $dishId = ctx.props.$dishId;

    model.$selections
      .on(model.chooseAdditive, (sels, { additiveName, choice }) => {
        const existing = sels.find((s) => s.additiveName === additiveName);
        if (!existing) return [...sels, { additiveName, choice, amount: 1 }];
        return sels.map((s) =>
          s.additiveName === additiveName
            ? { additiveName, choice, amount: s.choice === choice ? s.amount + 1 : 1 }
            : s,
        );
      })
      .on(model.removeAdditive, (sels, additiveName) =>
        sels
          .map((s) => (s.additiveName === additiveName ? { ...s, amount: s.amount - 1 } : s))
          .filter((s) => s.amount > 0),
      );

    sample({
      clock: $dishId,
      filter: (id) => id !== null,
      fn: () => [],
      target: model.$selections.set,
    });

    const $currentDish = dishModel.query().where("id", eq($dishId)).$first;

    const $existingCartItem = cartItemModel
      .query()
      .where("restaurantName", eq($restaurantName))
      .where("dishId", eq($dishId)).$first;

    sample({
      clock: $existingCartItem,
      filter: (item) => item !== null,
      fn: (item) => item?.selections ?? [],
      target: model.$selections.set,
    });

    const $currentDishTotalPrice = combine(
      $currentDish,
      model.$selections,
      additiveModel.query().$list,
      (dish, selections, additives) => (dish ? itemTotal(dish.price, selections, additives) : 0),
    );

    const $isInCart = $existingCartItem.map((item) => item !== null);

    const cartSource = {
      restaurantName: $restaurantName,
      dishId: $dishId,
      selections: model.$selections,
      existing: $existingCartItem,
    };

    sample({
      clock: model.addToCart,
      source: cartSource,
      filter: ({ dishId, existing }) => dishId !== null && existing === null,
      fn: ({ restaurantName, dishId, selections }) => ({
        restaurantName,
        dishId: dishId!,
        selections,
      }),
      target: cartItemModel.createFx,
    });

    sample({
      clock: model.addToCart,
      source: cartSource,
      filter: ({ dishId, existing }) => dishId !== null && existing !== null,
      fn: ({ selections, existing }) => ({ id: existing!.id, data: { selections } }),
      target: cartItemModel.updateFx,
    });

    return {
      ...model,
      $currentDishTotalPrice,
      $isInCart,
    };
  },
});
