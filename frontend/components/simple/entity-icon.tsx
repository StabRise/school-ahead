import { BookOpen, type LucideIcon } from "lucide-react";

// Same deterministic per-id accent color the old (now-deleted) SubjectCard
// used for its colored letter-square avatar — reused here for `colorful`
// rows only; Simple rows never see it.
const ICON_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

// Tiny entity icon shared by Simple-view rows (subjects, classes, students)
// — the real uploaded image at icon size when there is one. Without an
// image: a generic monochrome fallback icon by default, or (when
// `colorful`, `seedId`, and `name` are all given) a colored letter-square
// avatar instead — used by the Default dashboard's colorful subjects list.
export function SimpleEntityIcon({
  iconUrl,
  fallback: Icon = BookOpen,
  colorful,
  seedId,
  name,
}: {
  iconUrl?: string | null;
  fallback?: LucideIcon;
  colorful?: boolean;
  seedId?: number;
  name?: string;
}) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className="size-4 shrink-0 rounded object-cover" />
    );
  }
  if (colorful && seedId !== undefined && name) {
    const color = ICON_COLORS[seedId % ICON_COLORS.length];
    return (
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white ${color}`}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return <Icon className="size-4 shrink-0 text-gray-400" aria-hidden="true" />;
}
