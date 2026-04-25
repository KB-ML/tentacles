import {
  createPropsContract,
  createViewContract,
  createViewModel,
  eq,
  type ModelInstanceId,
} from "@kbml-tentacles/core";
import { combine, createEffect, sample } from "effector";
import { additiveModel } from "../entities/additive";
import { cartItemModel } from "../entities/cart-item";
import { dishModel } from "../entities/dish";
import { cartTotal } from "../shared/pricing";

const contract = createViewContract().event("submitOrder", (e) => e<void>());

const props = createPropsContract()
  .store("restaurantName", (s) => s<string>())
  .event("onSubmitted", (e) => e<void>());

export const cartOrderViewModel = createViewModel({
  contract,
  props,
  fn: (model, ctx) => {
    const cartQuery = cartItemModel.query().where("restaurantName", eq(ctx.props.$restaurantName));

    const $cartTotalPrice = combine(
      cartQuery.$list,
      dishModel.query().$list,
      additiveModel.query().$list,
      cartTotal,
    );

    const submitOrderFx = createEffect(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    sample({ clock: model.submitOrder, target: submitOrderFx });

    const clearCartFx = createEffect((ids: readonly ModelInstanceId[]) => {
      for (const id of ids) cartItemModel.delete(id);
    });

    sample({
      clock: submitOrderFx.done,
      source: cartQuery.$ids,
      target: clearCartFx,
    });

    sample({ clock: submitOrderFx.done, target: ctx.props.onSubmitted });

    return {
      ...model,
      $cartItemIds: cartQuery.$ids,
      $cartTotalPrice,
      $isSubmitting: submitOrderFx.pending,
    };
  },
});
