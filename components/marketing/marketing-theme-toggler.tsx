"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

export function MarketingThemeToggler() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Avoid hydration mismatch; render placeholder until mounted but keep layout stable
  if (!mounted) {
    return (
      <span
        aria-hidden
        className="inline-flex size-8 items-center justify-center rounded-lg border border-transparent"
      />
    )
  }

  const current = resolvedTheme === "dark" ? "dark" : "light"

  return (
    <AnimatedThemeToggler
      theme={current}
      onThemeChange={setTheme}
      variant="circle"
      duration={400}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Toggle theme"
    />
  )
}
