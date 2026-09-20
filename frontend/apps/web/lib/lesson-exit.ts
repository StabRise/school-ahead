import { getPreviousRoute, browserRouteStore } from "./route-history";

const DASHBOARD = "/";
// The road of today's lessons ("My lessons") — where a lesson is opened from
// most often.
const LESSONS_ROAD = "/lessons";

// Where the preschool lesson screen's round exit button goes: back to the
// road (or the dashboard) if that's where the child opened the lesson from,
// otherwise to the lesson's own subject page (a lesson is opened from the
// subject page, the calendar, a backlog bubble, ...). With no subject known
// yet — the lesson hasn't loaded — the dashboard is the only place it can go.
export function lessonExitHref(previousRoute: string | null, subjectId: number | null): string {
  if (previousRoute === LESSONS_ROAD) return LESSONS_ROAD;
  if (previousRoute === DASHBOARD || subjectId === null) return DASHBOARD;
  return `/subjects/${subjectId}`;
}

export function currentLessonExitHref(subjectId: number | null): string {
  const store = browserRouteStore();
  return lessonExitHref(store ? getPreviousRoute(store) : null, subjectId);
}
