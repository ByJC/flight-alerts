import type { AccountConfig } from '../main/types';
import { ColorPicker } from './ColorPicker';
import { IconPicker } from './IconPicker';

export function AccountRow({
  account, onChange, onRemove, onTest,
}: {
  account: AccountConfig;
  onChange: (next: AccountConfig) => void;
  onRemove: () => void;
  onTest: () => void;
}) {
  return (
    <div className="account-row">
      <ColorPicker value={account.color} onChange={(c) => onChange({ ...account, color: c })} />
      <IconPicker value={account.icon} onChange={(icon) => onChange({ ...account, icon })} />
      <span className="email">{account.email}</span>
      <span className="status-ok" title="Healthy" />
      <label>
        <input
          type="checkbox"
          checked={account.enabled}
          onChange={(e) => onChange({ ...account, enabled: e.target.checked })}
        />
        Enabled
      </label>
      <button onClick={onTest}>Test</button>
      <button onClick={onRemove}>Remove</button>
    </div>
  );
}
