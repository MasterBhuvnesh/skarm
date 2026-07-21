/**
 * The Skarm petal mark, inlined so it stays crisp at any size and needs no
 * image pipeline. `tile` renders the app-tile treatment (white petals on the
 * rounded indigo square). Pass a unique `id` when rendering more than once
 * per page (SVG gradient ids are document-global).
 */
export function SkarmLogo({
  size = 26,
  id = "skarm-petal",
  className,
  tile = false,
}: {
  size?: number;
  id?: string;
  className?: string;
  tile?: boolean;
}) {
  const petal =
    "M 16 14.6 C 14.2 11.2, 13.2 9.2, 13.4 6.9 A 3.3 3.3 0 0 1 19.9 7.6 C 19.5 9.8, 17.8 11.8, 16 14.6 Z";
  const petals = (fill: string, scale?: string) => (
    <g fill={fill} transform={`${scale ?? ""} rotate(-15 16 16)`.trim()}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <path key={angle} d={petal} transform={`rotate(${angle} 16 16)`} />
      ))}
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <defs>
        {tile ? (
          <linearGradient
            id={id}
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#6a76e0" />
            <stop offset="1" stopColor="#4f5ac4" />
          </linearGradient>
        ) : (
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
        )}
      </defs>
      {tile ? (
        <>
          <rect width="32" height="32" rx="7.2" fill={`url(#${id})`} />
          {petals("#ffffff", "translate(16 16) scale(0.78) translate(-16 -16)")}
        </>
      ) : (
        petals(`url(#${id})`)
      )}
    </svg>
  );
}
