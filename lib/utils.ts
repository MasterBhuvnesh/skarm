import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Best-effort "why did this search hit match" snippet: when a result isn't
 * explained by its title, return the description text around the first query
 * word. Returns null when the title already contains a query word or no query
 * word is found in the description.
 */
export function matchSnippet(
  issue: { title: string; description?: string },
  query: string
): string | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const title = issue.title.toLowerCase();
  if (!issue.description || words.some((word) => title.includes(word))) {
    return null;
  }
  const description = issue.description.toLowerCase();
  const word = words.find((w) => description.includes(w));
  if (!word) {
    // ponytail: fuzzy/prefix index matches can't be located client-side
    return null;
  }
  const index = description.indexOf(word);
  const start = Math.max(0, index - 24);
  const end = Math.min(issue.description.length, index + 96);
  return (
    (start > 0 ? "…" : "") +
    issue.description.slice(start, end).trim() +
    (end < issue.description.length ? "…" : "")
  );
}
