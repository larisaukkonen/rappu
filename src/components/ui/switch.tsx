
import React from 'react'
import { cn } from '@/lib/utils'

export function Switch({ id, checked, onCheckedChange }: { id?: string, checked?: boolean, onCheckedChange?: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className={cn('relative inline-flex h-6 w-11 items-center')}>
      <input id={id} type="checkbox" checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} className="peer sr-only" />
      <span className="absolute inset-0 rounded-full bg-zinc-300 peer-checked:bg-black transition-colors" />
      <span className="relative left-1 inline-block h-4 w-4 rounded-full bg-white transition-all peer-checked:translate-x-5" />
    </label>
  )
}
