import { MStripe } from './m-stripe'

// DESIGN.md footer: canvas background, 4-column link list, caption-weight
// disclaimer. Topped by the tricolor signature stripe.
const columns = [
  { heading: 'Product', items: ['Briefings', 'Proximity Triggers', 'Level Engine', 'Session Replay'] },
  { heading: 'Method', items: ['Volume Profile', 'Delta Bias', 'Playbook', 'Changelog'] },
  { heading: 'Company', items: ['About', 'Careers', 'Status', 'Contact'] },
  { heading: 'Legal', items: ['Terms', 'Privacy', 'Risk Disclosure', 'Advisory Notice'] },
]

export function Footer() {
  return (
    <footer className="bg-canvas">
      <MStripe />
      <div className="mx-auto max-w-[1440px] px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="mb-4 text-sm font-bold uppercase tracking-[1.5px] text-ink">
                {col.heading}
              </h3>
              <ul className="space-y-3">
                {col.items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm font-light text-muted transition-colors hover:text-body"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-hairline pt-8">
          <p className="max-w-3xl text-xs font-light leading-relaxed tracking-wide text-muted">
            Gekko is an advisory-only research tool. Nothing presented constitutes financial
            advice, a solicitation, or a recommendation to buy or sell any instrument. Futures
            trading carries substantial risk of loss. © 2026 Gekko Systems.
          </p>
        </div>
      </div>
    </footer>
  )
}
