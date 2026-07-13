import { MStripe } from './m-stripe'

// DESIGN.md footer: canvas background topped by the tricolor signature stripe.
// Slimmed for the local dashboard (feat-019): the marketing link columns are
// gone; the advisory disclaimer is the load-bearing content.
export function Footer() {
  return (
    <footer className="bg-canvas">
      <MStripe />
      {/* Extra bottom padding keeps the fixed AlertsCenter strip from covering
          the disclaimer at the end of the scroll. */}
      <div className="mx-auto max-w-[1800px] px-6 pb-24 pt-10">
        <p className="max-w-3xl text-xs font-light leading-relaxed tracking-wide text-muted">
          Gekko is an advisory-only research tool running locally on the trading machine.
          Nothing presented constitutes financial advice, a solicitation, or a recommendation
          to buy or sell any instrument. Futures trading carries substantial risk of loss.
          © 2026 Gekko Systems.
        </p>
      </div>
    </footer>
  )
}
