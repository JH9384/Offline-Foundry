// dyad-prism (ours, not Dyad's; see VENDORED.md): the contracts, published to the page so the host
// can check its own answers.
//
// Dyad's renderer types every call it makes but validates no answer at runtime, so a handler that
// returns an object where the contract declares an array crashes a screen with "is not iterable" the
// first time a user opens it, far from the cause. The whole contract set is small and already in the
// bundle, so it is published here as {channel: output schema}: `shell/host.js` parses every answer
// against it, says plainly in the console which channel disagreed, and hands the screen an empty
// value of the right shape instead of a crash.
import * as types from "@/ipc/types";

type Schema = { safeParse: (value: unknown) => { success: boolean; error?: unknown } };
type Contract = { channel?: unknown; output?: unknown };

const shapes: Record<string, Schema> = {};
for (const group of Object.values(types as Record<string, unknown>)) {
  if (!group || typeof group !== "object") continue;
  for (const contract of Object.values(group as Record<string, Contract>)) {
    if (!contract || typeof contract !== "object") continue;
    const { channel, output } = contract;
    if (typeof channel === "string" && output && typeof (output as Schema).safeParse === "function") {
      shapes[channel] = output as Schema;
    }
  }
}

(window as unknown as { __contracts?: Record<string, Schema> }).__contracts = shapes;
