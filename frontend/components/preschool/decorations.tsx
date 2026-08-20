// Shared "forest clearing" decorative mascots/scenery — inline SVGs, no
// image assets — reused by the adventure road (game-map.tsx) and the
// full-screen preschool lesson view. See docs/interfaces/preschool.md and
// docs/interfaces/student/preschool/lesson.md.

export function DefaultStepIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#fcd34d" />
      <path
        d="M24 11l3.7 8 8.8 1.3-6.4 6.1 1.5 8.7L24 30.9l-7.6 4.2 1.5-8.7-6.4-6.1L20.3 19z"
        fill="#fff"
      />
    </svg>
  );
}

export function Cloud({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={`absolute fill-white ${className}`} aria-hidden="true">
      <ellipse cx="20" cy="24" rx="18" ry="14" />
      <ellipse cx="38" cy="18" rx="16" ry="16" />
      <ellipse cx="50" cy="26" rx="14" ry="11" />
    </svg>
  );
}

export function Sun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute fill-amber-300 ${className}`} aria-hidden="true">
      <path d="M12 2l2.6 6.6L21 10l-5.5 4.6L17 21l-5-3.5L7 21l1.5-6.4L3 10l6.4-1.4z" />
    </svg>
  );
}

export function Mushroom({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 28" className={className} aria-hidden="true">
      <rect x="9" y="15" width="6" height="11" rx="3" fill="#fff7ed" />
      <path
        d="M2 14C2 7 6.5 2 12 2s10 5 10 12c0 1.6-1.6 2.2-2.7 1.3-2.4-1.9-4.7-2.8-7.3-2.8s-4.9.9-7.3 2.8C3.6 16.2 2 15.6 2 14z"
        fill="#ef4444"
      />
      <circle cx="8" cy="8" r="1.4" fill="#fff" />
      <circle cx="13.5" cy="5.5" r="1.2" fill="#fff" />
      <circle cx="17.5" cy="9.5" r="1.3" fill="#fff" />
    </svg>
  );
}

export function Daisy({ className = "", color = "#ffffff" }: { className?: string; color?: string }) {
  const petalAngles = [0, 72, 144, 216, 288];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {petalAngles.map((angle) => (
        <ellipse key={angle} cx="12" cy="5.5" rx="3" ry="5.5" fill={color} transform={`rotate(${angle} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="3.4" fill="#fbbf24" />
    </svg>
  );
}

export function Tulip({ className = "", color = "#f472b6" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 20 30" className={className} aria-hidden="true">
      <path d="M10 27V15" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M4 6c0 4.2 2.6 7.2 6 8.2 3.4-1 6-4 6-8.2-2 1.6-4 1-6-1-2 2-4 2.6-6 1z" fill={color} />
    </svg>
  );
}

export function Bluebell({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 28" className={className} aria-hidden="true">
      <path d="M10 24V10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" fill="none" />
      <ellipse cx="6" cy="9" rx="3" ry="4" fill="#818cf8" transform="rotate(-15 6 9)" />
      <ellipse cx="12" cy="6" rx="3" ry="4" fill="#6366f1" />
      <ellipse cx="16" cy="10" rx="3" ry="4" fill="#818cf8" transform="rotate(15 16 10)" />
    </svg>
  );
}

export function Ladybug({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 20" className={className} aria-hidden="true">
      <ellipse cx="12" cy="11" rx="10" ry="8" fill="#ef4444" />
      <path d="M12 4v14" stroke="#111827" strokeWidth="1.3" />
      <circle cx="12" cy="4.5" r="3.2" fill="#111827" />
      <circle cx="7" cy="8" r="1.2" fill="#111827" />
      <circle cx="17" cy="8" r="1.2" fill="#111827" />
      <circle cx="6.5" cy="14" r="1.2" fill="#111827" />
      <circle cx="17.5" cy="14" r="1.2" fill="#111827" />
    </svg>
  );
}

export function Hedgehog({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 30" className={className} aria-hidden="true">
      <path
        d="M6 27c-2.5-10 3.5-21 16-21 8 0 14.5 6 16.5 12.5l-4.5-1.2 2 4-5-1 1 4-5.3-2v4.7z"
        fill="#a8785a"
      />
      <path d="M8 25c0 2.2 2 3.3 4.2 3.3h9.6c2.2 0 4.2-1.1 4.2-3.3" fill="#f5deb3" />
      <circle cx="30.5" cy="12.5" r="2.2" fill="#1f2937" />
      <circle cx="6" cy="23" r="1.6" fill="#1f2937" />
    </svg>
  );
}

export function Bee({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 18" className={className} aria-hidden="true">
      <ellipse cx="6" cy="7" rx="4.5" ry="3.4" fill="#fef9c3" opacity="0.85" transform="rotate(-18 6 7)" />
      <ellipse cx="18" cy="7" rx="4.5" ry="3.4" fill="#fef9c3" opacity="0.85" transform="rotate(18 18 7)" />
      <ellipse cx="12" cy="10" rx="6.4" ry="5.2" fill="#fbbf24" />
      <rect x="9.3" y="6" width="1.8" height="9" fill="#111827" />
      <rect x="13" y="6" width="1.8" height="9" fill="#111827" />
      <circle cx="12" cy="5" r="1.6" fill="#111827" />
    </svg>
  );
}

export function Butterfly({
  className = "",
  color = "#f472b6",
  style,
}: {
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 28 24" className={className} style={style} aria-hidden="true">
      <path
        d="M14 12c-2-8-12-10-13-4-1 5 6 6 13 4z"
        fill={color}
        style={{ transformOrigin: "14px 12px", animation: "wing-flap 0.9s ease-in-out infinite" }}
      />
      <path
        d="M14 12c2-8 12-10 13-4 1 5-6 6-13 4z"
        fill={color}
        style={{ transformOrigin: "14px 12px", animation: "wing-flap 0.9s ease-in-out infinite" }}
      />
      <line x1="14" y1="6" x2="14" y2="18" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
