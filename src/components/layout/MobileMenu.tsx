"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface MenuItem {
  label: string;
  href: string;
  ariaLabel: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Dashboard",
    href: "/",
    ariaLabel: "Dashboard menu item",
  },
  {
    label: "Fleet",
    href: "/fleet",
    ariaLabel: "Fleet menu item",
  },
  {
    label: "Map",
    href: "/map",
    ariaLabel: "Map menu item",
  },
  {
    label: "Settings",
    href: "/settings",
    ariaLabel: "Settings menu item",
  },
  {
    label: "Documentation",
    href: "/docs",
    ariaLabel: "Documentation menu item",
  },
];

export interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * Mobile collapsible menu component
 * Features: Smooth slide animation, backdrop overlay, touch-optimized
 * 44px+ minimum tap targets for accessibility
 */
export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  className = "",
}) => {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Handle escape key to close menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      // Prevent body scroll when menu is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        backdropRef.current &&
        e.target === backdropRef.current &&
        isOpen
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        ref={backdropRef}
        className={`
          fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-out
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        aria-hidden={!isOpen}
      />

      {/* Menu panel */}
      <div
        ref={menuRef}
        className={`
          fixed left-0 top-0 h-screen w-64 bg-background shadow-xl z-40
          transform transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          ${className}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
        aria-hidden={!isOpen}
      >
        <div className="flex flex-col h-full">
          {/* Header with close button */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              onClick={onClose}
              className="
                p-2 rounded-lg hover:bg-muted transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                min-h-12 min-w-12
              "
              aria-label="Close mobile menu"
            >
              <span className="text-xl" aria-hidden="true">
                ✕
              </span>
            </button>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-2" role="list">
              {MENU_ITEMS.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`
                        block px-4 py-3 rounded-lg transition-all duration-200
                        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
                        min-h-12 flex items-center
                        ${
                          isActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-foreground hover:bg-muted"
                        }
                      `}
                      aria-label={item.ariaLabel}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Footer info */}
          <div className="border-t border-border p-4 text-xs text-muted-foreground">
            <p>Utility Protocol v1.0</p>
          </div>
        </div>
      </div>
    </>
  );
};
