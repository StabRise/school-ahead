"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// A cute default mascot used when neither the lesson nor its subject has an
// icon set — see docs/interfaces/preschool.md section 2.3.
function DefaultStepIcon() {
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

function CheckBadge() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#22c55e" />
      <path
        d="M7 12.5l3 3 7-7"
        stroke="#fff"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cloud({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={`absolute fill-white ${className}`} aria-hidden="true">
      <ellipse cx="20" cy="24" rx="18" ry="14" />
      <ellipse cx="38" cy="18" rx="16" ry="16" />
      <ellipse cx="50" cy="26" rx="14" ry="11" />
    </svg>
  );
}

function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute fill-amber-300 ${className}`} aria-hidden="true">
      <path d="M12 2l2.6 6.6L21 10l-5.5 4.6L17 21l-5-3.5L7 21l1.5-6.4L3 10l6.4-1.4z" />
    </svg>
  );
}

function StepIcon({ item }: { item: CalendarItemOut }) {
  const src = item.lesson_icon ?? item.subject_icon;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-full w-full rounded-full object-cover" />;
  }
  return <DefaultStepIcon />;
}

// Layout constants for the winding road — a fixed px coordinate system
// (both axes) so the SVG path and the absolutely-positioned nodes always
// agree, at any container width.
const CIRCLE_SIZE = 112;
const TOP_PADDING = 76;
const BOTTOM_PADDING = 60;
const NODE_SPACING_Y = 170;
const AMPLITUDE_RATIO = 0.3;

interface Point {
  x: number;
  y: number;
}

// Smooth Catmull-Rom -> cubic Bezier spline through every node's center —
// this is what turns the left/right zigzag into a real curled, Reading-Eggs
// style trail instead of sharp corners.
function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y} `;
  }
  return d;
}

function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function StepNode({
  item,
  point,
  label,
}: {
  item: CalendarItemOut;
  point: Point;
  label: string;
}) {
  const isCompleted = item.status === "completed";

  const circle = (
    <div
      className={`relative flex items-center justify-center rounded-full border-[6px] shadow-lg transition-transform ${
        isCompleted
          ? "border-gray-200 bg-gray-100 opacity-60 grayscale"
          : "border-white bg-white group-hover:-translate-y-1 group-hover:scale-105"
      }`}
      style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
    >
      <div className="h-[86%] w-[86%] overflow-hidden rounded-full">
        <StepIcon item={item} />
      </div>
      {isCompleted && (
        <span className="absolute -bottom-1 -right-1">
          <CheckBadge />
        </span>
      )}
    </div>
  );

  const content = (
    <div className="flex flex-col items-center gap-2">
      {circle}
      {isCompleted && <span className="text-xs font-medium text-gray-400">{label}</span>}
      <p
        className={`max-w-32 text-center text-sm font-semibold ${isCompleted ? "text-gray-400" : "text-gray-800"}`}
      >
        {item.lesson_title}
      </p>
    </div>
  );

  const wrapperStyle: React.CSSProperties = {
    left: point.x,
    top: point.y - CIRCLE_SIZE / 2,
    transform: "translateX(-50%)",
    width: 140,
  };

  if (isCompleted) {
    return (
      <div className="absolute" style={wrapperStyle} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/lessons/${item.id}`}
      className="group absolute rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      style={wrapperStyle}
    >
      {content}
    </Link>
  );
}

export function PreschoolGameMap({ items }: { items: CalendarItemOut[] }) {
  const t = useTranslations("PreschoolGameMap");
  const [roadRef, width] = useMeasuredWidth(360);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center">
        <p className="text-base font-medium text-gray-600">{t("empty")}</p>
      </div>
    );
  }

  const height = TOP_PADDING + Math.max(items.length - 1, 0) * NODE_SPACING_Y + BOTTOM_PADDING;
  const amplitude = width * AMPLITUDE_RATIO;
  const centerX = width / 2;
  const points: Point[] = items.map((_, index) => ({
    x: centerX + (index % 2 === 0 ? -1 : 1) * amplitude,
    y: TOP_PADDING + index * NODE_SPACING_Y,
  }));
  const pathD = smoothPath(points);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden px-2 py-8">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-4 top-3 h-8 w-14 opacity-80" />
        <Cloud className="right-6 top-10 h-6 w-12 opacity-60" />
        <Star className="left-1/3 top-6 h-4 w-4" />
        <Star className="right-1/4 top-24 h-3 w-3" />
      </div>

      <p className="relative mb-4 text-center text-lg font-bold text-gray-700">{t("title")}</p>

      {/* The winding "adventure road" — a curled trail (Reading Eggs style)
          drawn as a smooth spline through every step's exact center, with
          step nodes sitting directly on it. */}
      <div ref={roadRef} className="relative mx-auto w-full max-w-md" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="absolute inset-0"
          aria-hidden="true"
        >
          <path d={pathD} stroke="#d97706" strokeWidth={26} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathD} stroke="#fde68a" strokeWidth={20} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={pathD}
            stroke="#fffbeb"
            strokeWidth={2.5}
            strokeDasharray="10 12"
            fill="none"
            strokeLinecap="round"
          />
        </svg>

        {items.map((item, index) => (
          <StepNode key={item.id} item={item} point={points[index]} label={t("done")} />
        ))}
      </div>
    </div>
  );
}
