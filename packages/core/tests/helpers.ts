import { createContract, createModel } from "../index";

export function counterContract() {
  return createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("increment", (e) => e<void>())
    .pk("id");
}

export function counterModel(name?: string) {
  const contract = counterContract();
  return createModel({
    contract,
    name,
    fn: ({ $count, increment }) => {
      $count.on(increment, (n) => n + 1);
      return { $count, increment };
    },
  });
}

export function captureWarnings(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
  // biome-ignore lint/suspicious/noAssignInExpressions: suppress for tests
  return { warnings, restore: () => (console.warn = origWarn) };
}
