import type { ComponentPropsWithoutRef } from 'react'

// DESIGN.md buttons: rounded-none, uppercase, 14px / 700 / 1.5px tracking, 48px tall.
// - primary  → solid bmw-blue fill, white label (the single brand-color CTA)
// - outline  → transparent + white outline (the secondary action)
type Variant = 'primary' | 'outline'

const base =
  'inline-flex h-12 items-center justify-center px-8 text-sm font-bold uppercase tracking-[1.5px] transition-colors rounded-none'

const variants: Record<Variant, string> = {
  primary: 'bg-bmw-blue text-ink hover:bg-electric-blue',
  outline: 'border border-ink text-ink hover:bg-ink hover:text-canvas',
}

type ButtonProps = ComponentPropsWithoutRef<'button'> & { variant?: Variant }

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
