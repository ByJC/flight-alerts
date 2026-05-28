import { useState } from 'react';

const PALETTE = ['#a78bfa','#34d399','#fb7185','#fbbf24','#60a5fa','#f472b6','#22d3ee','#a3e635','#fb923c','#c084fc','#4ade80','#f87171'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="swatch"
        style={{ background: value }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose color"
      />
      {open && (
        <div className="picker" style={{ position: 'absolute', top: 32, left: 0, zIndex: 10 }}>
          {PALETTE.map((c) => (
            <div
              key={c}
              className={`swatch ${c === value ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
