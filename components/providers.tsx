"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { shadcn } from "@clerk/ui/themes";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {/* ui={ui} pins Clerk components to the installed @clerk/ui version so
          the structural CSS overrides in globals.css can't break on a hosted
          component update. */}
      <ClerkProvider ui={ui} appearance={{ theme: shadcn }}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {/* Radix tooltips require a root provider; the ui/tooltip primitive
              does not self-wrap, so every bare <Tooltip> depends on this. */}
          <TooltipProvider>{children}</TooltipProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </ThemeProvider>
  );
}
