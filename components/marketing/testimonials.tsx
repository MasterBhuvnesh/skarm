import { Aperture, Hexagon, Waves, type LucideIcon } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Section, SectionHeading } from "@/components/marketing/section";

const TESTIMONIALS: {
  quote: string;
  name: string;
  role: string;
  company: string;
  icon: LucideIcon;
}[] = [
  {
    quote:
      "We moved four thousand issues over a weekend and nobody asked how to use it on Monday. It’s that obvious.",
    name: "Mara Lindqvist",
    role: "VP Engineering",
    company: "Tidal",
    icon: Waves,
  },
  {
    quote:
      "The cycle reports the agent writes are better than the ones I used to write. I checked. Twice.",
    name: "Theo Park",
    role: "Engineering Lead",
    company: "Aperture",
    icon: Aperture,
  },
  {
    quote:
      "Skarm is the first tracker our engineers don’t complain about. ⌘K does everything, and the board never lags.",
    name: "Ada Okafor",
    role: "CTO",
    company: "Hexa Labs",
    icon: Hexagon,
  },
];

export function Testimonials() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Loved by builders"
        title="Teams switch for the speed. They stay for the calm."
        align="center"
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((testimonial) => (
          <figure
            key={testimonial.name}
            className="flex flex-col justify-between gap-6 rounded-xl border bg-card/50 p-6"
          >
            <blockquote className="text-sm leading-relaxed text-foreground/90">
              “{testimonial.quote}”
            </blockquote>
            <figcaption className="flex items-center gap-3 border-t pt-4">
              <UserAvatar name={testimonial.name} className="size-8" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {testimonial.name}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {testimonial.role} ·
                  <testimonial.icon className="size-3" />
                  {testimonial.company}
                </p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
