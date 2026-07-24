import type { ComponentPropsWithoutRef } from 'react'

// DESIGN.md buttons: rounded-none, uppercase, 14px / 700 / 1.5px tracking, 48px tall.
// - primary    → solid bmw-blue fill, white label (the single brand-color CTA)
// - outline    → transparent + white outline (the secondary action)
// - accent     → transparent + bmw-blue outline/label (accent-toned secondary action)
// - red-accent → transparent + m-red outline/label — the direction language:
//   long actions read bmw-blue, short actions read m-red (like the objective
//   cards), so this is for short-direction triggers, not destructive actions.
type Variant = 'primary' | 'outline' | 'accent' | 'red-accent'
type Size = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center font-bold uppercase tracking-[1.5px] transition-colors rounded-none disabled:pointer-events-none disabled:opacity-40'

const sizes: Record<Size, string> = {
  md: 'h-12 px-8 text-sm',
  sm: 'h-9 px-4 text-xs',
}

const variants: Record<Variant, string> = {
  primary: 'bg-bmw-blue text-ink hover:bg-electric-blue',
  outline: 'border border-ink text-ink hover:bg-ink hover:text-canvas',
  accent: 'border border-bmw-blue text-bmw-blue hover:bg-bmw-blue hover:text-ink',
  'red-accent': 'border border-m-red text-m-red hover:bg-m-red hover:text-ink',
}

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: Variant
  size?: Size
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
