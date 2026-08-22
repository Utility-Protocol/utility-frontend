"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  ariaLabel: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: "📊",
    ariaLabel: "Dashboard navigation item",
  },
  {
    label: "Fleet",
    href: "/fleet",
    icon: "🚗",
    ariaLabel: "Fleet navigation item",
  },
  {
    label: "Map",
    href: "/map",
    icon: "🗺️",
    ariaLabel: "Map navigation item",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "⚙️",
    ariaLabel: "Settings navigation item",
  },
];

export interface MobileBottomNavProps {
  className?: string;
}

/**
 * Mobile bottom navigation component
 * Provides touch-optimized navigation for mobile devices (< 768px)
 * Features: 44px minimum tap targets, smooth animations
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  className = "",
}) => {
  const pathname = usePathname();

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/80 backdrop-blur-sm md:hidden ${className}`}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-full">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center
                w-12 h-12 rounded-lg
                transition-all duration-200 ease-out
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                ${
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }
              `}
              aria-label={item.ariaLabel}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="text-xl mb-1" aria-hidden="true">
                {item.icon}
              </span>
              <span className="text-xs font-medium truncate max-w-12">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
