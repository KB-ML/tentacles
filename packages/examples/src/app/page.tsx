import { createViewContract, createViewModel } from "@kbml-tentacles/core";
import { useView } from "@kbml-tentacles/react";
import { Badge, Box, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { Logo } from "@/shared/ui/logo";

const examples = [
  {
    title: "Todo table",
    href: "/01-todo",
    number: "01",
    description: "Todo list with categories and todos. Demonstrates refs, inverse refs, and SSR.",
    tags: ["refs", "inverse", "SSR"],
  },
  {
    title: "Food order",
    href: "/02-food-order",
    number: "02",
    description:
      "Multi-screen ordering flow with restaurants, dishes, additives, and a cart. Demonstrates nested createMany and per-page view models.",
    tags: ["nested-create", "view-model", "in-page routing"],
  },
  {
    title: "Tickets order",
    href: "/03-tickets-order",
    number: "03",
    description:
      "Regenerate a passenger list from a count input and fill out dynamic, document-type-dependent forms per row.",
    tags: ["dynamic-list", "view-model", "conditional fields"],
  },
  {
    title: "Tree todo list",
    href: "/04-tree-todo-list",
    number: "04",
    description:
      "Recursive todo tree with arbitrary depth using a self-referential model via ref/inverse.",
    tags: ["self-ref", "recursion", "inverse"],
  },
];

export default function Home() {
  return (
    <Flex direction="column" gap="8">
      <Box className="hero">
        <Box className="hero-grid" />
        <Flex direction="column" align="center" gap="5" style={{ position: "relative" }}>
          <Box className="hero-logo">
            <Logo size={48} />
          </Box>
          <Flex direction="column" align="center" gap="2">
            <Heading size="8" align="center" weight="bold">
              Tentacles Examples
            </Heading>
            <Text size="3" color="gray" align="center" style={{ maxWidth: 440 }}>
              Interactive demos showcasing patterns and features of the Tentacles library for
              effector.
            </Text>
          </Flex>
        </Flex>
      </Box>

      <Flex direction="column" gap="4">
        <Text
          size="2"
          color="gray"
          weight="medium"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          Examples
        </Text>
        <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="4">
          {examples.map((example) => (
            <NextLink
              key={example.href}
              href={example.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card asChild size="3" variant="surface" className="example-card">
                <Box>
                  <Flex direction="column" gap="3">
                    <Flex justify="between" align="start">
                      <Flex gap="3" align="center">
                        <Box className="card-number">{example.number}</Box>
                        <Heading size="4">{example.title}</Heading>
                      </Flex>
                      <Text className="card-arrow" size="4" color="gray">
                        &rarr;
                      </Text>
                    </Flex>
                    <Text size="2" color="gray" style={{ lineHeight: 1.6 }}>
                      {example.description}
                    </Text>
                    <Flex gap="2" wrap="wrap">
                      {example.tags.map((tag) => (
                        <Badge key={tag} variant="soft" size="1">
                          {tag}
                        </Badge>
                      ))}
                    </Flex>
                  </Flex>
                </Box>
              </Card>
            </NextLink>
          ))}
        </Grid>
      </Flex>
    </Flex>
  );
}
