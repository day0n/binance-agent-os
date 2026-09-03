"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/** A single-focus combobox: arrows navigate, Enter selects, Escape dismisses. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  compact = false,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((o) => o.value === value);
  const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]));
  function reveal() {
    setActive(
      selected >= 0 && !options[selected].disabled
        ? selected
        : (enabled[0] ?? 0),
    );
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(id + "-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  function choose(index: number) {
    if (options[index] && !options[index].disabled)
      onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className={"bn-select" + (compact ? " compact" : "")} ref={root}>
      <button
        type="button"
        ref={trigger}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? id + "-" + active : undefined}
        disabled={disabled}
        className="select-trigger"
        onClick={() => (open ? setOpen(false) : reveal())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!open) return reveal();
            const at = enabled.indexOf(active);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? enabled.length - 1
                  : (at +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      enabled.length) %
                    enabled.length;
            setActive(enabled[next] ?? 0);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) choose(active);
            else reveal();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === "Tab") setOpen(false);
        }}
      >
        <span>{options[selected]?.label ?? value}</span>
        <ChevronDown size={16} className={open ? "rotated" : ""} />
      </button>
      {open && (
        <div role="listbox" aria-label={label} id={id} className="select-menu">
          {options.map((option, index) => (
            <div
              key={option.value}
              id={id + "-" + index}
              role="option"
              aria-selected={value === option.value}
              aria-disabled={option.disabled || undefined}
              className={"select-option" + (active === index ? " focused" : "")}
              onMouseEnter={() => {
                if (!option.disabled) setActive(index);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!option.disabled) choose(index);
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={15} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Native modal provides focus containment, inert background and Escape support. */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  drawer = false,
}: {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    dialog?.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.documentElement.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={
        "modal" + (wide ? " modal-wide" : "") + (drawer ? " drawer" : "")
      }
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={"关闭" + title}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
