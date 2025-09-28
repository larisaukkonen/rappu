import * as React from 'react'
import { cn } from '@/lib/utils'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant='default', size='md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none rounded-md'
    const variants = variant === 'secondary'
      ? 'bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-100'
      : 'bg-neutral-900 text-white hover:bg-neutral-800'
    const sizes = size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-11 px-6' : 'h-9 px-4'
    return <button ref={ref} className={cn(base, variants, sizes, className)} {...props} />
  }
)
Button.displayName = 'Button'
