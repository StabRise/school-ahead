// Pixel position of a character offset within a <textarea> — used to float
// the "format as card" button (components/tutor/story-markdown-editor.tsx)
// right above the current text selection. A <textarea>'s own text isn't
// exposed through any DOM range/selection API (that's contenteditable-only),
// so this uses the standard "mirror div" trick: clone every style that
// affects text layout onto an off-screen div, fill it with the text up to
// the target offset, and read the position of a marker span appended at the
// end of that div.
const MIRRORED_PROPERTIES: (keyof CSSStyleDeclaration)[] = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "tabSize",
];

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): CaretCoordinates {
  const div = document.createElement("div");
  const computed = window.getComputedStyle(textarea);

  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.top = "0";
  div.style.left = "-9999px";

  for (const property of MIRRORED_PROPERTIES) {
    // CSSStyleDeclaration's index signature returns `string`, matching
    // what div.style's own setter for these properties expects.
    (div.style as unknown as Record<string, string>)[property as string] = computed[property] as string;
  }

  document.body.appendChild(div);

  div.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  // A zero-width space, not an empty string — an empty inline element has
  // no line box of its own, so its offsetTop would collapse to the bottom
  // of the previous line instead of marking the caret's actual line.
  marker.textContent = "​";
  div.appendChild(marker);

  const coordinates: CaretCoordinates = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: marker.offsetHeight,
  };

  document.body.removeChild(div);
  return coordinates;
}
