"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import {
  Bee,
  Bluebell,
  Butterfly,
  Cloud,
  Daisy,
  DefaultStepIcon,
  Ladybug,
  Mushroom,
  Sun,
  Tulip,
} from "@/components/preschool/decorations";
import { pseudoRandom } from "@/components/preschool/random";
import { Raccoon } from "@/components/preschool/raccoon";
import { useAuthStore } from "@/stores/auth-store";

// The student's chosen companion (docs/core/avatar.md) if they've picked
// one — falls back to the raccoon mascot otherwise. Stands next to the
// current node, the next lesson the child needs to do. `className` is
// positioning/sizing only — the circular frame only makes sense around a
// photo, not around the raccoon's own shape.
function CompanionAvatar({ image, className }: { image: string | null | undefined; className: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={`rounded-full border-[3px] border-white object-cover shadow-md ${className}`} />;
  }
  return <Raccoon mood="idle" className={className} />;
}

// "Fairy-tale adventure path" design concept — see docs/interfaces/
// preschool.md. A winding stone-tile trail (not a flat road) through a
// meadow, flanked by mushrooms/flowers/bugs, where the next lesson to do
// is the big swaying node with butterflies and finished lessons become
// small gold star-coins with a resting bee.

function StepIcon({ item }: { item: CalendarItemOut }) {
  const src = item.lesson_icon ?? item.subject_icon;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-full w-full rounded-full object-cover" />;
  }
  return <DefaultStepIcon />;
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

// Waiting on the tutor to grade it — no longer tappable, but not a "done"
// gold star either, so it gets its own paler, muted look.
function PendingReviewNode({ item }: { item: CalendarItemOut }) {
  return (
    <div className="flex flex-col items-center gap-2" aria-disabled="true">
      <div
        className="relative flex items-center justify-center rounded-full border-[6px] border-gray-200 bg-gray-100 opacity-70 shadow-md grayscale"
        style={{ width: CIRCLE_UPCOMING, height: CIRCLE_UPCOMING }}
      >
        <div className="h-[86%] w-[86%] overflow-hidden rounded-full">
          <StepIcon item={item} />
        </div>
      </div>
      <p className="max-w-32 text-center text-sm font-semibold text-gray-400">{item.lesson_title}</p>
    </div>
  );
}

function ActiveNode({
  item,
  isCurrent,
  companionAvatarImage,
}: {
  item: CalendarItemOut;
  isCurrent: boolean;
  companionAvatarImage: string | null | undefined;
}) {
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
            <CompanionAvatar
              image={companionAvatarImage}
              className="absolute -right-4 bottom-0 z-10 h-14 w-14"
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
  companionAvatarImage,
}: {
  item: CalendarItemOut;
  point: Point;
  isCurrent: boolean;
  companionAvatarImage: string | null | undefined;
}) {
  const isCompleted = item.status === "completed";
  const isPendingReview = item.status === "pending_review";
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

  if (isPendingReview) {
    return (
      <div className="absolute" style={wrapperStyle}>
        <PendingReviewNode item={item} />
      </div>
    );
  }

  return (
    <Link
      href={`/lessons/${item.id}`}
      className="absolute rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      style={wrapperStyle}
    >
      <ActiveNode item={item} isCurrent={isCurrent} companionAvatarImage={companionAvatarImage} />
    </Link>
  );
}

export function PreschoolGameMap({ items }: { items: CalendarItemOut[] }) {
  const t = useTranslations("PreschoolGameMap");
  const equippedAvatarImage = useAuthStore((state) => state.user?.equippedAvatar?.image);
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
  const currentIndex = items.findIndex((item) => item.status !== "completed" && item.status !== "pending_review");

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden px-2 py-8">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-4 top-3 h-8 w-14 opacity-90" />
        <Cloud className="right-6 top-10 h-6 w-12 opacity-70" />
        <Sun className="left-1/3 top-6 h-5 w-5" />
        <Sun className="right-1/4 top-20 h-4 w-4" />
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
          <StepNode
            key={item.id}
            item={item}
            point={points[index]}
            isCurrent={index === currentIndex}
            companionAvatarImage={equippedAvatarImage}
          />
        ))}
      </div>
    </div>
  );
}
