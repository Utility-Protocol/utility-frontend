"use client";

import { useNotifications, notificationStore } from "@/store/slices/notificationSlice";
import {
  MAX_NOTIFICATION_ACTIONS,
  type AppNotification,
  type NotificationAction,
} from "@/types/notification";

/**
 * In-app toast renderer. Reads the coalesced notification queue and shows one
 * toast per coalescence key, suffixing "(N more)" when a key has coalesced more
 * than once. Action buttons map to a URL or internal route (max 2).
 */

export interface ToastContainerProps {
  /** Navigate to an internal app route (e.g. router.push). */
  onNavigate?: (route: string) => void;
  /** Called when an action button is pressed, before navigation. */
  onAction?: (notification: AppNotification, action: NotificationAction) => void;
  className?: string;
}

function topicAccent(topic: string): string {
  const domain = topic.split(".")[0];
  switch (domain) {
    case "meter":
      return "border-l-blue-500";
    case "contract":
      return "border-l-amber-500";
    case "system":
      return "border-l-red-500";
    default:
      return "border-l-border";
  }
}

export function ToastContainer({
  onNavigate,
  onAction,
  className,
}: ToastContainerProps) {
  const notifications = useNotifications();

  if (notifications.length === 0) return null;

  const handleAction = (
    notification: AppNotification,
    action: NotificationAction
  ) => {
    onAction?.(notification, action);
    if (action.route) {
      onNavigate?.(action.route);
    } else if (action.url && typeof window !== "undefined") {
      window.open(action.url, "_blank", "noopener,noreferrer");
    }
    notificationStore.dismiss(notification.id);
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 ${
        className ?? ""
      }`}
      role="region"
      aria-label="Notifications"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          role="alert"
          className={`rounded-lg border border-l-4 ${topicAccent(
            n.topic
          )} border-border bg-background p-3 shadow-lg`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {n.title}
                {n.count > 1 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({n.count - 1} more)
                  </span>
                )}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {n.body}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {n.topic}
              </p>
            </div>
            <button
              onClick={() => notificationStore.dismiss(n.id)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>

          {n.actions && n.actions.length > 0 && (
            <div className="mt-2 flex gap-2">
              {n.actions.slice(0, MAX_NOTIFICATION_ACTIONS).map((action) => (
                <button
                  key={action.action}
                  onClick={() => handleAction(n, action)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                >
                  {action.title}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
