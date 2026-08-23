import { join } from 'node:path'

// Locates the Codex Companion plugin's CLI (`scripts/codex-companion.mjs`).
// Order: explicit CODEX_PLUGIN_ROOT, then Claude Code's installed-plugins
// registry. Nothing is hardcoded to a plugin version.

export const PLUGIN_KEY = 'codex@openai-codex'
export const COMPANION_RELATIVE_PATH = join('scripts', 'codex-companion.mjs')

export interface ResolveDeps {
  env: Record<string, string | undefined>
  homeDir: string
  exists: (path: string) => boolean
  readJson: (path: string) => unknown
}

export type CompanionResolution =
  | { ok: true; path: string; root: string }
  | { ok: false; reason: string }

const INSTALL_HINT =
  'Install the Codex plugin in Claude Code (`/plugin install codex@openai-codex`) or set CODEX_PLUGIN_ROOT to its directory.'

export function resolveCompanionScript(deps: ResolveDeps): CompanionResolution {
  const explicitRoot = deps.env.CODEX_PLUGIN_ROOT?.trim()
  if (explicitRoot) {
    const candidate = join(explicitRoot, COMPANION_RELATIVE_PATH)
    return deps.exists(candidate)
      ? { ok: true, path: candidate, root: explicitRoot }
      : {
          ok: false,
          reason: `CODEX_PLUGIN_ROOT=${explicitRoot} has no ${COMPANION_RELATIVE_PATH}.`,
        }
  }

  const registryPath = join(deps.homeDir, '.claude', 'plugins', 'installed_plugins.json')
  if (!deps.exists(registryPath)) {
    return { ok: false, reason: `No Claude plugin registry at ${registryPath}. ${INSTALL_HINT}` }
  }

  let registry: unknown
  try {
    registry = deps.readJson(registryPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: `Could not read ${registryPath}: ${message}` }
  }

  const root = installPathFromRegistry(registry)
  if (!root) {
    return { ok: false, reason: `${PLUGIN_KEY} is not installed. ${INSTALL_HINT}` }
  }
  const candidate = join(root, COMPANION_RELATIVE_PATH)
  return deps.exists(candidate)
    ? { ok: true, path: candidate, root }
    : {
        ok: false,
        reason: `${PLUGIN_KEY} is registered at ${root} but ${COMPANION_RELATIVE_PATH} is missing.`,
      }
}

function installPathFromRegistry(registry: unknown): string | null {
  if (typeof registry !== 'object' || registry === null) return null
  const plugins = (registry as { plugins?: unknown }).plugins
  if (typeof plugins !== 'object' || plugins === null) return null
  const entries = (plugins as Record<string, unknown>)[PLUGIN_KEY]
  if (!Array.isArray(entries)) return null
  for (const entry of entries) {
    if (typeof entry === 'object' && entry !== null) {
      const installPath = (entry as { installPath?: unknown }).installPath
      if (typeof installPath === 'string' && installPath.length > 0) return installPath
    }
  }
  return null
}
