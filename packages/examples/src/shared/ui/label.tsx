import { Flex, Text } from "@radix-ui/themes";
import { type ComponentPropsWithoutRef, createElement, type PropsWithChildren } from "react";

type LabelProps<T extends keyof HTMLElementTagNameMap = "label"> = PropsWithChildren<
  { as?: T; title?: string } & ComponentPropsWithoutRef<T>
>;

export const Label = <T extends keyof HTMLElementTagNameMap = "label">({
  as,
  title,
  children,
  ...props
}: LabelProps<T>) =>
  createElement(
    as ?? "label",
    props,
    <Flex direction="column" gap="1">
      {title && (
        <Text size="1" color="gray">
          {title}
        </Text>
      )}
      {children}
    </Flex>,
  );
