import React from 'react'

export default function GenreChipRow({ items, active, onChange }) {
  return (
    <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`px-4 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-all font-display ${
            active === item.id
              ? 'bg-accent text-black'
              : 'bg-paper-3 text-neutral2 hover:text-ink'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
