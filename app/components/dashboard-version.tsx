'use client'

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { z } from 'zod'

/**
 * Header version picker (feat-129, docs/job-planning-task-plan.md operator
 * decision 6): `Gekko` | `Job` switches the dashboard between the existing
 * briefing view and the Job plan view. Both panes are SERVER-RENDERED into
 * the page; this island only owns which one is visible, so switching never
 * re-fetches the briefing. The choice persists in localStorage; the default
 * (and the SSR frame) is Gekko, so the briefing view's behavior is unchanged.
 */

export const DASHBOARD_VERSIONS = [
  { id: 'gekko', label: 'Gekko' },
  { id: 'job', label: 'Job' },
] as const

export type DashboardVersion = (typeof DASHBOARD_VERSIONS)[number]['id']

export const DEFAULT_DASHBOARD_VERSION: DashboardVersion = 'gekko'
export const DASHBOARD_VERSION_STORAGE_KEY = 'gekko.dashboard.version'

const DashboardVersionSchema = z.enum(['gekko', 'job'])

/** A stored value → a version; anything unknown falls back to the default. */
export function parseDashboardVersion(value: unknown): DashboardVersion {
  const parsed = DashboardVersionSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_DASHBOARD_VERSION
}

function readStoredVersion(): DashboardVersion {
  try {
    return parseDashboardVersion(window.localStorage.getItem(DASHBOARD_VERSION_STORAGE_KEY))
  } catch {
    return DEFAULT_DASHBOARD_VERSION
  }
}

// localStorage as an external store (useSyncExternalStore): the server
// snapshot is the default, so SSR and hydration render the Gekko view, then
// the client snapshot adopts the stored choice. Same-tab writes notify the
// listeners below; other tabs arrive through the `storage` event.
const listeners = new Set<() => void>()

/** Where the choice lives when localStorage refuses writes (private mode, quota). */
let fallback: DashboardVersion | null = null

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function storeVersion(version: DashboardVersion): void {
  try {
    window.localStorage.setItem(DASHBOARD_VERSION_STORAGE_KEY, version)
    // Storage is authoritative again: a fallback left by an earlier failed
    // write would otherwise pin the snapshot for the page's lifetime.
    fallback = null
  } catch {
    // The choice then lasts this page's lifetime.
    fallback = version
  }
  listeners.forEach((listener) => listener())
}

function getSnapshot(): DashboardVersion {
  return fallback ?? readStoredVersion()
}

const getServerSnapshot = (): DashboardVersion => DEFAULT_DASHBOARD_VERSION

type VersionContext = {
  version: DashboardVersion
  setVersion: (version: DashboardVersion) => void
}

const Context = createContext<VersionContext>({
  version: DEFAULT_DASHBOARD_VERSION,
  setVersion: () => undefined,
})

export function DashboardVersionProvider({ children }: { children: ReactNode }) {
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return (
    <Context.Provider value={{ version, setVersion: storeVersion }}>{children}</Context.Provider>
  )
}

/** The segmented control in the top nav: category-tab styling, active = ink + bmw-blue underline. */
export function DashboardVersionPicker() {
  const { version, setVersion } = useContext(Context)
  return (
    <div className="flex items-center" role="group" aria-label="Dashboard version">
      {DASHBOARD_VERSIONS.map((option) => {
        const active = option.id === version
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            data-version={option.id}
            onClick={() => setVersion(option.id)}
            className={`border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-[1.5px] transition-colors ${
              active ? 'border-bmw-blue text-ink' : 'border-transparent text-muted hover:text-body'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** One server-rendered pane; hidden (not unmounted) when another version is active. */
export function VersionPane({
  version,
  children,
}: {
  version: DashboardVersion
  children: ReactNode
}) {
  const active = useContext(Context).version === version
  return (
    <div hidden={!active} data-version-pane={version} className="flex flex-1 flex-col">
      {children}
    </div>
  )
}
