import { Button } from './components/button'
import { Footer } from './components/footer'
import { MStripe } from './components/m-stripe'
import { TopNav } from './components/top-nav'

// Filler landing page demonstrating the updated DESIGN.md brand model:
// bmw-blue = primary voltage (CTAs, key numbers), m-red = secondary accent for
// significant UI, M tricolor stripe = brand signature, color over photography.

const stats = [
  { value: '1.8M', label: 'Contracts Scanned / Session' },
  { value: '94%', label: 'Bias Confirmation Rate' },
  { value: '12s', label: 'Briefing Latency' },
  { value: '24/5', label: 'Globex Coverage' },
]

const features = [
  {
    tag: 'Proximity',
    title: 'Trigger on Approach',
    body: 'Gekko watches price drift toward your mapped levels and fires a focused briefing the moment proximity is met — no staring at the ladder.',
  },
  {
    tag: 'Scheduled',
    title: 'Pre-Session Reports',
    body: 'A full read of overnight volume profile, delta bias, and key levels lands before the cash open, every session, on your cadence.',
  },
  {
    tag: 'Parsing',
    title: 'Profile Ingestion',
    body: 'Drop in a Sierra Chart VbP / Delta export and Gekko parses value areas, POC, and naked levels into a structured session map.',
  },
]

const levels = [
  { value: '21,418.50', label: 'Overnight High', tone: 'ink' },
  { value: '21,376.25', label: 'Point of Control', tone: 'blue' },
  { value: '21,344.75', label: 'Value Area Low', tone: 'ink' },
  { value: '21,302.00', label: 'Naked Level — Breached', tone: 'red' },
]

const toneClass: Record<string, string> = {
  ink: 'text-ink',
  blue: 'text-bmw-blue',
  red: 'text-m-red',
}

export default function Home() {
  return (
    <>
      <TopNav />
      <MStripe className="mx-auto max-w-[1440px]" />

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="border-b border-hairline">
          <div className="mx-auto grid max-w-[1440px] gap-16 px-6 py-24 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
                Advisory Only · Live Session
              </span>
              <h1 className="mt-6 text-5xl font-bold uppercase leading-none tracking-[-0.5px] text-ink sm:text-7xl lg:text-[80px]">
                Trade the
                <br />
                Levels, Not
                <br />
                the Noise.
              </h1>
              <p className="mt-8 max-w-md text-base font-light leading-relaxed text-body">
                Gekko turns the manual NQ-futures Gem into a scheduled and proximity-triggered
                briefing system. Structured reads on volume, delta, and key levels — delivered the
                moment they matter.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button>Start Briefing</Button>
                <Button variant="outline">View Method</Button>
              </div>
            </div>

            {/* Session snapshot panel — surface card with bmw-blue voltage */}
            <div className="border border-hairline bg-surface-card p-6">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <span className="text-sm font-bold uppercase tracking-[1.5px] text-ink">
                  NQ · Session Snapshot
                </span>
                <span className="text-xs font-light uppercase tracking-wide text-success">
                  ● Live
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-hairline">
                {levels.map((lvl) => (
                  <div key={lvl.label} className="bg-surface-card p-4">
                    <p className={`text-2xl font-bold tracking-tight ${toneClass[lvl.tone]}`}>
                      {lvl.value}
                    </p>
                    <p className="mt-1 text-xs font-light uppercase tracking-wide text-muted">
                      {lvl.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stat band — bmw-blue number callouts */}
        <section className="border-b border-hairline bg-surface-soft">
          <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-8 px-6 py-16 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-bold tracking-tight text-bmw-blue lg:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-xs font-light uppercase tracking-wide text-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Significant-UI callout — m-red secondary accent */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-[1440px] px-6 py-12">
            <div className="flex flex-col gap-4 border-l-4 border-m-red bg-surface-card p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-m-red">
                  Critical Level Breach
                </span>
                <p className="mt-2 text-lg font-light text-body-strong">
                  Price has traded through the naked level at{' '}
                  <span className="font-bold text-ink">21,302.00</span> — bias review recommended.
                </p>
              </div>
              <Button variant="outline" className="shrink-0">
                Open Briefing
              </Button>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-[1440px] px-6 py-24">
            <h2 className="max-w-2xl text-4xl font-bold uppercase leading-tight tracking-tight text-ink">
              One System. Every Read.
            </h2>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="bg-surface-card p-6">
                  <span className="text-xs font-bold uppercase tracking-[1.5px] text-bmw-blue">
                    {feature.tag}
                  </span>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-4 text-sm font-light leading-relaxed text-body">
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band — bmw-blue primary action */}
        <section className="border-b border-hairline">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-8 px-6 py-20 text-center">
            <h2 className="max-w-3xl text-4xl font-bold uppercase leading-tight tracking-tight text-ink sm:text-5xl">
              Your Next Session Starts With a Briefing.
            </h2>
            <p className="max-w-xl text-base font-light text-body">
              Wire up your levels once. Gekko handles the watching, the parsing, and the timing.
            </p>
            <Button>Open Terminal</Button>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
