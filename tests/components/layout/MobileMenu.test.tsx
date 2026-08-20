import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MobileMenu } from "@/components/layout/MobileMenu";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

describe("MobileMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render mobile menu when open", () => {
    const { container } = render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("should not be visible when closed", () => {
    const { container } = render(<MobileMenu isOpen={false} onClose={vi.fn()} />);
    const menu = container.querySelector("[role='dialog']");
    expect(menu).toHaveClass("-translate-x-full");
  });

  it("should be visible when open", () => {
    const { container } = render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    const menu = container.querySelector("[role='dialog']");
    expect(menu).toHaveClass("translate-x-0");
  });

  it("should render menu items", () => {
    render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/fleet/i)).toBeInTheDocument();
    expect(screen.getByText(/map/i)).toBeInTheDocument();
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });

  it("should have touch-optimized menu items", () => {
    const { container } = render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    const links = container.querySelectorAll("[role='dialog'] a");
    
    links.forEach((link) => {
      const classes = link.className;
      expect(classes).toContain("min-h-12");
      expect(classes).toContain("flex");
      expect(classes).toContain("items-center");
    });
  });

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<MobileMenu isOpen={true} onClose={onClose} />);
    
    const closeButton = screen.getByLabelText("Close mobile menu");
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalled();
  });

  it("should call onClose when a menu item is clicked", () => {
    const onClose = vi.fn();
    render(<MobileMenu isOpen={true} onClose={onClose} />);
    
    const dashboardLink = screen.getByText(/dashboard/i);
    fireEvent.click(dashboardLink);
    
    expect(onClose).toHaveBeenCalled();
  });

  it("should close menu on Escape key press", async () => {
    const onClose = vi.fn();
    render(<MobileMenu isOpen={true} onClose={onClose} />);
    
    fireEvent.keyDown(window, { key: "Escape" });
    
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("should render close button with proper aria-label", () => {
    render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    const closeButton = screen.getByLabelText("Close mobile menu");
    expect(closeButton).toBeInTheDocument();
  });

  it("should have proper ARIA attributes", () => {
    const { container } = render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    const dialog = container.querySelector("[role='dialog']");
    
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Mobile navigation menu");
  });

  it("should accept custom className", () => {
    const { container } = render(
      <MobileMenu isOpen={true} onClose={vi.fn()} className="custom-class" />
    );
    const menu = container.querySelector("[role='dialog']");
    expect(menu).toHaveClass("custom-class");
  });

  it("should have smooth transition animation", () => {
    const { container } = render(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    const menu = container.querySelector("[role='dialog']");
    expect(menu).toHaveClass("transition-transform");
    expect(menu).toHaveClass("duration-300");
  });

  it("should prevent body scroll when menu is open", () => {
    const { rerender } = render(<MobileMenu isOpen={false} onClose={vi.fn()} />);
    // Initial state - overflow should be empty or unset
    expect(document.body.style.overflow).not.toBe("hidden");
    
    rerender(<MobileMenu isOpen={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
  });
});
