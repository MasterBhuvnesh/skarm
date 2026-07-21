/**
 * The Skarm petal mark, inlined so it stays crisp at any size and needs no
 * image pipeline. Pass a unique `id` when rendering more than once per page
 * (SVG gradient ids are document-global).
 */
export function SkarmLogo({
  size = 26,
  id = "skarm-petal",
  className,
}: {
  size?: number;
  id?: string;
  className?: string;
}) {
  const petal =
    "M 16 14.6 C 14.2 11.2, 13.2 9.2, 13.4 6.9 A 3.3 3.3 0 0 1 19.9 7.6 C 19.5 9.8, 17.8 11.8, 16 14.6 Z";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient
          id={id}
          cx="16"
          cy="16"
          r="13"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8a93f5" />
          <stop offset="0.35" stopColor="#5e6ad2" />
          <stop offset="1" stopColor="#1c1f45" />
        </radialGradient>
      </defs>
      <g fill={`url(#${id})`} transform="rotate(-15 16 16)">
        {[0, 72, 144, 216, 288].map((angle) => (
          <path key={angle} d={petal} transform={`rotate(${angle} 16 16)`} />
        ))}
      </g>
    </svg>
  );
}
