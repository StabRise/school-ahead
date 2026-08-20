// Shared page shell (centered column + title heading) used by every simple
// list-style student page.
export function PageContainer({
  title,
  children,
  maxWidthClassName = "max-w-2xl",
}: {
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className={`mx-auto w-full ${maxWidthClassName} p-6`}>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </div>
  );
}
