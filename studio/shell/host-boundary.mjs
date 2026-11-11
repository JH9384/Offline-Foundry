// Typed adapter for FoundrySpecification.hostResponseBoundary. The schema belongs
// to the imported renderer contract; this adapter never invents a successful value.
const marker = "dyad-ipc-envelope-v1";
const success = (value) => ({ __dyadIpcEnvelope: marker, ok: true, value });
const refusal = (code, channel, kind, message) => ({
  __dyadIpcEnvelope: marker,
  ok: false,
  error: { name: "DyadError", kind, code, message: `${message}: ${channel}` },
});

export async function invokeHost(channel, args, handler, schema) {
  if (typeof handler !== "function") {
    return refusal("unsupportedChannel", channel, "not_found", "This capability is unavailable in the browser");
  }
  let value;
  try {
    value = await handler(...args);
  } catch {
    return refusal("handlerFailed", channel, "internal", "The browser operation failed");
  }
  // Legacy channels without imported output contracts retain their handler result.
  // Their existence is not evidence of schema coverage or capability completeness.
  if (schema == null) return success(value);
  try {
    if (schema.safeParse(value)?.success !== true) {
      return refusal("invalidResponse", channel, "internal", "The browser response did not match its contract");
    }
  } catch {
    return refusal("validatorFailed", channel, "internal", "The browser response validator failed");
  }
  return success(value);
}

// Both IPC entrypoints preserve the same typed failure. The renderer's generated
// client already decodes the envelope; older direct callers use this adapter.
export function unwrapHost(envelope) {
  if (envelope.ok) return envelope.value;
  throw Object.assign(new Error(envelope.error.message), envelope.error);
}
