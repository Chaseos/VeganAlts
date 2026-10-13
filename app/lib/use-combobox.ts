import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/**
 * An ARIA 1.2 combobox with a listbox popup, shared by Add a product's food
 * and brand pickers. Arrow keys move through the options (wrapping), Enter
 * chooses the highlighted one, Escape closes, and a pointer press or focus
 * outside the picker closes it. New text clears the highlight. `ready`
 * keeps the popup shut until there's something to show.
 */
export function useCombobox<T>({
  id,
  text,
  options,
  onChoose,
  ready = true,
  error,
}: {
  id: string;
  text: string;
  options: readonly T[];
  onChoose: (option: T) => void;
  ready?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null),
    field = useRef<HTMLInputElement>(null);
  const optionId = useId(),
    listId = `${id}-listbox`,
    errorId = `${id}-error`;
  useEffect(() => setActive(-1), [text]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const showing = open && ready;
  const highlighted = options[active];
  const choose = (option: T) => {
    setOpen(false);
    onChoose(option);
  };
  return {
    showing,
    setOpen,
    field,
    listId,
    errorId,
    rootProps: {
      ref: root,
      onBlur: (event: ReactFocusEvent) => {
        if (!root.current?.contains(event.relatedTarget as Node))
          setOpen(false);
      },
    },
    inputProps: {
      ref: field,
      id: `${id}-input`,
      type: "text",
      role: "combobox",
      autoComplete: "off",
      "aria-autocomplete": "list" as const,
      "aria-expanded": showing,
      "aria-controls": listId,
      "aria-activedescendant":
        showing && highlighted !== undefined
          ? `${optionId}-${active}`
          : undefined,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? errorId : undefined,
      onFocus: () => setOpen(true),
      onKeyDown: (event: ReactKeyboardEvent) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (!options.length) return;
          event.preventDefault();
          setOpen(true);
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActive((index) =>
            index === -1 && step === -1
              ? options.length - 1
              : (index + step + options.length) % options.length,
          );
        } else if (
          event.key === "Enter" &&
          showing &&
          highlighted !== undefined
        ) {
          event.preventDefault();
          choose(highlighted);
        } else if (event.key === "Escape" && showing) {
          event.preventDefault();
          setOpen(false);
        }
      },
    },
    optionProps: (index: number) => ({
      id: `${optionId}-${index}`,
      role: "option",
      "aria-selected": index === active,
      onPointerMove: () => setActive(index),
      onPointerDown: (event: { preventDefault(): void }) =>
        event.preventDefault(),
      onClick: () => choose(options[index]!),
    }),
  };
}
