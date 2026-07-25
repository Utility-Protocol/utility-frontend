"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const [message, setMessage] = useState("");

  function announce(msg: string, priority: "polite" | "assertive" = "polite") {
    setMessage(msg);
    setTimeout(() => setMessage(""), 100);
    return { politeness: priority };
  }

  function announceError(msg: string) {
    return announce(`Error: ${msg}`, "assertive");
  }

  function announceSuccess(msg: string) {
    return announce(`Success: ${msg}`, "polite");
  }

  return {
    message,
    announce,
    announceError,
    announceSuccess,
    AriaLive: (
      <AriaLiveRegion
        message={message}
        politeness="polite"
        role="status"
      />
    ),
    AriaLiveAssertive: (
      <AriaLiveRegion
        message={message}
        politeness="assertive"
        role="alert"
      />
    ),
  };
}
