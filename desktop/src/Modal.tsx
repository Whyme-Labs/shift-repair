import { createContext, useContext, useEffect, useRef } from "react";
import type { ComponentType } from "react";
import { Icon } from "./icons";
import type { DialogProps } from "./types";

export const ModalContext = createContext<ComponentType<DialogProps> | undefined>(undefined);

export function Modal(props: DialogProps) {
  const Surface = useContext(ModalContext) ?? LocalDialog;
  return <Surface {...props} />;
}

function LocalDialog({ title, children, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="sr-modal" aria-labelledby="sr-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="sr-modal-heading"><h2 id="sr-dialog-title">{title}</h2><button type="button" className="sr-icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}
