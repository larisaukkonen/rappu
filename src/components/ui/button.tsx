
import React from 'react'
import { cn } from '@/lib/utils'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant='default', size='md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none'
    const variants = {
      default: 'bg-black text-white hover:bg-zinc-800',
      secondary: 'bg-white text-black border border-zinc-300 hover:bg-zinc-100'
    }
    const sizes = {
      sm: 'h-8 px-2 text-sm',
      md: 'h-9 px-3 text-sm',
      lg: 'h-10 px-4'
    }
    return <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
  }
)
Button.displayName = 'Button'
