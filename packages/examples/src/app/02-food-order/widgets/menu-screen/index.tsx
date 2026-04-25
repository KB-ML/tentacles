"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { dishModel } from "../../entities/dish";
import { restaurantModel } from "../../entities/restaurant";
import { BottomAction, Title } from "../../shared/ui";
import { cartOrderViewModel } from "../../view-models/cart-order-view-model";
import { navigationViewModel } from "../../view-models/navigation-view-model";

function DishCard() {
  const dish = useModel(dishModel);
  const nav = useModel(navigationViewModel);

  const [id, name, price, openDish] = useUnit([dish.$id, dish.$name, dish.$price, nav.openDish]);

  return (
    <Card mb="2" style={{ cursor: "pointer" }} onClick={() => openDish(id)}>
      <Flex justify="between" align="center">
        <Text weight="bold" size="3">
          {name}
        </Text>
        <Text size="3" style={{ color: "var(--accent-a11)" }}>
          {price}₸
        </Text>
      </Flex>
    </Card>
  );
}

export function MenuScreen() {
  const nav = useModel(navigationViewModel);
  const cart = useModel(cartOrderViewModel);
  const [restaurantName, cartTotal, backToRestaurants, openOrder] = useUnit([
    nav.$restaurantName,
    cart.$cartTotalPrice,
    nav.backToRestaurants,
    nav.openOrder,
  ]);

  return (
    <>
      <Box maxWidth="480px" mx="auto" pb="9">
        <Title text={restaurantName} goBack={backToRestaurants} />
        <Box px="4">
          <Heading size="5" mb="3">
            Choose a dish
          </Heading>
          <Each model={restaurantModel} id={restaurantName}>
            <Each model={dishModel} from="dishes">
              <DishCard />
            </Each>
          </Each>
        </Box>
      </Box>
      <BottomAction disabled={cartTotal === 0} onClick={openOrder}>
        {cartTotal === 0 ? "Add a dish to place an order" : `Go to order (${cartTotal}₸)`}
      </BottomAction>
    </>
  );
}
