import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import client from "./hologram.telemetry";

const Context = createContext(client);

export function PostHogProvider({
  children
}: {
  children: ReactNode;
  client?: unknown;
}) {
  return (
    <Context.Provider value={client}>
      {children}
    </Context.Provider>
  );
}

export function usePostHog() {
  return useContext(Context);
}
