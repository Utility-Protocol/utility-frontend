"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "high-contrast";

const STORAGE_KEY = "utility-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  setMode: () => {},
  toggle: () => {},
});

function getBrowserMode(): ThemeMode {
  const root = document.documentElement;

  const rootMode = Array.from(root.classList).find(
    (value): value is ThemeMode =>
      value === "light" ||
      value === "dark" ||
      value === "high-contrast"
  );

  if (rootMode) {
    return rootMode;
  }

  const stored = localStorage.getItem(STORAGE_KEY);

  if (
    stored === "light" ||
    stored === "dark" ||
    stored === "high-contrast"
  ) {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Keep the server and first client render identical.
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    const initialMode = getBrowserMode();
    setModeState(initialMode);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) {
        return;
      }

      setModeState(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.add("theme-transition");
    root.classList.remove("light", "dark", "high-contrast");
    root.classList.add(mode);

    localStorage.setItem(STORAGE_KEY, mode);

    const timeout = window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((previous) => {
      if (previous === "light") return "dark";
      if (previous === "dark") return "high-contrast";
      return "light";
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
