import { useRef, useState } from 'react';
import type { AccountIcon } from '../main/types';
import { MAX_ICON_BYTES, dataUriByteSize } from '../main/icon';
import { fileToIconDataUri } from './downscale';

const EMOJIS = ['✈️', '🚀', '🚁', '🚂', '🚗', '🚲', '⛵', '🛸', '🚕', '🛵', '🏍️', '🚌'];

export function IconPicker({ value, onChange }: { value: AccountIcon; onChange: (icon: AccountIcon) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const uri = await fileToIconDataUri(file);
      if (dataUriByteSize(uri) > MAX_ICON_BYTES) {
        setError('Image too large — pick a smaller one.');
        return;
      }
      onChange({ type: 'image', value: uri });
      setOpen(false);
    } catch {
      setError('Could not read that image.');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="icon-trigger" onClick={() => { if (!open) setError(null); setOpen((o) => !o); }} aria-label="Choose icon">
        {value.type === 'image' ? <img src={value.value} alt="" /> : <span>{value.value}</span>}
      </button>
      {open && (
        <div className="icon-popover" style={{ position: 'absolute', top: 32, left: 0, zIndex: 10 }}>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                className={value.type === 'emoji' && value.value === e ? 'selected' : ''}
                onClick={() => { onChange({ type: 'emoji', value: e }); setOpen(false); }}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            className="emoji-input"
            type="text"
            maxLength={32}
            placeholder="Or type an emoji"
            onKeyDown={(ev) => {
              if (ev.key !== 'Enter') return;
              const v = (ev.target as HTMLInputElement).value.trim();
              if (v) { onChange({ type: 'emoji', value: v }); setOpen(false); }
            }}
          />
          <button type="button" className="upload-btn" onClick={() => fileRef.current?.click()}>
            Upload image…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) handleFile(f);
              ev.target.value = '';
            }}
          />
          {error && <p className="icon-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
