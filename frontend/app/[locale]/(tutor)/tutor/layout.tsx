export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50">
      {children}
    </div>
  );
}
