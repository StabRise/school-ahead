// Deterministic per-subject accent color, used as the icon square's
// fallback background when the subject has no uploaded icon — shared by
// SubjectCard ("Мої предмети") and AchievementCard ("Мої досягнення").
const ICON_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

export function SubjectIcon({ id, name, iconUrl }: { id: number; name: string; iconUrl?: string | null }) {
  if (iconUrl) {
    return (
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  const iconColor = ICON_COLORS[id % ICON_COLORS.length];
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${iconColor}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
