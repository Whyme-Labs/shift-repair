import { gatewayActivationEpoch, host } from "@hermes/plugin-sdk";
import type { PluginContext } from "@hermes/plugin-sdk";
import { normalizeSdkError, ScopeChangedError } from "./api";
import type { AppProps, ExportFile, Rest, SaveFile } from "./types";

export type NativeBindings = Required<Pick<AppProps, "rest" | "saveFile" | "getScopeKey" | "subscribe" | "startPolling">>;

export function createNativeBindings(ctx: PluginContext): NativeBindings {
  let active = true;
  ctx.onDispose(() => { active = false; });
  const getScopeKey = () => `${host.state.profile.get()}:${gatewayActivationEpoch()}:${active ? "active" : "disabled"}`;
  const current = (scope: string) => active && getScopeKey() === scope;

  const rest: Rest = async <T>(path: string, options?: Parameters<Rest>[1]): Promise<T> => {
    const scope = getScopeKey();
    if (!active) throw new ScopeChangedError();
    try {
      const result = await ctx.rest<T>(path, options);
      if (!current(scope)) throw new ScopeChangedError();
      return result;
    } catch (error) {
      if (!current(scope)) throw new ScopeChangedError();
      throw normalizeSdkError(error);
    }
  };

  const saveFile: SaveFile = async (file: ExportFile) => {
    const scope = getScopeKey();
    if (!active) return "cancelled";
    if (!ctx.files?.requestFolder || !ctx.files?.writeText) throw new Error("This Hermes Desktop version does not expose the plugin file save API. Update Desktop or export through the local preview.");
    const result = await ctx.files.requestFolder();
    if (!current(scope)) return "cancelled";
    if (!result.ok) throw new Error(result.message);
    if (!result.folder) return "cancelled";
    const basename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "shiftrepair.csv";
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
    const filename = `${basename.replace(/\.csv$/i, "")}-${stamp}.csv`;
    const written = await ctx.files.writeText(result.folder.id, filename, file.content, { exclusive: true });
    if (!current(scope)) return "cancelled";
    if (!written.ok) throw new Error(written.message);
    return "saved";
  };

  return {
    rest, saveFile, getScopeKey,
    subscribe(refresh) {
      const scope = getScopeKey();
      if (!active) return () => {};
      return ctx.onEvent("plugin.shiftrepair.board.updated", () => { if (current(scope)) refresh(); });
    },
    startPolling(refresh, intervalMs) {
      const scope = getScopeKey();
      if (!active) return () => {};
      return ctx.setInterval(() => { if (current(scope)) refresh(); }, intervalMs);
    },
  };
}
