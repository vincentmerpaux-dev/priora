export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="flex flex-col gap-4">
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-16 w-full" />
      <div className="flex flex-col gap-px overflow-hidden rounded-[var(--radius)] border border-line">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-14 w-full rounded-none" />)}
      </div>
    </div>
  );
}
