import Link from "next/link";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-semibold text-white">
          O
        </div>
        <p className="text-sm font-semibold text-foreground">
          On<span className="text-primary">Board</span> Careers
        </p>
      </Link>
      {children}
    </main>
  );
}
