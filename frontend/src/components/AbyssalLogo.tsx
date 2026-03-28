interface Props {
  size?: number;
  className?: string;
}

/**
 * Abyssal.fi logo mark — inline SVG so it renders instantly with no network request.
 * The "A" with a wave crossbar: two strokes descending into the abyss, a sea-surface
 * wave as crossbar, and a glowing apex dot at the entry point.
 */
export function AbyssalLogo({ size = 28, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Abyssal.fi logo"
    >
      <defs>
        <linearGradient id="abyssal-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="32" height="32" rx="8" fill="url(#abyssal-bg)" />
      {/* Left stroke */}
      <line x1="16" y1="5.5" x2="5" y2="26.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Right stroke */}
      <line x1="16" y1="5.5" x2="27" y2="26.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Wave crossbar — sea surface */}
      <path
        d="M9 18.5 C11 15.5 13.5 21.5 16 18.5 C18.5 15.5 21 21.5 23 18.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Apex glow — the abyss entry point */}
      <circle cx="16" cy="5.5" r="1.5" fill="white" opacity="0.85" />
    </svg>
  );
}
