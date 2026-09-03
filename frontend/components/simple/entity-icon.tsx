import { BookOpen, type LucideIcon } from "lucide-react";

// Tiny grey entity icon shared by Simple-view rows (subjects, classes,
// students) — the real uploaded image at icon size when there is one,
// otherwise a generic monochrome fallback icon instead of a colored
// letter-square avatar.
export function SimpleEntityIcon({
  iconUrl,
  fallback: Icon = BookOpen,
}: {
  iconUrl?: string | null;
  fallback?: LucideIcon;
}) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className="size-4 shrink-0 rounded object-cover" />
    );
  }
  return <Icon className="size-4 shrink-0 text-gray-400" aria-hidden="true" />;
}
