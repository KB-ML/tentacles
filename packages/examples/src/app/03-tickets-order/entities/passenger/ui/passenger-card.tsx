"use client";

import { useField } from "@kbml-tentacles/forms-react";
import { useModel } from "@kbml-tentacles/react";
import { Cross1Icon } from "@radix-ui/react-icons";
import {
  Card,
  Checkbox,
  Flex,
  Heading,
  IconButton,
  SegmentedControl,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { type DocumentType, documentTypes, type Gender, ticketsViewModel } from "../model";
import { DocumentBlock } from "./document-block";

export function PassengerCard() {
  const vm = useModel(ticketsViewModel);
  const row = useModel(vm.passengers);

  const removeRow = useUnit(row.remove);

  const [firstname, lastname, middlename, hasMiddlename, gender, birthday, documentType] = useField(
    [
      row.firstname,
      row.lastname,
      row.middlename,
      row.hasMiddlename,
      row.gender,
      row.birthday,
      row.documentType,
    ],
  );

  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Heading size="3">Passenger #{String(row.key)}</Heading>
          <IconButton variant="ghost" color="gray" onClick={() => removeRow()}>
            <Cross1Icon />
          </IconButton>
        </Flex>

        <Flex gap="3" wrap="wrap" align="start">
          <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 160 }}>
            <Text size="1" color="gray">
              First name
            </Text>
            <TextField.Root
              placeholder="First name"
              color={firstname.error ? "red" : undefined}
              {...firstname.register()}
            />
            {firstname.error && (
              <Text size="1" color="red">
                {firstname.error}
              </Text>
            )}
          </Flex>
          <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 160 }}>
            <Text size="1" color="gray">
              Last name
            </Text>
            <TextField.Root
              placeholder="Last name"
              color={lastname.error ? "red" : undefined}
              {...lastname.register()}
            />
            {lastname.error && (
              <Text size="1" color="red">
                {lastname.error}
              </Text>
            )}
          </Flex>
          <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 160 }}>
            <Text size="1" color="gray">
              Middle name
            </Text>
            <TextField.Root
              placeholder="Middle name"
              disabled={!hasMiddlename.value}
              color={middlename.error ? "red" : undefined}
              {...middlename.register()}
            />
            {middlename.error && (
              <Text size="1" color="red">
                {middlename.error}
              </Text>
            )}
          </Flex>
        </Flex>

        <Text as="label" size="2">
          <Flex gap="2" align="center">
            <Checkbox
              checked={!hasMiddlename.value}
              onCheckedChange={(v) => {
                const noMiddle = v === true;
                hasMiddlename.changed(!noMiddle);
                if (noMiddle) middlename.changed("");
              }}
            />
            No middle name
          </Flex>
        </Text>

        <Flex gap="3" wrap="wrap" align="start">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">
              Gender
            </Text>
            <SegmentedControl.Root
              value={gender.value ?? ""}
              onValueChange={(v) => gender.changed(v as Gender)}
            >
              <SegmentedControl.Item value="m">M</SegmentedControl.Item>
              <SegmentedControl.Item value="f">F</SegmentedControl.Item>
            </SegmentedControl.Root>
            {gender.error && (
              <Text size="1" color="red">
                {gender.error}
              </Text>
            )}
          </Flex>

          <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 160 }}>
            <Text size="1" color="gray">
              Birthday
            </Text>
            <TextField.Root
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              color={birthday.error ? "red" : undefined}
              {...birthday.register()}
            />
            {birthday.error && (
              <Text size="1" color="red">
                {birthday.error}
              </Text>
            )}
          </Flex>
        </Flex>

        <Flex direction="column" gap="1">
          <Text size="1" color="gray">
            Document type
          </Text>
          <Select.Root
            value={documentType.value}
            onValueChange={(v) => documentType.changed(v as DocumentType)}
          >
            <Select.Trigger />
            <Select.Content>
              {documentTypes.map((d) => (
                <Select.Item key={d.value} value={d.value}>
                  {d.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>

        <DocumentBlock />
      </Flex>
    </Card>
  );
}
