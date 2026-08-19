"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type AriaLivePoliteness = "polite" | "assertive" | "off";

interface AriaLiveRegionProps {
  children?: ReactNode;
  message?: string;
  politeness?: AriaLivePoliteness;
  role?: "status" | "alert" | "log";
  labelledBy?: string;
  className?: string;
}

export function AriaLiveRegion({
  children,
  message,
  politeness = "polite",
  role = "status",
  labelledBy,
  className,
}: AriaLiveRegionProps) {
  const [announcement, setAnnouncement] = useState("");
  const regionRef = useRef<HTMLDivElement>(null);
  const prevMessageRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (message !== undefined && message !== prevMessageRef.current) {
      setAnnouncement(message);
      prevMessageRef.current = message;
    }
  }, [message]);

  const announced = announcement || message || "";

  return (
    <div
      ref={regionRef}
      role={role}
      aria-live={politeness}
      aria-atomic="true"
      aria-label={labelledBy ? undefined : "Dynamic content updates"}
      aria-labelledby={labelledBy}
      className={`sr-only ${className ?? ""}`}
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: "0",
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: "0",
      }}
    >
      {announced}
      {children}
    </div>
  );
}

export function useAriaLiveAnnouncer() {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const politeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const assertiveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const announce = useCallback(
    (msg: string, priority: "polite" | "assertive" = "polite") => {
      const isAssertive = priority === "assertive";
      const timerRef = isAssertive ? assertiveTimerRef : politeTimerRef;
      const setMessage = isAssertive
        ? setAssertiveMessage
        : setPoliteMessage;

      clearTimeout(timerRef.current);
      setMessage(msg);
      timerRef.current = setTimeout(() => setMessage(""), 100);
    },
    []
  );

  const announceError = useCallback(
    (msg: string) => announce(`Error: ${msg}`, "assertive"),
    [announce]
  );

  const announceSuccess = useCallback(
    (msg: string) => announce(`Success: ${msg}`, "polite"),
    [announce]
  );

  useEffect(
    () => () => {
      clearTimeout(politeTimerRef.current);
      clearTimeout(assertiveTimerRef.current);
    },
    []
  );

  return {
    announce,
    announceError,
    announceSuccess,
    assertiveMessage,
    politeMessage,
    AriaLive: (
      <AriaLiveRegion
        message={politeMessage}
        politeness="polite"
        role="status"
      />
    ),
    AriaLiveAssertive: (
      <AriaLiveRegion
        message={assertiveMessage}
        politeness="assertive"
        role="alert"
      />
    ),
  };
}
