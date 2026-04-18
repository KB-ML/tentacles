"use client";

import { Theme } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { createContext, useContext, useEffect, useState } from "react";
import { $resolved } from "@/features/theme-switcher";

const MountedContext = createContext(false);
export function useMounted() {
  return useContext(MountedContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const resolved = useUnit($resolved);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.documentElement.style.visibility = "";
  }, []);

  return (
    <MountedContext value={mounted}>
      <Theme
        accentColor="violet"
        grayColor="sand"
        radius="medium"
        appearance={mounted ? resolved : "light"}
        style={mounted ? undefined : { visibility: "hidden" }}
      >
        {children}
      </Theme>
    </MountedContext>
  );
}
