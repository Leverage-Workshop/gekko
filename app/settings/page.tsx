import type { Metadata } from 'next'
import { fetchConfigPresets, fetchConfigRow, toConfigUpdate } from '@/lib/config'
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
 * Also loads the saved presets (feat-155), tolerating a live DB that predates
 * the config_presets table the same way.
 */

// Always render at request time: reads the live DB, never prerendered.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gekko — Settings',
  description: 'Runtime configuration for the Gekko briefing engine.',
}

export default async function SettingsPage() {
  const supabase = getServiceClient()
  const {
    row,
    highConvictionColumnsMissing,
    effortColumnsMissing,
    barVolumeColumnMissing,
    significantMoveColumnMissing,
    profileVisionColumnsMissing,
  } = await fetchConfigRow(supabase)
  const { presets, tableMissing: presetsTableMissing } = await fetchConfigPresets(supabase)

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
            Runtime configuration for the briefing engine — the briefing model
            and the Job planner&rsquo;s profile-vision read. Edits write the
            singleton config row and apply from the next briefing or Job plan run.
            Presets are named snapshots you can switch between: pick one, then Save
            Settings to make it live.
          </p>
        </header>

        {row ? (
          <section className="mt-10 max-w-2xl border border-hairline bg-surface-card p-8">
            <SettingsForm
              initial={toConfigUpdate(row)}
              updatedAt={row.updated_at}
              presets={presets}
              presetsTableMissing={presetsTableMissing}
              highConvictionColumnsMissing={highConvictionColumnsMissing}
              effortColumnsMissing={effortColumnsMissing}
              barVolumeColumnMissing={barVolumeColumnMissing}
              significantMoveColumnMissing={significantMoveColumnMissing}
              profileVisionColumnsMissing={profileVisionColumnsMissing}
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
