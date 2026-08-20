"use client";

import { useState, ReactNode } from "react";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileMenu } from "./MobileMenu";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";

interface ResponsiveLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Responsive layout component that handles mobile navigation
 * Features:
 * - Bottom navigation for mobile (<768px)
 * - Swipe gesture support (right swipe opens menu, left swipe closes)
 * - Collapsible mobile menu
 * - Smooth animations and transitions
 */
export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  header,
  footer,
  className = "",
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const swipeRef = useSwipeGesture({
    threshold: 50,
    onSwipeRight: () => {
      setIsMobileMenuOpen(true);
    },
    onSwipeLeft: () => {
      setIsMobileMenuOpen(false);
    },
  });

  const handleMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div
      ref={swipeRef}
      className={`flex flex-col min-h-screen ${className}`}
      role="main"
    >
      {/* Header with mobile menu toggle */}
      {header && (
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 md:px-6 py-3">
            <div className="flex-1">{header}</div>
            {/* Mobile menu toggle button - hidden on desktop */}
            <button
              onClick={handleMenuToggle}
              className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary min-h-12 min-w-12"
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
            >
              <span
                className={`
                  inline-block transition-transform duration-300
                  ${isMobileMenuOpen ? "rotate-90" : ""}
                `}
                aria-hidden="true"
              >
                ☰
              </span>
            </button>
          </div>
        </header>
      )}

      {/* Main content with bottom padding for mobile nav */}
      <main className="flex-1 pb-20 md:pb-0">
        {children}
      </main>

      {/* Footer */}
      {footer && (
        <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
          {footer}
        </footer>
      )}

      {/* Mobile bottom navigation */}
      <MobileBottomNav />

      {/* Mobile menu with swipe gesture support */}
      <MobileMenu isOpen={isMobileMenuOpen} onClose={handleMenuClose} />
    </div>
  );
};
