"use client";

import { useRef, useState } from "react";

// Click-to-browse + drag-and-drop file picker — same look and behavior
// everywhere a file gets attached (the student's task submission in
// TaskStep, the tutor's reply attachments in PendingReviewPanel). Only the
// hint text and what happens with the picked files differ per caller.
export function FileDropzone({
  id,
  hint,
  multiple = true,
  onFilesSelected,
}: {
  id?: string;
  hint: string;
  multiple?: boolean;
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
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        isDragging ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-400"
      }`}
    >
      <p className="text-sm text-gray-500">{hint}</p>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        multiple={multiple}
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
