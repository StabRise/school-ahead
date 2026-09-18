// "{name} ({count})" — the one format for a SubjectGroup heading/tab across
// every grouped-subjects view (components/subjects/simple-subjects-page.tsx,
// components/subject-progress-list.tsx, components/tutor/
// tutor-class-detail-page.tsx), so the count reads the same everywhere.
export function subjectGroupLabel(name: string, count: number): string {
  return `${name} (${count})`;
}
