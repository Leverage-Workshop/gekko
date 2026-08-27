import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_VERSIONS,
  DASHBOARD_VERSION_STORAGE_KEY,
  DEFAULT_DASHBOARD_VERSION,
  DashboardVersionPicker,
  DashboardVersionProvider,
  VersionPane,
  parseDashboardVersion,
} from '@/app/components/dashboard-version'

/**
 * The header version picker (feat-129): Gekko | Job, default Gekko,
 * localStorage-backed. Both panes are server-rendered under one visibility
 * toggle — the structural reason switching never re-fetches the briefing;
 * the live switch is exercised in headless Chromium (progress.md).
 */

describe('parseDashboardVersion', () => {
  it('accepts the two versions and falls back to Gekko for anything else', () => {
    expect(parseDashboardVersion('job')).toBe('job')
    expect(parseDashboardVersion('gekko')).toBe('gekko')
    expect(parseDashboardVersion('JOB')).toBe('gekko')
    expect(parseDashboardVersion(null)).toBe('gekko')
    expect(parseDashboardVersion(undefined)).toBe('gekko')
    expect(parseDashboardVersion(42)).toBe('gekko')
    expect(DEFAULT_DASHBOARD_VERSION).toBe('gekko')
    expect(DASHBOARD_VERSIONS.map((v) => v.label)).toEqual(['Gekko', 'Job'])
    expect(DASHBOARD_VERSION_STORAGE_KEY).toMatch(/version/)
  })
})

describe('server frame', () => {
  it('renders BOTH panes with Gekko visible and Job hidden, the picker pressed on Gekko', () => {
    const html = renderToStaticMarkup(
      h(
        DashboardVersionProvider,
        null,
        h(DashboardVersionPicker),
        h(VersionPane, { version: 'gekko', children: h('p', null, 'briefing pane') }),
        h(VersionPane, { version: 'job', children: h('p', null, 'job pane') })
      )
    )
    expect(html).toContain('briefing pane')
    expect(html).toContain('job pane')
    expect(html).toMatch(/<div data-version-pane="gekko"[^>]*>/)
    expect(html).not.toMatch(/<div hidden="" data-version-pane="gekko"/)
    expect(html).toMatch(/<div hidden="" data-version-pane="job"/)
    expect(html).toMatch(/aria-pressed="true" data-version="gekko"/)
    expect(html).toMatch(/aria-pressed="false" data-version="job"/)
  })
})
