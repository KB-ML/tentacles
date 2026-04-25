"use client";

import { Each, useModel, View } from "@kbml-tentacles/react";
import { Box, Flex, Heading, Text, TextField } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { ticketsViewModel } from "../../entities/passenger/model";
import { PassengerCard } from "../../entities/passenger/ui/passenger-card";

function CountInput() {
  const vm = useModel(ticketsViewModel);
  const count = useUnit(vm.passengers.$count);
  const replace = useUnit(vm.passengers.replace);

  return (
    <Flex direction="column" gap="1" style={{ maxWidth: 240 }}>
      <Text size="1" color="gray">
        Number of passengers
      </Text>
      <TextField.Root
        type="number"
        min={0}
        max={20}
        value={String(count)}
        onChange={(e) => {
          const n = Math.min(20, Math.max(0, Number(e.target.value) || 0));
          if (n === count) return;
          replace(Array.from({ length: n }, () => ({})));
        }}
      />
    </Flex>
  );
}

function PassengerList() {
  const vm = useModel(ticketsViewModel);
  return (
    <Each
      model={vm.passengers}
      source={vm.passengers.$ids}
      fallback={
        <Text color="gray" size="2">
          Add some passengers above.
        </Text>
      }
    >
      <PassengerCard />
    </Each>
  );
}

export function TicketsPage() {
  return (
    <View model={ticketsViewModel}>
      <Box>
        <Heading size="7" mb="1">
          Tickets order
        </Heading>
        <Text size="2" color="gray" as="p" mb="5">
          Set the number of passengers and fill out their information.
        </Text>
        <Flex direction="column" gap="4">
          <CountInput />
          <Heading size="4">Passengers</Heading>
          <Flex direction="column" gap="3">
            <PassengerList />
          </Flex>
        </Flex>
      </Box>
    </View>
  );
}
