# Mobile Navigation Implementation Guide

## Overview

This document describes the mobile navigation system implemented for the Utility Protocol dashboard. The implementation provides an intuitive navigation experience optimized for mobile devices with swipe gestures, bottom navigation, and a collapsible menu.

## Features

### 1. Responsive Navigation Breakpoints
- **Desktop (≥769px)**: Traditional horizontal navigation with full feature visibility
- **Mobile (<768px)**: Bottom navigation bar with collapsible menu
- **Landscape Mobile (max-height: 500px)**: Compact layout with reduced padding

### 2. Bottom Navigation Bar
- Always visible at the bottom of mobile screens
- 4 quick-access navigation items (Dashboard, Fleet, Map, Settings)
- Touch-optimized tap targets (48px × 48px minimum)
- Active state indication with color and background
- Smooth transitions and animations

### 3. Swipe Gesture Detection
- **Right swipe**: Opens mobile menu
- **Left swipe**: Closes mobile menu
- **Configurable threshold**: Default 50px (customizable)
- Prevents false positives on diagonal swipes
- Touch event handling optimized for performance

### 4. Collapsible Mobile Menu
- Slides in from the left with smooth animation
- Backdrop overlay for dismissal
- Close button and Escape key support
- Click-outside-to-close functionality
- Prevents body scroll when open
- Touch-optimized menu items (48px+ tap targets)

### 5. Accessibility Features
- ARIA labels and roles for all interactive elements
- Semantic HTML structure (nav, dialog, buttons)
- 44px minimum tap targets (WCAG 2.1 Level AAA)
- Focus management and keyboard navigation
- High contrast mode support
- Reduced motion preference support

## Component Structure

```
src/
├── components/
│   └── layout/
│       ├── MobileBottomNav.tsx      # Bottom navigation component
│       ├── MobileMenu.tsx            # Collapsible mobile menu
│       └── ResponsiveLayout.tsx      # Main responsive layout wrapper
├── hooks/
│   └── useSwipeGesture.ts            # Swipe gesture detection hook
├── styles/
│   └── mobile-navigation.css         # Mobile-specific styles
└── tests/
    └── components/
        └── layout/
            ├── MobileBottomNav.test.tsx
            ├── MobileMenu.test.tsx
            └── ResponsiveLayout.test.tsx
```

## Component Details

### MobileBottomNav.tsx

Bottom navigation component with touch-optimized controls.

**Props:**
- `className?: string` - Additional CSS classes

**Features:**
- 4 navigation items with icons and labels
- Active state indication
- Hidden on desktop (md:hidden)
- Smooth hover and focus transitions

**Usage:**
```tsx
<MobileBottomNav />
```

### MobileMenu.tsx

Collapsible menu component with gesture and keyboard support.

**Props:**
- `isOpen: boolean` - Menu visibility state
- `onClose: () => void` - Callback to close menu
- `className?: string` - Additional CSS classes

**Features:**
- Slide animation from left
- Backdrop overlay
- Escape key and click-outside support
- Body scroll prevention
- Menu items with active state

**Usage:**
```tsx
<MobileMenu isOpen={isOpen} onClose={() => setIsOpen(false)} />
```

### ResponsiveLayout.tsx

Main layout component coordinating mobile navigation.

**Props:**
- `children: ReactNode` - Main page content
- `header?: ReactNode` - Header content
- `footer?: ReactNode` - Footer content
- `className?: string` - Additional CSS classes

**Features:**
- Swipe gesture support
- Mobile menu toggle button
- Bottom navigation integration
- Responsive spacing and padding

**Usage:**
```tsx
<ResponsiveLayout 
  header={<Header />} 
  footer={<Footer />}
>
  <MainContent />
</ResponsiveLayout>
```

### useSwipeGesture Hook

Custom hook for detecting swipe gestures on touch devices.

**Options:**
- `threshold?: number` - Minimum swipe distance (default: 50px)
- `onSwipeLeft?: () => void` - Left swipe callback
- `onSwipeRight?: () => void` - Right swipe callback
- `onSwipeUp?: () => void` - Up swipe callback
- `onSwipeDown?: () => void` - Down swipe callback

**Returns:**
- `RefObject<HTMLDivElement>` - Ref to attach to element

**Usage:**
```tsx
const swipeRef = useSwipeGesture({
  threshold: 50,
  onSwipeRight: () => console.log('Right swipe'),
  onSwipeLeft: () => console.log('Left swipe'),
});

return <div ref={swipeRef}>Swipe me!</div>;
```

## Responsive Breakpoints

The implementation uses Tailwind CSS breakpoints:

- **md**: 768px (tablet and above)
- **lg**: 1024px (desktop)
- **xl**: 1280px (large desktop)

Mobile-specific styles are applied below 768px.

## Touch Target Sizes

All interactive elements follow WCAG 2.1 Level AAA guidelines:

- **Minimum tap target**: 44px × 44px
- **Recommended tap target**: 48px × 48px (implemented)
- **Touch spacing**: 8px minimum between targets

