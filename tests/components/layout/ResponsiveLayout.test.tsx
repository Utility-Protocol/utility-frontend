import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResponsiveLayout } from "@/components/layout/ResponsiveLayout";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

// Mock swipe gesture hook
vi.mock("@/hooks/useSwipeGesture", () => ({
  useSwipeGesture: vi.fn(() => ({
    current: document.createElement("div"),
  })),
}));

describe("ResponsiveLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render responsive layout", () => {
    const { container } = render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const main = container.querySelector("[role='main']");
    expect(main).toBeInTheDocument();
  });

  it("should render header when provided", () => {
    render(
      <ResponsiveLayout header={<div>Header Content</div>}>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    expect(screen.getByText("Header Content")).toBeInTheDocument();
  });

  it("should render footer when provided", () => {
    render(
      <ResponsiveLayout footer={<div>Footer Content</div>}>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    expect(screen.getByText("Footer Content")).toBeInTheDocument();
  });

  it("should render children content", () => {
    render(
      <ResponsiveLayout>
        <div>Main Content</div>
      </ResponsiveLayout>
    );
    
    expect(screen.getByText("Main Content")).toBeInTheDocument();
  });

  it("should render mobile bottom navigation", () => {
    render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const nav = screen.getByRole("navigation", { name: /mobile navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it("should have menu toggle button on mobile", () => {
    render(
      <ResponsiveLayout header={<div>Header</div>}>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const toggleButton = screen.getByLabelText("Toggle mobile menu");
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveClass("md:hidden");
  });

  it("should open menu when toggle button is clicked", async () => {
    render(
      <ResponsiveLayout header={<div>Header</div>}>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const toggleButton = screen.getByLabelText("Toggle mobile menu");
    fireEvent.click(toggleButton);
    
    await waitFor(() => {
      expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("should close menu when toggle button is clicked again", async () => {
    render(
      <ResponsiveLayout header={<div>Header</div>}>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const toggleButton = screen.getByLabelText("Toggle mobile menu");
    
    // Open menu
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    
    // Close menu
    fireEvent.click(toggleButton);
    await waitFor(() => {
      expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("should have main content with proper padding for mobile", () => {
    const { container } = render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const main = container.querySelector("main");
    expect(main).toHaveClass("pb-20");
    expect(main).toHaveClass("md:pb-0");
  });

  it("should accept custom className", () => {
    const { container } = render(
      <ResponsiveLayout className="custom-class">
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const main = container.querySelector("[role='main']");
    expect(main).toHaveClass("custom-class");
  });

  it("should render menu dialog", () => {
    const { container } = render(
      <ResponsiveLayout header={<div>Header</div>}>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Mobile navigation menu");
  });

  it("should have flex layout structure", () => {
    const { container } = render(
      <ResponsiveLayout>
        <div>Content</div>
      </ResponsiveLayout>
    );
    
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("flex-col");
  });
});
