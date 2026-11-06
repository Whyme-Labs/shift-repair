import { Dialog, DialogContent, DialogDescription, DialogTitle, gatewayActivationEpoch, host, ROUTES_AREA, SIDEBAR_NAV_AREA, useGatewayActivationEpoch, useValue } from "@hermes/plugin-sdk";
import type { ReactNode } from "react";
import { ShiftRepairApp } from "./App";
import { normalizeSdkError } from "./api";
import { Icon } from "./icons";
import styles from "./styles.css";
import type { DialogProps, ExportFile, Rest, RestOptions, SaveFile } from "./types";

interface Folder { id: string; name: string; path: string }
type FilesResult<T> = { ok: true } & T | { ok: false; error: string; message: string };
interface PluginContext {
  rest<T>(path: string, options?: RestOptions): Promise<T>;
  registerMany(contributions: { id: string; area: string; data: Record<string, unknown>; render?: () => ReactNode }[]): void;
  files?: {
    requestFolder(): Promise<FilesResult<{ folder?: Folder }>>;
    writeText(root: string, path: string, text: string, options?: { exclusive?: boolean }): Promise<FilesResult<unknown>>;
  };
}

function NativeDialog({ title, children, onClose }: DialogProps) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent showCloseButton={false} fitContent>
    <div className="sr-app"><style>{styles}</style><div className="sr-native-modal">
      <div className="sr-modal-heading"><DialogTitle>{title}</DialogTitle><button type="button" className="sr-icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
      <DialogDescription className="sr-only">Review the current ShiftRepair board and submit the changes below.</DialogDescription>
      {children}
    </div></div>
  </DialogContent></Dialog>;
}

const scopeKey = () => `${host.state.profile.get()}:${gatewayActivationEpoch()}`;
const subscribe = (refresh: () => void) => host.onEvent("plugin.shiftrepair.board.updated", refresh);

function NativeApp({ rest, saveFile }: { rest: Rest; saveFile: SaveFile }) {
  const profile = useValue(host.state.profile);
  const epoch = useGatewayActivationEpoch();
  return <ShiftRepairApp key={`${profile}:${epoch}`} rest={rest} saveFile={saveFile} mode="desktop" getScopeKey={scopeKey} subscribe={subscribe} dialog={NativeDialog} />;
}

async function saveNativeFile(ctx: PluginContext, file: ExportFile): Promise<"saved" | "cancelled"> {
  if (!ctx.files?.requestFolder || !ctx.files?.writeText) throw new Error("This Hermes Desktop version does not expose the plugin file save API. Update Desktop or export through the local preview.");
  // Called only by an explicit export click. The picker is owned by Hermes.
  const result = await ctx.files.requestFolder();
  if (!result.ok) {
    if (result.error === "cancelled" || result.error === "canceled") return "cancelled";
    throw new Error(result.message);
  }
  if (!result.folder) return "cancelled";
  const basename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "shiftrepair.csv";
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
  const filename = `${basename.replace(/\.csv$/i, "")}-${stamp}.csv`;
  const written = await ctx.files.writeText(result.folder.id, filename, file.content, { exclusive: true });
  if (!written.ok) throw new Error(written.message);
  return "saved";
}

export default {
  id: "shiftrepair",
  name: "ShiftRepair",
  register(ctx: PluginContext) {
    const rest: Rest = async (path, options) => {
      try { return await ctx.rest(path, options); }
      catch (error) { throw normalizeSdkError(error); }
    };
    const saveFile: SaveFile = (file) => saveNativeFile(ctx, file);
    ctx.registerMany([
      { id: "page", area: ROUTES_AREA, data: { path: "/shiftrepair" }, render: () => <NativeApp rest={rest} saveFile={saveFile} /> },
      { id: "nav", area: SIDEBAR_NAV_AREA, data: { path: "/shiftrepair", label: "ShiftRepair", codicon: "calendar" } },
    ]);
  },
};
