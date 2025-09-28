import * as React from 'react'
import { cn } from '@/lib/utils'

type DialogRootProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  children: React.ReactNode
}
export function Dialog({ open, onOpenChange, children }: DialogRootProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={()=>onOpenChange(false)} />
      <div className="relative mx-auto mt-24 max-w-lg rounded-xl bg-white text-neutral-900 shadow-lg">{children}</div>
    </div>
  )
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-2', className)} {...props} />
}
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex justify-end gap-2', className)} {...props} />
}
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />
}
