import type { Metadata } from 'next'
import { fetchConfigRow } from '@/lib/config'
import { getServiceClient } from '@/lib/supabase/server'
import { Footer } from '../components/footer'
import { MStripe } from '../components/m-stripe'
import { SettingsForm } from '../components/settings-form'
import { TopNav } from '../components/top-nav'

/**
 * /settings — Config UI (feat-028). Server component shell that loads the
 * config row via the service client (tolerating a live DB that predates the
 * high_conviction_flag migration, exactly like lib/analyze/deps.ts) and hands
 * the current values to the client-side form, which POSTs /api/config.
 */

// Always render at request time: reads the live DB, never prerendered.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gekko — Settings',
  description: 'Runtime configuration for the Gekko briefing engine.',
}

export default async function SettingsPage() {
  const { row, highConvictionColumnsMissing } = await fetchConfigRow(getServiceClient())

  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-12">
        <header>
          <span className="text-xs font-bold uppercase tracking-[1.5px] text-bmw-blue">
            Configuration
          </span>
          <h1 className="mt-2 text-3xl font-bold uppercase tracking-tight text-ink md:text-4xl">
            Settings
          </h1>
          <MStripe className="mt-4 w-24" />
          <p className="mt-4 max-w-2xl text-sm font-light leading-relaxed text-body">
            Runtime configuration for the briefing engine — model routing and the
            risk/reward gate. Edits write the singleton config row and apply from
            the next briefing or eval run.
          </p>
        </header>

        {row ? (
          <section className="mt-10 max-w-2xl border border-hairline bg-surface-card p-8">
            <SettingsForm
              initial={{
                model_id: row.model_id,
                triage_model_id: row.triage_model_id,
                rr_min: row.rr_min,
                high_conviction_enabled: row.high_conviction_enabled,
                high_conviction_model_id: row.high_conviction_model_id,
              }}
              updatedAt={row.updated_at}
              highConvictionColumnsMissing={highConvictionColumnsMissing}
            />
          </section>
        ) : (
          <p className="mt-10 max-w-2xl text-sm font-light tracking-wide text-m-red">
            Config row (id=1) is missing — apply the seed_config migration to the
            Supabase project, then reload this page.
          </p>
        )}
      </main>
      <Footer />
    </>
  )
}
