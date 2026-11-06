import { Dialog, DialogContent, DialogDescription, DialogTitle, host, ROUTES_AREA, SIDEBAR_NAV_AREA, useGatewayActivationEpoch, useValue } from "@hermes/plugin-sdk";
import type { HermesPlugin, RouteContribution, SidebarNavContribution } from "@hermes/plugin-sdk";
import { ShiftRepairApp } from "./App";
import { Icon } from "./icons";
import { createNativeBindings } from "./native";
import type { NativeBindings } from "./native";
import styles from "./styles.css";
import type { DialogProps } from "./types";

function NativeDialog({ title, children, onClose }: DialogProps) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent showCloseButton={false} fitContent>
    <div className="sr-app"><style>{styles}</style><div className="sr-native-modal">
      <div className="sr-modal-heading"><DialogTitle>{title}</DialogTitle><button type="button" className="sr-icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
      <DialogDescription className="sr-only">Review the current ShiftRepair board and submit the changes below.</DialogDescription>
      {children}
    </div></div>
  </DialogContent></Dialog>;
}

function NativeApp({ bindings }: { bindings: NativeBindings }) {
  const profile = useValue(host.state.profile);
  const epoch = useGatewayActivationEpoch();
  return <ShiftRepairApp key={`${profile}:${epoch}`} {...bindings} mode="desktop" dialog={NativeDialog} />;
}

const plugin: HermesPlugin = {
  id: "shiftrepair",
  name: "ShiftRepair",
  register(ctx) {
    const bindings = createNativeBindings(ctx);
    ctx.registerMany([
      { id: "page", area: ROUTES_AREA, data: { path: "/shiftrepair" } satisfies RouteContribution, render: () => <NativeApp bindings={bindings} /> },
      { id: "nav", area: SIDEBAR_NAV_AREA, data: { path: "/shiftrepair", label: "ShiftRepair", codicon: "calendar" } satisfies SidebarNavContribution },
    ]);
  },
};

export default plugin;
