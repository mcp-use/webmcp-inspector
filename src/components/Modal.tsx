import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
export function Modal({
  title,
  children,
  onClose,
  fullscreen = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  fullscreen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={fullscreen ? "modal modal-fullscreen" : "modal"}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="flex items-center justify-between mb-4 gap-2">
          <h2>{title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
