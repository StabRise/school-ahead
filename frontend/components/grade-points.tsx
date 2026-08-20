export function GradePoints({ points }: { points: number }) {
  return <span className="shrink-0 text-xs font-semibold text-gray-700">{points}/12</span>;
}
