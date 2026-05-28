import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';

export interface TrayHandlers {
  openSettings: () => void;
  togglePause: () => boolean;
  isPaused: () => boolean;
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(join(__dirname, '../../assets/trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Flight Alerts');
  // Until a real trayTemplate.png is shipped, show a glyph so the icon is visible in the menubar.
  if (icon.isEmpty()) tray.setTitle('✈');

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Settings…', click: handlers.openSettings },
      { type: 'separator' },
      {
        label: handlers.isPaused() ? 'Resume notifications' : 'Pause notifications',
        click: () => { handlers.togglePause(); rebuild(); },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };
  rebuild();
  return tray;
}
