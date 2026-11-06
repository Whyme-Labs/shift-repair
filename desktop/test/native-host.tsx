// A contract-checked host double. It exercises the shipped plugin adapter,
// not Electron, Hermes' renderer or native file-picker UI.
import { atom } from "nanostores";
import { useStore } from "@nanostores/react";
import type * as SDK from "@hermes/plugin-sdk";
import type { PluginContext, PluginContribution, PluginFiles, PluginRestOptions } from "@hermes/plugin-sdk";

const profile = atom("default");
const epoch = atom(0);
export const host = { state: { profile } };
export const useValue = useStore;
export const useGatewayActivationEpoch = () => useStore(epoch);
export const gatewayActivationEpoch = () => epoch.get();
export const ROUTES_AREA = "routes" as const;
export const SIDEBAR_NAV_AREA = "sidebar.nav" as const;
export const Dialog = ({ children }: Parameters<typeof SDK.Dialog>[0]) => <>{children}</>;
export const DialogContent = ({ children, className }: Parameters<typeof SDK.DialogContent>[0]) => <div role="dialog" className={className}>{children}</div>;
export const DialogTitle = ({ children, className }: Parameters<typeof SDK.DialogTitle>[0]) => <h2 className={className}>{children}</h2>;
export const DialogDescription = ({ children, className }: Parameters<typeof SDK.DialogDescription>[0]) => <p className={className}>{children}</p>;

const publicSurface = { host, useValue, useGatewayActivationEpoch, gatewayActivationEpoch, ROUTES_AREA, SIDEBAR_NAV_AREA, Dialog, DialogContent, DialogTitle, DialogDescription } satisfies Pick<typeof SDK, "host" | "useValue" | "useGatewayActivationEpoch" | "gatewayActivationEpoch" | "ROUTES_AREA" | "SIDEBAR_NAV_AREA" | "Dialog" | "DialogContent" | "DialogTitle" | "DialogDescription">;
void publicSurface;

export function activate(name: string, activationEpoch: number) { profile.set(name); epoch.set(activationEpoch); }
export function resetHost() { activate("default", 0); }

export function makeContext({ request, files = {} }: {
  request?: (path: string, options?: PluginRestOptions) => Promise<unknown>;
  files?: Partial<PluginFiles>;
} = {}) {
  let disabled = false;
  const disposers: (() => void)[] = [];
  const contributions = new Map<string, PluginContribution>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const timers = new Set<{ callback: () => void; intervalMs: number }>();
  const calls: { path: string; options?: PluginRestOptions }[] = [];
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected host capability call in this adapter test"); };
  const track = (dispose: () => void) => { disposers.push(dispose); return dispose; };
  const ctx: PluginContext = {
    source: "plugin:shiftrepair",
    onDispose(dispose) { track(dispose); },
    registerMany(items) {
      for (const item of items) contributions.set(item.id, item);
      return track(() => { for (const item of items) contributions.delete(item.id); });
    },
    onEvent(type, callback) {
      const set = listeners.get(type) ?? new Set();
      set.add(callback);
      listeners.set(type, set);
      return track(() => { set.delete(callback); if (!set.size) listeners.delete(type); });
    },
    setInterval(callback, intervalMs) {
      const timer = { callback, intervalMs };
      timers.add(timer);
      return track(() => { timers.delete(timer); });
    },
    async rest<T>(path: string, options?: PluginRestOptions): Promise<T> {
      calls.push({ path, options });
      return await (request ?? unexpected)(path, options) as T;
    },
    files: {
      dataFolder: "data", requestFolder: unexpected, folders: unexpected, release: unexpected,
      list: unexpected, stat: unexpected, readText: unexpected, readDataUrl: unexpected,
      writeText: unexpected, rename: unexpected, trash: unexpected, ...files,
    },
  };
  return {
    ctx, calls, contributions, listeners, timers,
    emit(type: string) { for (const callback of listeners.get(type) ?? []) callback({ type }); },
    tick() { for (const timer of [...timers]) timer.callback(); },
    disable() { if (!disabled) { disabled = true; for (const dispose of disposers) dispose(); } },
  };
}
