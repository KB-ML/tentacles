"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Box, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { additiveModel } from "../../entities/additive";
import { cartItemModel } from "../../entities/cart-item";
import { dishModel } from "../../entities/dish";
import { selectionRows } from "../../shared/pricing";
import { BottomAction, Title } from "../../shared/ui";
import { cartOrderViewModel } from "../../view-models/cart-order-view-model";
import { navigationViewModel } from "../../view-models/navigation-view-model";

function CartRow() {
  const cartItem = useModel(cartItemModel);
  const [dishId, selections, allAdditives, allDishes] = useUnit([
    cartItem.$dishId,
    cartItem.$selections,
    additiveModel.query().$list,
    dishModel.query().$list,
  ]);

  const dish = allDishes.find((d) => d.id === dishId);
  if (!dish) return null;

  const rows = selectionRows(selections, allAdditives);
  const dishTotal = dish.price + rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <Box mb="4">
      <Flex justify="between" align="center">
        <Text weight="bold" size="3">
          {dish.name}
        </Text>
        <Text size="3" style={{ color: "var(--accent-a11)" }}>
          {dishTotal}₸
        </Text>
      </Flex>
      <Box ml="4" mt="1">
        {rows.map((row, i) => (
          <Flex key={`${row.choice}-${i}`} justify="between" align="center">
            <Text size="2">
              {row.choice}
              {row.showAmount ? ` x ${row.amount}` : ""}
            </Text>
            <Text size="2" color="gray">
              {row.total}₸
            </Text>
          </Flex>
        ))}
      </Box>
    </Box>
  );
}

export function OrderScreen() {
  const nav = useModel(navigationViewModel);
  const cart = useModel(cartOrderViewModel);
  const [totalPrice, isSubmitting, submitOrder, backToMenu] = useUnit([
    cart.$cartTotalPrice,
    cart.$isSubmitting,
    cart.submitOrder,
    nav.backToMenu,
  ]);

  return (
    <>
      <Box maxWidth="480px" mx="auto" pb="9">
        <Title text="Place order" goBack={backToMenu} />
        <Box px="4">
          <Heading size="5" mb="4">
            Your order:
          </Heading>
          <Each model={cartItemModel} source={cart.$cartItemIds}>
            <CartRow />
          </Each>
          <Separator my="3" size="4" />
          <Flex justify="between" align="center">
            <Text weight="bold" size="3">
              Total:
            </Text>
            <Text size="3" style={{ color: "var(--accent-a11)" }}>
              {totalPrice}₸
            </Text>
          </Flex>
        </Box>
      </Box>
      <BottomAction onClick={submitOrder} disabled={isSubmitting}>
        {isSubmitting ? "Placing order..." : "Place order"}
      </BottomAction>
    </>
  );
}
