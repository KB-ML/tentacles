"use client";

import { Box, Heading } from "@radix-ui/themes";
import type { AdditiveOption } from "../../entities/additive";
import { AdditiveSimple } from "../additive-simple";

export function AdditiveSelect({ name, options }: { name: string; options: AdditiveOption[] }) {
  return (
    <Box mt="3">
      <Heading size="3" mb="2">
        {name}:
      </Heading>
      {options.map((option) => (
        <AdditiveSimple
          key={option.name}
          additiveName={name}
          choice={option.name}
          price={option.price}
          amountPerItem={option.amountPerItem}
        />
      ))}
    </Box>
  );
}
