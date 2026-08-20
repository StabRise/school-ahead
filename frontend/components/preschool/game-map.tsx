"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// "Fairy-tale adventure path" design concept — see docs/interfaces/
// preschool.md. A winding stone-tile trail (not a flat road) through a
// meadow, flanked by mushrooms/flowers/bugs, where the next lesson to do
// is the big swaying node with butterflies and finished lessons become
// small gold star-coins with a resting bee.

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

function Cloud({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={`absolute fill-white ${className}`} aria-hidden="true">
      <ellipse cx="20" cy="24" rx="18" ry="14" />
      <ellipse cx="38" cy="18" rx="16" ry="16" />
      <ellipse cx="50" cy="26" rx="14" ry="11" />
    </svg>
  );
}

function Sun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute fill-amber-300 ${className}`} aria-hidden="true">
      <path d="M12 2l2.6 6.6L21 10l-5.5 4.6L17 21l-5-3.5L7 21l1.5-6.4L3 10l6.4-1.4z" />
    </svg>
  );
}

function Mushroom({ className = "" }: { className?: string }) {
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

function Daisy({ className = "", color = "#ffffff" }: { className?: string; color?: string }) {
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

function Tulip({ className = "", color = "#f472b6" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 20 30" className={className} aria-hidden="true">
      <path d="M10 27V15" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M4 6c0 4.2 2.6 7.2 6 8.2 3.4-1 6-4 6-8.2-2 1.6-4 1-6-1-2 2-4 2.6-6 1z" fill={color} />
    </svg>
  );
}

function Bluebell({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 28" className={className} aria-hidden="true">
      <path d="M10 24V10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" fill="none" />
      <ellipse cx="6" cy="9" rx="3" ry="4" fill="#818cf8" transform="rotate(-15 6 9)" />
      <ellipse cx="12" cy="6" rx="3" ry="4" fill="#6366f1" />
      <ellipse cx="16" cy="10" rx="3" ry="4" fill="#818cf8" transform="rotate(15 16 10)" />
    </svg>
  );
}

function Ladybug({ className = "" }: { className?: string }) {
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

function Hedgehog({ className = "" }: { className?: string }) {
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

function Bee({ className = "" }: { className?: string }) {
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

function Butterfly({
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

function StepIcon({ item }: { item: CalendarItemOut }) {
  const src = item.lesson_icon ?? item.subject_icon;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-full w-full rounded-full object-cover" />;
  }
  return <DefaultStepIcon />;
}

// Deterministic pseudo-random in [0, 1) — stable across server/client
// render so decorations never shift on hydration.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ---- Layout: a fixed px coordinate system (both axes) so the stone trail
// and the absolutely-positioned nodes always agree, at any container width.

const CIRCLE_UPCOMING = 108;
const CIRCLE_CURRENT = 136;
const CIRCLE_COMPLETED = 92;
const TOP_PADDING = 100;
const BOTTOM_PADDING = 90;

// Boustrophedon "shelf" layout — a row of lessons per bend, alternating
// left-to-right / right-to-left, connected by a smooth curled line. See
// docs/interfaces/preschool.md. Row length is responsive (2-5 lessons)
// based on the measured container width.
const ROW_HEIGHT = 220;

function columnsForWidth(width: number): number {
  if (width < 420) return 2;
  if (width < 580) return 3;
  if (width < 760) return 4;
  return 5;
}

function columnRatios(columns: number): number[] {
  if (columns <= 1) return [0.5];
  const margin = 0.14;
  return Array.from({ length: columns }, (_, i) => margin + (i * (1 - 2 * margin)) / (columns - 1));
}

interface Point {
  x: number;
  y: number;
}

interface BezierSegment {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
}

// Catmull-Rom -> cubic Bezier control points through every node's center —
// this is what turns the left/right zigzag into a real curled trail.
function buildSegments(points: Point[]): BezierSegment[] {
  const segments: BezierSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    segments.push({
      p0: p1,
      p1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      p2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p3: p2,
    });
  }
  return segments;
}

function segmentsToPathD(segments: BezierSegment[]): string {
  if (segments.length === 0) return "";
  let d = `M ${segments[0].p0.x} ${segments[0].p0.y} `;
  for (const seg of segments) {
    d += `C ${seg.p1.x} ${seg.p1.y}, ${seg.p2.x} ${seg.p2.y}, ${seg.p3.x} ${seg.p3.y} `;
  }
  return d;
}

function cubicPoint(seg: BezierSegment, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * seg.p0.x + 3 * mt * mt * t * seg.p1.x + 3 * mt * t * t * seg.p2.x + t * t * t * seg.p3.x,
    y: mt * mt * mt * seg.p0.y + 3 * mt * mt * t * seg.p1.y + 3 * mt * t * t * seg.p2.y + t * t * t * seg.p3.y,
  };
}

function cubicTangentAngle(seg: BezierSegment, t: number): number {
  const mt = 1 - t;
  const dx = 3 * mt * mt * (seg.p1.x - seg.p0.x) + 6 * mt * t * (seg.p2.x - seg.p1.x) + 3 * t * t * (seg.p3.x - seg.p2.x);
  const dy = 3 * mt * mt * (seg.p1.y - seg.p0.y) + 6 * mt * t * (seg.p2.y - seg.p1.y) + 3 * t * t * (seg.p3.y - seg.p2.y);
  return Math.atan2(dy, dx);
}

const DECORATIONS = [Mushroom, Daisy, Tulip, Bluebell, Ladybug];

function TrailDecorations({ segments }: { segments: BezierSegment[] }) {
  const items = useMemo(() => {
    return segments.flatMap((seg, segIndex) => {
      if (segIndex % 1 !== 0) return [];
      const t = 0.5;
      const point = cubicPoint(seg, t);
      const angle = cubicTangentAngle(seg, t);
      const normal = angle + Math.PI / 2;
      const side = segIndex % 2 === 0 ? 1 : -1;
      const distance = 62 + pseudoRandom(segIndex * 7.7) * 14;
      const x = point.x + Math.cos(normal) * distance * side;
      const y = point.y + Math.sin(normal) * distance * side + (pseudoRandom(segIndex * 3.3) - 0.5) * 20;
      const Decoration = DECORATIONS[segIndex % DECORATIONS.length];
      const scale = 0.85 + pseudoRandom(segIndex * 5.1) * 0.4;
      return [{ key: segIndex, x, y, Decoration, scale }];
    });
  }, [segments]);

  return (
    <>
      {items.map(({ key, x, y, Decoration, scale }) => (
        <div
          key={key}
          className="pointer-events-none absolute"
          style={{ left: x, top: y, width: 26 * scale, transform: "translate(-50%, -50%)" }}
        >
          <Decoration className="w-full drop-shadow-sm" />
        </div>
      ))}
    </>
  );
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

function CompletedCoin({ item }: { item: CalendarItemOut }) {
  return (
    <div className="relative flex flex-col items-center gap-1" aria-disabled="true">
      <div
        className="relative flex items-center justify-center rounded-full shadow-lg"
        style={{
          width: CIRCLE_COMPLETED,
          height: CIRCLE_COMPLETED,
          background: "radial-gradient(circle at 35% 30%, #fff4c2, #fbbf24 55%, #d97706)",
        }}
      >
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" aria-hidden="true">
          <path d="M12 2l2.6 6.6L21 10l-5.5 4.6L17 21l-5-3.5L7 21l1.5-6.4L3 10l6.4-1.4z" fill="#fff7ed" />
        </svg>
        <span className="absolute -right-2 -top-3">
          <Bee className="h-7 w-7" />
        </span>
      </div>
      <p className="max-w-28 text-center text-xs font-semibold text-amber-800/70">{item.lesson_title}</p>
    </div>
  );
}

function ActiveNode({ item, isCurrent }: { item: CalendarItemOut; isCurrent: boolean }) {
  const size = isCurrent ? CIRCLE_CURRENT : CIRCLE_UPCOMING;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {isCurrent && (
          <>
            <Butterfly
              color="#f472b6"
              className="absolute -left-6 -top-4 h-7 w-7"
              style={{ animation: "flutter-a 3.4s ease-in-out infinite" }}
            />
            <Butterfly
              color="#38bdf8"
              className="absolute -right-6 -top-2 h-6 w-6"
              style={{ animation: "flutter-b 2.8s ease-in-out infinite 0.4s" }}
            />
          </>
        )}
        <div
          className={`relative flex items-center justify-center rounded-full border-[6px] border-white bg-white shadow-xl ${
            isCurrent ? "ring-4 ring-amber-300" : ""
          }`}
          style={{
            width: size,
            height: size,
            animation: isCurrent ? "node-sway 2.6s ease-in-out infinite" : undefined,
            transformOrigin: "50% 110%",
          }}
        >
          <div className="h-[86%] w-[86%] overflow-hidden rounded-full">
            <StepIcon item={item} />
          </div>
        </div>
      </div>
      <p className={`max-w-32 text-center font-semibold text-gray-800 ${isCurrent ? "text-base" : "text-sm"}`}>
        {item.lesson_title}
      </p>
    </div>
  );
}

function StepNode({
  item,
  point,
  isCurrent,
}: {
  item: CalendarItemOut;
  point: Point;
  isCurrent: boolean;
}) {
  const isCompleted = item.status === "completed";
  const size = isCompleted ? CIRCLE_COMPLETED : isCurrent ? CIRCLE_CURRENT : CIRCLE_UPCOMING;

  const wrapperStyle: React.CSSProperties = {
    left: point.x,
    top: point.y - size / 2,
    transform: "translateX(-50%)",
    width: 150,
  };

  if (isCompleted) {
    return (
      <div className="absolute" style={wrapperStyle}>
        <CompletedCoin item={item} />
      </div>
    );
  }

  return (
    <Link
      href={`/lessons/${item.id}`}
      className="absolute rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      style={wrapperStyle}
    >
      <ActiveNode item={item} isCurrent={isCurrent} />
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

  const columns = columnsForWidth(width);
  const colRatios = columnRatios(columns);
  const rowCount = Math.ceil(items.length / columns);
  const height = TOP_PADDING + Math.max(rowCount - 1, 0) * ROW_HEIGHT + BOTTOM_PADDING;
  const points: Point[] = items.map((_, index) => {
    const row = Math.floor(index / columns);
    const posInRow = index % columns;
    const reversed = row % 2 === 1;
    const colIndex = reversed ? columns - 1 - posInRow : posInRow;
    return {
      x: colRatios[colIndex] * width,
      y: TOP_PADDING + row * ROW_HEIGHT,
    };
  });
  const segments = buildSegments(points);
  const pathD = segmentsToPathD(segments);
  const currentIndex = items.findIndex((item) => item.status !== "completed");

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden px-2 py-8">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-4 top-3 h-8 w-14 opacity-90" />
        <Cloud className="right-6 top-10 h-6 w-12 opacity-70" />
        <Sun className="left-1/3 top-6 h-5 w-5" />
        <Sun className="right-1/4 top-20 h-4 w-4" />
        <Hedgehog className="left-6 top-24 h-10 w-14 opacity-90" />
      </div>

      <p className="relative mb-4 text-center text-lg font-bold text-emerald-900">{t("title")}</p>

      <div ref={roadRef} className="relative mx-auto w-full max-w-4xl" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="absolute inset-0"
          aria-hidden="true"
        >
          <path d={pathD} stroke="#d97706" strokeWidth={28} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathD} stroke="#fde68a" strokeWidth={21} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={pathD}
            stroke="#fffbeb"
            strokeWidth={2.5}
            strokeDasharray="10 12"
            fill="none"
            strokeLinecap="round"
          />
        </svg>

        <TrailDecorations segments={segments} />

        {items.map((item, index) => (
          <StepNode key={item.id} item={item} point={points[index]} isCurrent={index === currentIndex} />
        ))}
      </div>
    </div>
  );
}
