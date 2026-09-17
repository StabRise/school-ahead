"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

// Click-to-browse + drag-and-drop file picker — same look and behavior
// everywhere a file gets attached (the student's task submission in
// TaskStep, the tutor's reply attachments in PendingReviewPanel). Only the
// hint text and what happens with the picked files differ per caller.
// `min-h-32` (plus the icon) keeps this a real drop *target* — a rectangle
// you can aim a drag at — rather than shrinking to a single line of hint
// text the way a bare flex box with no minimum height would.
export function FileDropzone({
  id,
  hint,
  multiple = true,
  accept,
  onFilesSelected,
}: {
  id?: string;
  hint: string;
  multiple?: boolean;
  accept?: string;
  onFilesSelected: (files: FileList | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        onFilesSelected(e.dataTransfer.files);
      }}
      className={`flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        isDragging ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-400"
      }`}
    >
      <UploadCloud className={`h-8 w-8 ${isDragging ? "text-gray-700" : "text-gray-300"}`} aria-hidden="true" />
      <p className="text-sm text-gray-500">{hint}</p>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFilesSelected(e.target.files);
          // Without this, re-picking the exact same file(s) after a removal
          // wouldn't fire onChange a second time.
          e.target.value = "";
        }}
      />
    </div>
  );
}
