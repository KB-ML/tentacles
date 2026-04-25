"use client";

import { Box, Button } from "@radix-ui/themes";
import type { ReactNode } from "react";

export function BottomAction({
  onClick,
  children,
  disabled = false,
}: {
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Box
      position="fixed"
      bottom="0"
      left="0"
      width="100%"
      p="4"
      style={{
        borderTop: "1px solid var(--gray-a5)",
        background: "var(--color-panel-solid)",
      }}
    >
      <Box maxWidth="480px" mx="auto">
        <Button size="3" style={{ width: "100%" }} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </Box>
    </Box>
  );
}
