"use client";

import { useCallback, useEffect, useRef } from "react";

export type KeyAction =
  | { type: "arrowUp" }
  | { type: "arrowDown" }
  | { type: "arrowLeft" }
  | { type: "arrowRight" }
  | { type: "enter" }
  | { type: "space" }
  | { type: "escape" }
  | { type: "home" }
  | { type: "end" }
  | { type: "tab"; shiftKey: boolean }
  | { type: "character"; key: string };

export interface KeyboardNavigationOptions {
  onAction: (action: KeyAction) => void;
  enabled?: boolean;
  preventDefault?: boolean;
}

const KEY_MAP: Record<string, (e: KeyboardEvent) => KeyAction | null> = {
  ArrowUp: () => ({ type: "arrowUp" }),
  ArrowDown: () => ({ type: "arrowDown" }),
  ArrowLeft: () => ({ type: "arrowLeft" }),
  ArrowRight: () => ({ type: "arrowRight" }),
  Enter: () => ({ type: "enter" }),
  " ": () => ({ type: "space" }),
  Escape: () => ({ type: "escape" }),
  Home: () => ({ type: "home" }),
  End: () => ({ type: "end" }),
  Tab: (e) => ({ type: "tab", shiftKey: e.shiftKey }),
};

export function useKeyboardNavigation(
  options: KeyboardNavigationOptions
) {
  const { onAction, enabled = true, preventDefault: shouldPreventDefault = true } = options;
  const handlerRef = useRef(onAction);
  handlerRef.current = onAction;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      const mapper = KEY_MAP[e.key];
      if (!mapper) {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (shouldPreventDefault) e.preventDefault();
          handlerRef.current({ type: "character", key: e.key });
        }
        return;
      }
      const action = mapper(e);
      if (action) {
        if (shouldPreventDefault) e.preventDefault();
        handlerRef.current(action);
      }
    },
    [enabled, shouldPreventDefault]
  );

  useEffect(() => {
    if (!enabled) return;
    const element = typeof window !== "undefined" ? window : null;
    if (!element) return;
    element.addEventListener("keydown", handleKeyDown);
    return () => element.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}

export interface RovingTabIndexOptions {
  items: Array<{ id: string; disabled?: boolean }>;
  currentIndex: number;
  onChange: (index: number) => void;
  orientation?: "horizontal" | "vertical";
  loop?: boolean;
}

export function useRovingTabIndex(options: RovingTabIndexOptions) {
  const { items, currentIndex, onChange, orientation = "vertical", loop = true } = options;

  const moveIndex = useCallback(
    (direction: number) => {
      const enabled = items.filter((item) => !item.disabled);
      if (enabled.length === 0) return;
      const currentEnabled = enabled.findIndex(
        (item) => item.id === items[currentIndex]?.id
      );
      let next = currentEnabled + direction;
      if (loop) {
        next = ((next % enabled.length) + enabled.length) % enabled.length;
      } else {
        next = Math.max(0, Math.min(next, enabled.length - 1));
      }
      const target = items.findIndex((item) => item.id === enabled[next]?.id);
      if (target !== -1 && target !== currentIndex) {
        onChange(target);
      }
    },
    [items, currentIndex, onChange, loop]
  );

  useKeyboardNavigation({
    onAction: (action) => {
      switch (action.type) {
        case "arrowDown":
        case "arrowRight":
          if (orientation === "vertical" && action.type === "arrowRight") return;
          if (orientation === "horizontal" && action.type === "arrowDown") return;
          moveIndex(1);
          break;
        case "arrowUp":
        case "arrowLeft":
          if (orientation === "vertical" && action.type === "arrowLeft") return;
          if (orientation === "horizontal" && action.type === "arrowUp") return;
          moveIndex(-1);
          break;
        case "home":
          onChange(0);
          break;
        case "end":
          onChange(items.length - 1);
          break;
      }
    },
    enabled: items.length > 0,
  });

  return {
    getTabIndex: (index: number) => (index === currentIndex ? 0 : -1),
    getRole: () => (orientation === "horizontal" ? "toolbar" : "listbox"),
  };
}
