"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  hideCloseButton?: boolean;
}

const SIZE_CLASS = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

export function Modal({ open, onClose, title, children, size = "md", hideCloseButton }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${SIZE_CLASS[size]} bg-[--card-bg] rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up sm:animate-scale-in overflow-hidden border border-[var(--card-border)] max-h-[90vh] flex flex-col`}
      >
        <div className="hidden sm:block absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-[--apple-gray-light] rounded-full z-10" />
        {!hideCloseButton && (
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[--background-secondary] text-[--foreground-tertiary] hover:bg-[--apple-gray-light] transition-colors z-20"
          >
            <Icon name="x" size={16} />
          </button>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
