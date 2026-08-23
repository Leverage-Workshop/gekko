import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeBranch, fetchBase, resolveBase, resolveCompanionScript } from '@/lib/codex-gate'

describe('git helpers (real repo)', () => {
  let dir: string
  const run = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    }).trim()

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'codex-gate-'))
    run('init', '-q', '-b', 'main')
    run('config', 'user.email', 'test@example.com')
    run('config', 'user.name', 'Test')
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    run('add', 'a.txt')
    run('commit', '-q', '-m', 'root')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('resolveBase honors an explicit ref, else origin/main, else main', () => {
    expect(resolveBase(dir, 'develop')).toBe('develop')
    expect(resolveBase(dir)).toBe('main')
    run('update-ref', 'refs/remotes/origin/main', 'main')
    expect(resolveBase(dir)).toBe('origin/main')
  })

  it('describeBranch reports head == mergeBase on a fresh branch and diverges after a commit', () => {
    run('checkout', '-q', '-b', 'feat-x')
    const fresh = describeBranch(dir, 'origin/main')
    expect(fresh.branch).toBe('feat-x')
    expect(fresh.head).toBe(fresh.mergeBase)
    expect(fresh.baseSha).toBe(run('rev-parse', 'origin/main'))
    writeFileSync(join(dir, 'b.txt'), 'b\n')
    run('add', 'b.txt')
    run('commit', '-q', '-m', 'feature')
    const after = describeBranch(dir, 'origin/main')
    expect(after.head).not.toBe(after.mergeBase)
    expect(after.mergeBase).toBe(run('rev-parse', 'origin/main'))
  })

  it('fetchBase is a no-op without a remote URL and refreshes a stale tracking ref with one', () => {
    expect(fetchBase(dir, 'origin/main')).toEqual({ fetched: false, error: null })
    const upstream = mkdtempSync(join(tmpdir(), 'codex-gate-upstream-'))
    try {
      execFileSync('git', ['clone', '-q', '--bare', dir, upstream])
      run('config', 'remote.origin.url', upstream)
      execFileSync('git', [
        '-C',
        upstream,
        'update-ref',
        'refs/heads/main',
        run('rev-parse', 'feat-x'),
      ])
      expect(fetchBase(dir, 'origin/main')).toEqual({ fetched: true, error: null })
      expect(run('rev-parse', 'origin/main')).toBe(run('rev-parse', 'feat-x'))
      run('config', 'remote.origin.url', join(upstream, 'missing'))
      expect(fetchBase(dir, 'origin/main').error).toBeTruthy()
    } finally {
      rmSync(upstream, { recursive: true, force: true })
    }
  })
})

describe('resolveCompanionScript', () => {
  const registry = { plugins: { 'codex@openai-codex': [{ installPath: '/plugins/codex/1.0.6' }] } }
  const companion = join('/plugins/codex/1.0.6', 'scripts', 'codex-companion.mjs')

  it('prefers CODEX_PLUGIN_ROOT, else the Claude plugin registry', () => {
    expect(
      resolveCompanionScript({
        env: { CODEX_PLUGIN_ROOT: '/custom' },
        homeDir: '/home/u',
        exists: (p) => p === join('/custom', 'scripts', 'codex-companion.mjs'),
        readJson: () => registry,
      })
    ).toMatchObject({ ok: true, root: '/custom' })
    expect(
      resolveCompanionScript({
        env: {},
        homeDir: '/home/u',
        exists: (p) => p === '/home/u/.claude/plugins/installed_plugins.json' || p === companion,
        readJson: () => registry,
      })
    ).toEqual({ ok: true, path: companion, root: '/plugins/codex/1.0.6' })
  })

  it('fails with a reason when the plugin is missing', () => {
    const r = resolveCompanionScript({
      env: {},
      homeDir: '/home/u',
      exists: () => true,
      readJson: () => ({ plugins: {} }),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/not installed/)
  })
})
