import { execFileSync } from 'node:child_process'

export function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function refExists(cwd: string, ref: string): boolean {
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

export const DEFAULT_BASE_CANDIDATES: readonly string[] = ['origin/main', 'main']

// The integration target: the remote-tracking ref when it exists (what a PR
// actually merges into), else local main.
export function resolveBase(cwd: string, requested?: string): string {
  if (requested?.trim()) return requested.trim()
  for (const candidate of DEFAULT_BASE_CANDIDATES) {
    if (refExists(cwd, candidate)) return candidate
  }
  throw new Error(
    `None of ${DEFAULT_BASE_CANDIDATES.join(', ')} exist here; pass --base <ref> or set CODEX_GATE_BASE.`
  )
}

// `origin/main` → refresh it from the remote so the review is against the
// current tip, not a stale fetch. Best effort: a failure is reported, not fatal.
export function fetchBase(cwd: string, base: string): { fetched: boolean; error: string | null } {
  const slash = base.indexOf('/')
  if (slash === -1) return { fetched: false, error: null }
  const remote = base.slice(0, slash)
  const branch = base.slice(slash + 1)
  try {
    if (!git(cwd, ['config', '--get', `remote.${remote}.url`]))
      return { fetched: false, error: null }
  } catch {
    return { fetched: false, error: null }
  }
  try {
    // Explicit refspec: update the tracking ref even when remote.<name>.fetch
    // is not configured (a bare `fetch <remote> <branch>` only sets FETCH_HEAD).
    execFileSync(
      'git',
      ['fetch', '--quiet', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      }
    )
    return { fetched: true, error: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { fetched: false, error: detail.split('\n')[0] ?? detail }
  }
}

export interface BranchContext {
  root: string
  branch: string
  head: string
  base: string
  baseSha: string
  mergeBase: string
}

export function describeBranch(cwd: string, base: string): BranchContext {
  const root = git(cwd, ['rev-parse', '--show-toplevel'])
  return {
    root,
    branch: git(root, ['branch', '--show-current']) || 'HEAD',
    head: git(root, ['rev-parse', 'HEAD']),
    base,
    baseSha: git(root, ['rev-parse', `${base}^{commit}`]),
    mergeBase: git(root, ['merge-base', 'HEAD', base]),
  }
}

export function isWorkingTreeDirty(cwd: string): boolean {
  return git(cwd, ['status', '--porcelain', '--untracked-files=all']).length > 0
}
