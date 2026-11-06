import { createContext, useContext, useEffect, useId, useRef } from "react";
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
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="sr-modal" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="sr-modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="sr-icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}
