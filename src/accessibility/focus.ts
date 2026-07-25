import { FOCUS_STYLE, FOCUS_OFFSET } from "./theme";

export const GLOBAL_FOCUS_STYLES = `
  :focus-visible {
    outline: ${FOCUS_STYLE};
    outline-offset: ${FOCUS_OFFSET};
  }

  :focus:not(:focus-visible) {
    outline: none;
  }

  [data-focus-trap] {
    outline: none;
  }

  [data-focus-trap]:focus-visible {
    outline: ${FOCUS_STYLE};
    outline-offset: ${FOCUS_OFFSET};
  }
`;

export function injectGlobalFocusStyles(): () => void {
  const styleId = "verinode-focus-styles";
  if (document.getElementById(styleId)) {
    const existing = document.getElementById(styleId);
    if (existing) {
      return () => existing.remove();
    }
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = GLOBAL_FOCUS_STYLES;
  document.head.appendChild(style);
  return () => style.remove();
}

export function createFocusTrap(container: HTMLElement): {
  activate: () => void;
  deactivate: () => void;
} {
  const focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return {
    activate() {
      container.addEventListener("keydown", handleKeyDown);
      const first = getFocusableElements()[0];
      if (first) first.focus();
      container.setAttribute("data-focus-trap", "");
    },
    deactivate() {
      container.removeEventListener("keydown", handleKeyDown);
      container.removeAttribute("data-focus-trap");
    },
  };
}

export function getNextFocusable(
  current: HTMLElement,
  direction: "forward" | "backward" = "forward"
): HTMLElement | null {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const idx = all.indexOf(current);
  if (idx === -1) return null;
  const next = direction === "forward" ? idx + 1 : idx - 1;
  return all[next] ?? null;
}
