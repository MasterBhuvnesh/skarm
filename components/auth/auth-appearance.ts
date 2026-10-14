/**
 * Clerk appearance overrides for /sign-in and /sign-up.
 *
 * We keep Clerk's prebuilt components (issue #33, option 1) and restyle them
 * here rather than rebuilding the flows, so OAuth, email verification, MFA,
 * error states, and invitation acceptance stay Clerk's responsibility.
 *
 * Why the values are CSS objects with `!important` rather than Tailwind class
 * strings: `app/globals.css` imports `@clerk/ui/themes/shadcn.css` *after*
 * `tailwindcss`, so the shadcn Clerk theme's rules win ties against plain
 * utility classes on the same element. Clerk also injects its generated
 * appearance rules at runtime, after our stylesheet. `!important` is the only
 * deterministic way to win, and matches the existing precedent in
 * globals.css where the OrganizationSwitcher overrides do the same thing.
 *
 * Colors and dark mode are deliberately NOT overridden. The shadcn theme
 * already maps Clerk's `--clerk-*` variables onto Skarm's oklch tokens, so
 * touching them here would fight the theme instead of matching it.
 */

/** Shared box metrics so inputs, buttons, and social buttons line up. */
const CONTROL = {
  height: "2.75rem !important", // h-11, matches the marketing hero CTAs
  borderRadius: "0.5rem !important", // rounded-lg
  fontSize: "0.875rem !important", // text-sm
} as const;

export const authAppearance = {
  layout: {
    // The page header renders the Skarm mark, so drop Clerk's own logo rather
    // than showing the same brand twice.
    logoPlacement: "none",
    // Full-width social buttons read as first-party UI instead of Clerk's
    // default icon buttons.
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
  },
  variables: {
    // `html` is `font-sans` (Geist); pin Clerk to the same stack so the form
    // matches the marketing pages instead of falling back to a system font.
    fontFamily: "var(--font-geist-sans)",
  },
  elements: {
    rootBox: {
      width: "100% !important",
      maxWidth: "100% !important",
    },
    cardBox: {
      width: "100% !important",
      maxWidth: "26rem !important",
    },
    headerTitle: {
      fontSize: "1.25rem !important",
      fontWeight: "600 !important",
      letterSpacing: "-0.02em !important",
    },
    headerSubtitle: {
      fontSize: "0.875rem !important",
    },
    formFieldLabel: {
      fontSize: "0.8125rem !important",
      fontWeight: "500 !important",
    },
    formFieldInput: CONTROL,
    formButtonPrimary: {
      ...CONTROL,
      fontWeight: "500 !important",
    },
    socialButtonsBlockButton: {
      ...CONTROL,
      fontWeight: "500 !important",
    },
    formFieldErrorText: {
      fontSize: "0.75rem !important",
    },
    footerActionLink: {
      fontSize: "0.875rem !important",
      fontWeight: "500 !important",
    },
  },
} as const;
