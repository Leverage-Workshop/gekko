// DESIGN.md top-nav: 64px, canvas background, hairline base, nav-link items,
// brand mark with the tricolor signature. Links anchor into the dashboard
// sections (feat-019 replaced the marketing page with the briefing dashboard);
// they are root-prefixed so they also work from /settings (feat-028).
const links = [
  { label: 'Overview', href: '/#overview' },
  { label: 'Terrain', href: '/#terrain' },
  { label: 'Objectives', href: '/#objectives' },
  { label: 'Eval', href: '/#eval' },
  { label: 'Settings', href: '/settings' },
]

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/95 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-1.5 flex-col" aria-hidden="true">
            <span className="flex-1 bg-m-blue-light" />
            <span className="flex-1 bg-m-blue-dark" />
            <span className="flex-1 bg-m-red" />
          </span>
          <span className="text-lg font-bold uppercase tracking-[0.2em] text-ink">Gekko</span>
        </div>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-light tracking-wide text-body transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <span className="text-xs font-light uppercase tracking-[0.3em] text-muted">
          Advisory Only
        </span>
      </nav>
    </header>
  )
}
