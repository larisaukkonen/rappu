import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('h-9 w-full rounded-md border border-neutral-300 px-3 outline-none focus:ring-2 focus:ring-neutral-300', className)} {...props} />
  )
)
Input.displayName = 'Input'
