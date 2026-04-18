import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { Flex, Switch } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { useMounted } from "@/app/providers";
import { $resolved, toggled } from "./model";

export function ThemeSwitcher() {
  const [resolved, onToggle] = useUnit([$resolved, toggled]);
  const mounted = useMounted();
  const isDark = mounted ? resolved === "dark" : false;

  return (
    <Flex align="center" gap="2">
      <SunIcon />
      <Switch size="1" checked={isDark} onCheckedChange={onToggle} />
      <MoonIcon />
    </Flex>
  );
}
