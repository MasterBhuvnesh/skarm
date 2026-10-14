import { SignUp } from "@clerk/nextjs";

/**
 * Blend Clerk's card into the page so only the form floats on `bg-background`.
 *
 * The visible box edge comes from `cardBox` (the shadcn theme in
 * `components/providers.tsx` gives it `shadow-sm border`) with its fill from
 * `card`, so both are stripped. `footer`/`footerAction` lose their band fill
 * and top border too. Inputs, buttons, and OAuth keep their own fills.
 * `!important` wins over the shadcn theme + Clerk's runtime-injected rules.
 *
 * `unsafe_disableDevelopmentModeWarnings` is Clerk's official switch for the
 * orange "Development mode" text + striped band. It MUST sit under `options`:
 * the runtime only reads `appearance.options` (top-level is ignored even
 * though the types accept it). It leaves the "Secured by Clerk" branding untouched (plan-gated, must not be CSS-hidden on free).
 * No-op in production, where the warning is gone anyway.
 */
const blendedAppearance = {
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
  elements: {
    cardBox: {
      background: "transparent !important",
      boxShadow: "none !important",
      border: "none !important",
    },
    card: {
      background: "transparent !important",
      boxShadow: "none !important",
      border: "none !important",
    },
    footer: {
      background: "transparent !important",
      borderTop: "none !important",
    },
    footerAction: {
      background: "transparent !important",
      borderTop: "none !important",
    },
  },
} as const;

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <SignUp appearance={blendedAppearance} />
    </main>
  );
}
