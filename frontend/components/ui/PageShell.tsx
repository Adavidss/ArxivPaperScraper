// Standard chrome for non-feed pages: header + scrollable content, padded
// clear of the fixed tab bar.

export function PageShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {action}
      </header>
      {children}
    </main>
  );
}
