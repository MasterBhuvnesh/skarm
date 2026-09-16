---
name: scrollbars
description: 'How scrollbars are styled and used in this repo. Use when adding a scrollable region (board, chat, sidebar, dropdown, table), when a scrollbar looks wrong or too thick, when you need to hide a scrollbar, or when touching app/globals.css scrollbar rules or components/ui/scroll-area.tsx.'
---

# Scrollbars

This repo has **two scrollbar systems**. Pick the right one:

| Situation | Use |
|---|---|
| Page-level / native scrollers (`overflow-auto` on a div) | Global webkit rules in `app/globals.css` |
| Overlay UI inside a constrained container (command palette, popovers, dialogs) | Radix `<ScrollArea>` from `components/ui/scroll-area.tsx` |

## 1. Native scrollers — global CSS

Defined once in `app/globals.css` (~line 135). Do not duplicate these rules in components.

```css
/* Thin scrollbars for native scrollers (board, AI chat, etc.).
   webkit-only so the arrow buttons can be removed (scrollbar-width: thin would
   make Chromium ignore these rules). height handles horizontal scrollers. */
::-webkit-scrollbar {
  width: 4px;
  height: 4px; /* horizontal scrollers */
}

::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--foreground) 10%, transparent);
  border-radius: 10px;
}

::-webkit-scrollbar-track {
  background: var(--background);
}

::-webkit-scrollbar-button {
  display: none;
}
```

Key facts about this approach:

- **WebKit-only on purpose.** Setting `scrollbar-width: thin` makes Chromium use its native thin scrollbar and *ignore* the `::-webkit-*` rules, so the arrow buttons would come back. Accepting Firefox's default scrollbar is the tradeoff.
- **Theme-aware via `color-mix`.** The thumb is `--foreground` at 10% opacity over transparent, so it works in both light and dark themes without extra selectors.
- `height: 4px` styles **horizontal** scrollbars (the board columns); `width` styles vertical ones.

### Hiding a scrollbar entirely

Use Tailwind's `no-scrollbar` utility (already used by the command palette in `components/ui/command.tsx`):

```tsx
<div className="no-scrollbar overflow-y-auto max-h-72">…</div>
```

Only hide scrollbars when scrolling is still discoverable (wheel/touch works); never for primary content regions.

## 2. Radix ScrollArea component

For overlay surfaces where a native scrollbar would break layout or look heavy, wrap content in `<ScrollArea>` from `components/ui/scroll-area.tsx`:

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";

<ScrollArea className="h-72 rounded-md border">
  <div className="p-4">…content taller than h-72…</div>
</ScrollArea>
```

Notes:

- `ScrollArea` needs an explicit height (`h-72`, `max-h-[…]`, or flex sizing) — it does not infer one.
- The thumb is styled with `bg-foreground/10` inside the component; adjust there, not per-usage.
- Pass `orientation="horizontal"` to `<ScrollBar>` if you need a horizontal-only scroller (the default renders a vertical bar).
- Prefer this for command palettes, select/dropdown lists, and dialogs. Prefer native + global CSS for main page regions (board, chat panes) so scrolling stays native (better perf, keyboard/trackpad behavior).

## Checklist when adding a scrollable region

1. Is it a main content region? → plain `overflow-auto`; global CSS handles styling.
2. Is it an overlay/constrained panel? → `<ScrollArea>`.
3. Should the bar be invisible? → add `no-scrollbar`.
4. Never write new `::-webkit-scrollbar` rules in a component file.
