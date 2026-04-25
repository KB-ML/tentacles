"use client";

import { useField } from "@kbml-tentacles/forms-react";
import { useModel } from "@kbml-tentacles/react";
import { Checkbox, Flex, Select, Text, TextField } from "@radix-ui/themes";
import {
  type Citizenship,
  categories,
  citizenships,
  type ServiceCategory,
  ticketsViewModel,
} from "../model";

export function DocumentBlock() {
  const vm = useModel(ticketsViewModel);
  const row = useModel(vm.passengers);

  const [documentType, documentNumber, citizenship, category, startDate, notServed] = useField([
    row.documentType,
    row.documentNumber,
    row.citizenship,
    row.category,
    row.startDate,
    row.notServed,
  ]);

  const isMilitary =
    documentType.value === "military-ticket" || documentType.value === "serviceman-ticket";
  const isForeign = documentType.value === "foreign-id";

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Document number
        </Text>
        <TextField.Root
          placeholder="Document number"
          color={documentNumber.error ? "red" : undefined}
          {...documentNumber.register()}
        />
        {documentNumber.error && (
          <Text size="1" color="red">
            {documentNumber.error}
          </Text>
        )}
      </Flex>

      {isForeign && (
        <Flex direction="column" gap="1">
          <Text size="1" color="gray">
            Citizenship
          </Text>
          <Select.Root
            value={citizenship.value ?? ""}
            onValueChange={(v) => citizenship.changed(v as Citizenship)}
          >
            <Select.Trigger
              placeholder="Select citizenship"
              color={citizenship.error ? "red" : undefined}
            />
            <Select.Content>
              {citizenships.map((c) => (
                <Select.Item key={c.value} value={c.value}>
                  {c.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          {citizenship.error && (
            <Text size="1" color="red">
              {citizenship.error}
            </Text>
          )}
        </Flex>
      )}

      {isMilitary && (
        <>
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">
              Category
            </Text>
            <Select.Root
              value={category.value ?? ""}
              onValueChange={(v) => category.changed(v as ServiceCategory)}
            >
              <Select.Trigger
                placeholder="Select category"
                color={category.error ? "red" : undefined}
              />
              <Select.Content>
                {categories.map((c) => (
                  <Select.Item key={c.value} value={c.value}>
                    {c.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            {category.error && (
              <Text size="1" color="red">
                {category.error}
              </Text>
            )}
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray">
              Service start date
            </Text>
            <TextField.Root
              type="date"
              disabled={notServed.value}
              color={startDate.error ? "red" : undefined}
              {...startDate.register()}
            />
            {startDate.error && (
              <Text size="1" color="red">
                {startDate.error}
              </Text>
            )}
          </Flex>

          <Text as="label" size="2">
            <Flex gap="2" align="center">
              <Checkbox
                checked={notServed.value}
                onCheckedChange={(v) => {
                  const b = v === true;
                  notServed.changed(b);
                  if (b) startDate.changed("");
                }}
              />
              Did not serve
            </Flex>
          </Text>
        </>
      )}
    </Flex>
  );
}
