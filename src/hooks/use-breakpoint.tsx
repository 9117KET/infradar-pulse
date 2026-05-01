import * as React from "react";

// Tailwind default breakpoints
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/**
 * Returns the current breakpoint key plus convenience booleans.
 * SSR-safe: returns sensible defaults until mount.
 */
export function useBreakpoint() {
  const [width, setWidth] = React.useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const current: BreakpointKey | "xs" =
    width >= BREAKPOINTS["2xl"]
      ? "2xl"
      : width >= BREAKPOINTS.xl
        ? "xl"
        : width >= BREAKPOINTS.lg
          ? "lg"
          : width >= BREAKPOINTS.md
            ? "md"
            : width >= BREAKPOINTS.sm
              ? "sm"
              : "xs";

  return {
    width,
    current,
    isXs: width < BREAKPOINTS.sm,
    isSm: width >= BREAKPOINTS.sm && width < BREAKPOINTS.md,
    isMd: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isLg: width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl,
    isXl: width >= BREAKPOINTS.xl && width < BREAKPOINTS["2xl"],
    is2xl: width >= BREAKPOINTS["2xl"],
    /** True for any phone-sized viewport (< md) */
    isMobile: width < BREAKPOINTS.md,
    /** True for tablets (md..lg) */
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    /** True for laptops & up */
    isDesktop: width >= BREAKPOINTS.lg,
    /** Compare against a specific minimum: useBreakpoint().min('lg') */
    min(key: BreakpointKey) {
      return width >= BREAKPOINTS[key];
    },
  };
}
