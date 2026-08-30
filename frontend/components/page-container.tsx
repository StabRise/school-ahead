// Shared page shell used by every simple list-style student page. Full width
// (edge-to-edge padding only) through every breakpoint up to `lg`, then caps
// at `maxWidthClassName` and centers via auto margins from `xl` up —
// `maxWidthClassName` should therefore only ever carry `xl:max-w-*` classes,
// never an unprefixed `max-w-*`.
export function PageContainer({
  title,
  children,
  maxWidthClassName = "xl:max-w-6xl",
  bgClassName = "",
}: {
  title?: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
  bgClassName?: string;
}) {
  return (
    <div className={`w-full ${bgClassName} px-4 py-6 sm:px-6 lg:px-8 xl:mx-auto ${maxWidthClassName}`}>
      {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}
      {children}
    </div>
  );
}
