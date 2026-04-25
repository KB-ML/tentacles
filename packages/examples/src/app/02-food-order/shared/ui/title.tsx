"use client";

import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { Flex, Heading, IconButton } from "@radix-ui/themes";

export function Title({ text, goBack }: { text: string; goBack: () => void }) {
  return (
    <Flex align="center" gap="2" p="4">
      <IconButton variant="ghost" color="gray" onClick={goBack} aria-label="Back">
        <ArrowLeftIcon />
      </IconButton>
      <Heading size="6">{text}</Heading>
    </Flex>
  );
}
