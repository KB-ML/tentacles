"use client";

import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Box, Container, Flex, Link, Separator, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { ThemeSwitcher } from "@/features/theme-switcher";
import { Logo } from "@/shared/ui/logo";

export function Header() {
  return (
    <>
      <Box py="3" px="4" style={{ backgroundColor: "var(--color-panel)" }}>
        <Container size="4">
          <Flex justify="between" align="center">
            <Link asChild underline="none" color="gray" highContrast>
              <NextLink href="/">
                <Flex gap="2" align="center">
                  <Logo size={24} color="var(--brand)" />
                  <Text weight="bold" size="3">
                    Tentacles
                  </Text>
                </Flex>
              </NextLink>
            </Link>
            <Flex align="center" gap="6">
              <ThemeSwitcher />
              <Link
                href="https://github.com/AliLee0923/tentacles"
                target="_blank"
                size="2"
                color="gray"
              >
                <Flex align="center" gap="1">
                  <GitHubLogoIcon />
                </Flex>
              </Link>
            </Flex>
          </Flex>
        </Container>
      </Box>
      <Separator size="4" />
    </>
  );
}
