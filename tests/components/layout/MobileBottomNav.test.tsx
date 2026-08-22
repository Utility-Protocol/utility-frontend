import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

describe("MobileBottomNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render bottom navigation", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: /mobile navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it("should render all navigation items", () => {
    render(<MobileBottomNav />);
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/fleet/i)).toBeInTheDocument();
    expect(screen.getByText(/map/i)).toBeInTheDocument();
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });

  it("should have touch-optimized tap targets", () => {
    const { container } = render(<MobileBottomNav />);
    const links = container.querySelectorAll("a");
    
    links.forEach((link) => {
      const classes = link.className;
      expect(classes).toContain("h-12");
      expect(classes).toContain("w-12");
    });
  });

  it("should have smooth transition classes", () => {
    const { container } = render(<MobileBottomNav />);
    const links = container.querySelectorAll("a");
    
    links.forEach((link) => {
      const classes = link.className;
      expect(classes).toContain("transition-all");
      expect(classes).toContain("duration-200");
    });
  });

  it("should accept custom className", () => {
    const { container } = render(<MobileBottomNav className="custom-class" />);
    const nav = container.querySelector("nav");
    expect(nav).toHaveClass("custom-class");
  });

  it("should be hidden on desktop (md:hidden)", () => {
    const { container } = render(<MobileBottomNav />);
    const nav = container.querySelector("nav");
    expect(nav).toHaveClass("md:hidden");
  });

  it("should have proper ARIA attributes", () => {
    const { container } = render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation");
    
    expect(nav).toHaveAttribute("aria-label", "Mobile navigation");
    
    const items = container.querySelectorAll("a");
    expect(items.length).toBeGreaterThan(0);
  });
});
