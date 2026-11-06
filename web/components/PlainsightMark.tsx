export function PlainsightMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <rect x="5" y="4" width="7" height="24" />
      <path d="M14 4h3a7 7 0 0 1 0 14h-3z" />
      <rect x="21" y="21" width="7" height="7" />
    </svg>
  );
}
