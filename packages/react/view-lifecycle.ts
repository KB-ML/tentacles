import type { ViewModelInstance } from "@kbml-tentacles/core";

// ═══ React Strict Mode lifecycle helpers ═══
//
// React Strict Mode (dev) simulates a mount cycle by running: setup → cleanup → setup.
// A naive `instance.lifecycle.destroy()` in cleanup clears the effector region, so the
// second setup finds dead nodes. A naive `unmount()` (no clearNode) keeps nodes alive
// forever on real unmount, leaking them into the scope via SidRegistry.
//
// The fix: defer both `unmount()` and `destroy()` into a microtask. If Strict Mode's
// simulated remount runs another setup synchronously, the setup cancels the pending
// teardown — neither event fires. On a real unmount no setup follows, so the microtask
// fires `unmount()` then `destroy()`. This matches the contract used by Solid and Vue
// adapters: one `unmounted` event per real component unmount, then the region is cleared.

type Slot = { cancelled: boolean };

const pending = new WeakMap<object, Slot>();

export function scheduleTeardown(instance: ViewModelInstance<unknown>): void {
  const slot: Slot = { cancelled: false };
  pending.set(instance, slot);
  queueMicrotask(() => {
    if (slot.cancelled) return;
    pending.delete(instance);
    instance.lifecycle.unmount();
    instance.lifecycle.destroy();
  });
}

export function cancelTeardown(instance: ViewModelInstance<unknown>): void {
  const slot = pending.get(instance);
  if (!slot) return;
  slot.cancelled = true;
  pending.delete(instance);
}
