import type { Scope } from "effector";
import { tentaclesWarn } from "../shared/tentacles-error";

export class SidRegistry {
  private readonly global = new Map<string, number>();
  private readonly scoped = new WeakMap<Scope, Map<string, number>>();

  private getRegistry(scope?: Scope): Map<string, number> {
    if (!scope) return this.global;

    let registry = this.scoped.get(scope);
    if (!registry) {
      registry = new Map();
      this.scoped.set(scope, registry);
    }
    return registry;
  }

  private register(sid: string, scope?: Scope): boolean {
    const registry = this.getRegistry(scope);
    const count = registry.get(sid) ?? 0;
    registry.set(sid, count + 1);
    return count > 0;
  }

  public registerUnit(
    unit: { sid?: string | null },
    scope: Scope | undefined,
    registeredSids: string[],
  ): void {
    if (unit.sid) {
      if (this.register(unit.sid, scope)) {
        tentaclesWarn(
          `Duplicate SID detected: "${unit.sid}". ` +
            "This will cause SSR hydration issues. " +
            'Provide a unique "name" to createModel() to fix this or use babel/swc plugin to generate SIDs.',
        );
      }
      registeredSids.push(unit.sid);
    }
  }

  public unregister(sid: string, scope?: Scope): void {
    const registry = this.getRegistry(scope);
    const count = registry.get(sid) ?? 0;
    if (count <= 1) {
      registry.delete(sid);
    } else {
      registry.set(sid, count - 1);
    }
  }
}
