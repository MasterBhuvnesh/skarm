import { Kbd } from "@/components/marketing/kbd";
import { MockCommandPalette } from "@/components/marketing/mock-command-palette";
import { Section, SectionHeading } from "@/components/marketing/section";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["C"], label: "Create issue" },
  { keys: ["A"], label: "Assign" },
  { keys: ["L"], label: "Add label" },
  { keys: ["B"], label: "Open board" },
  { keys: ["⌘", "J"], label: "Ask the agent" },
];

export function FeaturesKeyboard() {
  return (
    <Section id="keyboard">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            eyebrow="04 · Keyboard-first"
            title="Your hands never leave the keyboard"
            lede="Everything in Skarm is a command. One palette, single-key shortcuts, and zero context switches between thinking and doing."
          />
          <div className="mt-10 space-y-2.5">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.label}
                className="flex h-9 items-center justify-between rounded-lg border bg-card/50 px-3 text-sm"
              >
                <span className="text-foreground/90">{shortcut.label}</span>
                <span className="flex items-center gap-1">
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 scale-110 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,color-mix(in_oklch,var(--foreground),transparent_94%),transparent)]"
          />
          <MockCommandPalette className="mx-auto max-w-md" />
        </div>
      </div>
    </Section>
  );
}
