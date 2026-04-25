"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { restaurantModel } from "../../entities/restaurant";
import { navigationViewModel } from "../../view-models/navigation-view-model";

function RestaurantCard() {
  const restaurant = useModel(restaurantModel);
  const nav = useModel(navigationViewModel);

  const [name, description, category, openRestaurant] = useUnit([
    restaurant.$name,
    restaurant.$description,
    restaurant.$category,
    nav.openRestaurant,
  ]);

  return (
    <Card mb="3" style={{ cursor: "pointer" }} onClick={() => openRestaurant(name)}>
      <Flex direction="column" gap="1">
        <Text weight="bold" size="4">
          {name}
        </Text>
        <Flex gap="2">
          {category.map((item) => (
            <Text key={item} size="1" color="gray" style={{ textTransform: "capitalize" }}>
              {item}
            </Text>
          ))}
        </Flex>
        <Text size="2" color="gray">
          {description}
        </Text>
      </Flex>
    </Card>
  );
}

export function RestaurantsScreen() {
  return (
    <Box maxWidth="480px" mx="auto" p="4">
      <Heading size="6" mb="4">
        Choose a restaurant
      </Heading>
      <Each model={restaurantModel} source={restaurantModel.$ids}>
        <RestaurantCard />
      </Each>
    </Box>
  );
}
