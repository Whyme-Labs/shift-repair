// Deliberately narrow local declarations for public v0.22.7 exports.
// Runtime imports are resolved by Hermes. This is not a copy of the SDK.
declare module "@hermes/plugin-sdk" {
  import type { ComponentType, ReactNode } from "react";
  export const ROUTES_AREA: string;
  export const SIDEBAR_NAV_AREA: string;
  interface Atom<T> { get(): T }
  export const host: {
    state: { profile: Atom<string> };
    onEvent(name: string, callback: (event: unknown) => void): () => void;
  };
  export function useValue<T>(atom: Atom<T>): T;
  export function useGatewayActivationEpoch(): number;
  export function gatewayActivationEpoch(): number;
  export const Dialog: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }>;
  export const DialogContent: ComponentType<{ children: ReactNode; className?: string; bodyClassName?: string; showCloseButton?: boolean; fitContent?: boolean }>;
  export const DialogTitle: ComponentType<{ children: ReactNode; className?: string }>;
  export const DialogDescription: ComponentType<{ children: ReactNode; className?: string }>;
}

declare module "*.css" { const text: string; export default text; }
