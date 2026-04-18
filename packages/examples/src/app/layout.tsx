import { EffectorNext } from "@effector/next";
import { Box, Container, Flex } from "@radix-ui/themes";
import type { Metadata } from "next";

import "@radix-ui/themes/styles.css";
import "./global.css";

import { Header } from "@/widgets/header";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Tentacles examples",
  description: "Example apps using tentacles library",
};

const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.add(d?"dark":"light");document.documentElement.style.colorScheme=d?"dark":"light";document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: Suppress color theme flashbang */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <EffectorNext>
          <Providers>
            <Box asChild style={{ minHeight: "100vh" }}>
              <Flex direction="column">
                <Header />
                <Box flexGrow="1" py="6" px="4">
                  <Container size="4">{children}</Container>
                </Box>
              </Flex>
            </Box>
          </Providers>
        </EffectorNext>
      </body>
    </html>
  );
}