## Keyboard Navigation

- **Tab**: Navigate between interactive elements
- **Enter/Space**: Activate buttons and links
- **Escape**: Close mobile menu
- **Arrow Keys**: Navigate menu items (when menu is focused)

## Animation Transitions

All animations use smooth easing functions:

- **Duration**: 200-300ms
- **Timing**: ease-out
- **Properties**: transform, opacity, background-color

Animations respect `prefers-reduced-motion` for accessibility.

## Performance Considerations

1. **Touch Event Optimization**
   - Event delegation on container element
   - Passive event listeners where applicable
   - Minimal DOM manipulation

2. **CSS Performance**
   - Hardware-accelerated transforms (translate)
   - CSS transitions instead of JavaScript animations
   - Backdrop blur optimized with CSS filters

3. **Memory Management**
   - Proper cleanup of event listeners
   - Component unmounting handled correctly
   - No memory leaks from refs

## Browser Support

- **iOS Safari**: 12+
- **Chrome Android**: 60+
- **Firefox Mobile**: 68+
- **Samsung Internet**: 8+

Graceful degradation for older devices with JS fallbacks.

## Testing

Run tests with:

```bash
npm test
```

Test suites include:

- **useSwipeGesture.test.ts**: Gesture detection logic
- **MobileBottomNav.test.tsx**: Bottom navigation rendering and interaction
- **MobileMenu.test.tsx**: Menu animation, keyboard, and click handling
- **ResponsiveLayout.test.tsx**: Layout integration and responsive behavior

### Key Test Coverage

- ✓ Swipe gesture detection (all directions)
- ✓ Threshold validation
- ✓ Touch target size compliance
- ✓ ARIA attributes and labels
- ✓ Animation transitions
- ✓ Keyboard navigation (Escape, Tab)
- ✓ Click-outside dismissal
- ✓ Body scroll prevention
- ✓ Active state indication
- ✓ Mobile/desktop responsiveness

## Styling

Mobile navigation styles are in `src/styles/mobile-navigation.css`:

```css
/* Touch target sizing */
@media (max-width: 768px) {
  button, a { min-height: 2.75rem; }
}

/* Safe area insets (notched devices) */
body { padding: env(safe-area-inset-*); }

/* Landscape adjustments */
@media (max-height: 500px) { /* compact layout */ }

/* Accessibility preferences */
@media (prefers-reduced-motion: reduce) { /* no animations */ }
@media (prefers-contrast: more) { /* increased borders */ }
```

## Integration Example

```tsx
// src/app/page.tsx
"use client";

import { ResponsiveLayout } from "@/components/layout/ResponsiveLayout";

export default function Home() {
  const headerContent = (
    <div className="flex items-center justify-between">
      <h1>Utility Protocol</h1>
      <nav>{/* desktop nav */}</nav>
    </div>
  );

  return (
    <ResponsiveLayout 
      header={headerContent}
      footer="© 2024 Utility Protocol"
    >
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Page content */}
      </main>
    </ResponsiveLayout>
  );
}
```

## Mobile-First Development Guide

When developing new features:

1. **Start with mobile layout** (< 768px)
2. **Test on real devices** or emulators
3. **Validate touch targets** are ≥44px
4. **Test gestures** on actual touch devices
5. **Check accessibility** with screen readers
6. **Verify animations** respect prefers-reduced-motion

## Customization

### Change Navigation Items

Edit `src/components/layout/MobileBottomNav.tsx`:

```tsx
const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: "🏠", ariaLabel: "Home" },
  // Add more items
];
```

### Adjust Swipe Threshold

```tsx
<ResponsiveLayout swipeThreshold={75}>
  {/* content */}
</ResponsiveLayout>
```

### Customize Colors and Styles

Modify Tailwind classes in component files or override in `mobile-navigation.css`.

## Troubleshooting

### Menu doesn't open on swipe
- Verify `useSwipeGesture` ref is attached to container
- Check swipe distance exceeds threshold (50px default)
- Ensure touch events are enabled

### Tap targets too small
- Check min-height and min-width classes
- Verify CSS is loaded: `import "../styles/mobile-navigation.css"`
- Test on actual device, not just browser emulation

### Animations stutter
- Check for heavy content inside menu
- Verify CSS transforms are used (translate, not left)
- Profile with DevTools Performance tab

### Accessibility issues
- Use screen reader to verify labels
- Test keyboard navigation (Tab, Escape)
- Validate with axe-core or similar tools

## Future Enhancements

- [ ] Gesture velocity tracking for momentum scroll
- [ ] Menu item badges for notifications
- [ ] Swipe-to-dismiss for bottom sheet patterns
- [ ] Custom animation easing curves
- [ ] Voice control integration for accessibility

## References

- [WCAG 2.1 Touch Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Touch Events API](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Next.js App Router](https://nextjs.org/docs/app)

## Support

For issues or questions:
1. Check existing tests for usage examples
2. Review component inline documentation
3. Inspect element with DevTools
4. Test on target devices
