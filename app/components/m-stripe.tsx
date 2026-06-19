// M tricolor signature stripe (light blue → dark blue → red).
// DESIGN.md: the brand signature — a 4px divider, never an action surface.
export function MStripe({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-1 ${className}`} aria-hidden="true">
      <div className="flex-1 bg-m-blue-light" />
      <div className="flex-1 bg-m-blue-dark" />
      <div className="flex-1 bg-m-red" />
    </div>
  )
}
