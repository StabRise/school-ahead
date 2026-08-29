"use client";

// Labeled <input type="range"> with its live numeric value — shared by every
// scale/offset control in the avatar editor (TutorAvatarEditorPage).
export function AvatarEditorSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center justify-between text-gray-700">
        <span>{label}</span>
        <span className="tabular-nums text-gray-500">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-gray-900"
      />
    </label>
  );
}
