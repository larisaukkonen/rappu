import * as React from 'react'

type Props = {
  id?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}
export function Switch({ id, checked, onCheckedChange }: Props) {
  return (
    <label htmlFor={id} style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}}>
      <input id={id} type="checkbox" checked={checked} onChange={(e)=>onCheckedChange(e.target.checked)} style={{display:'none'}} />
      <span style={{width:38,height:22,background: checked ? '#16a34a' : '#e5e7eb',borderRadius:999,position:'relative',transition:'all .15s'}}>
        <span style={{position:'absolute',top:3,left: checked ? 18 : 3,width:16,height:16,background:'#fff',borderRadius:999,transition:'all .15s',boxShadow:'0 1px 2px rgba(0,0,0,.2)'}}/>
      </span>
    </label>
  )
}
