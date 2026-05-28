import { useEffect, useState } from 'react';
import './settings.css';
import type { Config, AccountConfig } from '../main/types';
import { AccountRow } from './AccountRow';

export function App() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => { window.flightAlerts.getConfig().then(setConfig); }, []);

  if (!config) return <p>Loading…</p>;

  const update = (next: Config) => {
    setConfig(next);
    window.flightAlerts.updateConfig(next);
  };

  const updateAccount = (email: string, patch: Partial<AccountConfig>) => {
    update({
      ...config,
      accounts: config.accounts.map((a) => (a.email === email ? { ...a, ...patch } : a)),
    });
  };

  const removeAccount = async (email: string) => {
    if (!confirm(`Remove ${email}?`)) return;
    await window.flightAlerts.removeAccount(email);
    const fresh = await window.flightAlerts.getConfig();
    setConfig(fresh);
  };

  const addAccount = async () => {
    try {
      await window.flightAlerts.addAccount();
      const fresh = await window.flightAlerts.getConfig();
      setConfig(fresh);
    } catch (e: any) {
      alert(`Failed to add account: ${e?.message ?? e}`);
    }
  };

  return (
    <main>
      <h1>Flight Alerts</h1>

      <h2>Accounts</h2>
      {config.accounts.map((a) => (
        <AccountRow
          key={a.email}
          account={a}
          onChange={(next) => updateAccount(a.email, next)}
          onRemove={() => removeAccount(a.email)}
          onTest={() => window.flightAlerts.testPlane(a.email)}
        />
      ))}
      <button className="primary" onClick={addAccount}>+ Add Google account</button>

      <h2>Preferences</h2>
      <div className="controls">
        <label>
          Warn me{' '}
          <select
            value={config.delayMinutes}
            onChange={(e) => update({ ...config, delayMinutes: Number(e.target.value) })}
          >
            {[1, 2, 5, 10, 15].map((n) => <option key={n} value={n}>{n} minutes</option>)}
          </select>{' '}
          before each event
        </label>
        <label>
          Dismiss plane after{' '}
          <select
            value={config.dismissSeconds}
            onChange={(e) => update({ ...config, dismissSeconds: Number(e.target.value) })}
          >
            {[10, 20, 30, 60, 120].map((n) => <option key={n} value={n}>{n}s</option>)}
          </select>
        </label>
        <label>
          Plane size{' '}
          <select
            value={config.planeSize}
            onChange={(e) => update({ ...config, planeSize: e.target.value as 'small' | 'medium' | 'large' })}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.autostart}
            onChange={(e) => update({ ...config, autostart: e.target.checked })}
          />{' '}
          Launch at login
        </label>
      </div>
    </main>
  );
}
