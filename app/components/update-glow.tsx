'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Wraps server-rendered content and pulses a bmw-blue border glow for ~2s
 * whenever `updateKey` changes after mount. Client state survives
 * `router.refresh()`, so when a trigger run completes and the dashboard
 * re-renders with a new briefing/eval row id, the changed card visibly
 * announces itself. The initial render never glows, and the animation is
 * suppressed under prefers-reduced-motion (see globals.css).
 */
export function UpdateGlow({
  updateKey,
  children,
}: {
  updateKey: string
  children: ReactNode
}) {
  const [glowing, setGlowing] = useState(false)
  const prevKey = useRef(updateKey)

  useEffect(() => {
    if (prevKey.current === updateKey) return
    prevKey.current = updateKey
    setGlowing(true)
    const timer = setTimeout(() => setGlowing(false), 2200)
    return () => clearTimeout(timer)
  }, [updateKey])

  return <div className={glowing ? 'animate-update-glow' : undefined}>{children}</div>
}
