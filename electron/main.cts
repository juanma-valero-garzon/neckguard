import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  ipcMain,
  nativeImage,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  session,
  shell,
  systemPreferences,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  APP_HOST,
  APP_ORIGIN,
  CSP,
  MIME,
  clampOverlayMs,
  isTrustedUrl,
  resolveInside,
  trayIconFor,
  validNotify,
  validStorageKey,
  validStorageValue,
  validTrayCommand,
  validTraySnapshot,
  type TraySnapshot,
} from './validate.cjs';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const DIST = path.join(app.getAppPath(), 'dist');
const ASSETS = path.join(app.getAppPath(), 'assets');
const PRELOAD = path.join(__dirname, 'preload.cjs');

let mainWindow: BrowserWindow | null = null;
let popover: BrowserWindow | null = null;
let mini: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let overlayTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
let quitting = false;
let powerBlocker: number | null = null;
let lastSnapshot: TraySnapshot | null = null;
let lastTray = '';

const webPreferences = {
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  backgroundThrottling: false, // la ventana procesa vídeo aunque esté oculta o minimizada
  autoplayPolicy: 'no-user-gesture-required', // los avisos sonoros deben poder sonar sin gesto previo
  spellcheck: false,
} as const;

function lockDown(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
}

// ---------- protocolo propio ----------
function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('forbidden', { status: 403 });
    const file = resolveInside(DIST, url.pathname, path.join, path.sep);
    if (!file) return new Response('forbidden', { status: 403 });
    try {
      // fs (compatible con asar) en lugar de net.fetch: la petición file:// la cancelaría el bloqueo de red.
      const data = await fs.promises.readFile(file);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (!missing) console.error('app:// error', err);
      return new Response(missing ? 'not found' : 'error', { status: missing ? 404 : 500 });
    }
  });
}

function registerPermissions(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
    const video =
      permission === 'media' &&
      (details as { mediaTypes?: string[] }).mediaTypes?.every((t) => t === 'video') === true;
    cb(isTrustedUrl(details.requestingUrl) && video);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => permission === 'media' && isTrustedUrl(origin));
  // Sin red en ejecución: solo se admite el protocolo propio (y blob:/data: internos).
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = /^(app:|blob:|data:|devtools:|chrome-extension:)/.test(details.url);
    cb({ cancel: !ok });
  });
}

// ---------- ventanas ----------
function createMainWindow(showOnReady: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'NeckGuard',
    vibrancy: 'under-window',
    visualEffectState: 'followWindow',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    webPreferences,
  });
  lockDown(mainWindow);
  void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  mainWindow.once('ready-to-show', () => showOnReady && mainWindow?.show());
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); // sigue analizando en segundo plano desde la barra de menús
    mainWindow?.hide();
  });
}

function showMain(): void {
  if (mini && !mini.isDestroyed()) mini.hide();
  if (!mainWindow) createMainWindow(true);
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createPopover(): BrowserWindow {
  const win = new BrowserWindow({
    width: 288,
    height: 330,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    vibrancy: 'popover',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences,
  });
  lockDown(win);
  void win.loadURL(`${APP_ORIGIN}/index.html#/menubar`);
  win.on('blur', () => win.hide());
  win.webContents.on(
    'did-finish-load',
    () => lastSnapshot && win.webContents.send('tray:snapshot', lastSnapshot),
  );
  return win;
}

function togglePopover(): void {
  if (!tray) return;
  popover ??= createPopover();
  if (popover.isVisible()) {
    popover.hide();
    return;
  }
  const t = tray.getBounds();
  const w = popover.getBounds();
  const area = screen.getDisplayMatching(t).workArea;
  const x = Math.round(t.x + t.width / 2 - w.width / 2);
  const below = t.y + t.height + 4;
  // En Windows la bandeja suele estar abajo: el popover se abre hacia arriba.
  const y = below + w.height > area.y + area.height ? t.y - w.height - 4 : below;
  popover.setPosition(
    Math.min(Math.max(x, area.x + 4), area.x + area.width - w.width - 4),
    Math.max(y, area.y),
    false,
  );
  popover.show();
}

const MINI_SIZE = { width: 232, height: 262 };
// Descanso abierto: la miniatura muestra el ejercicio y sus acciones.
const MINI_BREAK_SIZE = { width: 300, height: 480 };
// Con hipervigilancia OFF solo se muestra el contador de tiempo sentado.
const MINI_HEIGHT_COMPACT = 120;

function createMini(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    ...MINI_SIZE,
    x: area.x + area.width - MINI_SIZE.width - 16,
    y: area.y + 16,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    // Panel: flota sobre otras apps (incluso a pantalla completa) sin activar NeckGuard al pulsarlo.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    vibrancy: 'hud',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences,
  });
  lockDown(win);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  void win.loadURL(`${APP_ORIGIN}/index.html#/mini`);
  win.webContents.on(
    'did-finish-load',
    () => lastSnapshot && win.webContents.send('tray:snapshot', lastSnapshot),
  );
  return win;
}

function setMiniMode(on: boolean): void {
  if (!on) {
    showMain();
    return;
  }
  if (!mini || mini.isDestroyed()) mini = createMini();
  mini.showInactive();
  mainWindow?.hide();
}

function showOverlay(ms: number): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!overlay || overlay.isDestroyed()) {
    overlay = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      focusable: false,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: { ...webPreferences, preload: undefined },
    });
    overlay.setIgnoreMouseEvents(true);
    overlay.setAlwaysOnTop(true, 'screen-saver');
    lockDown(overlay);
    void overlay.loadURL(`${APP_ORIGIN}/overlay.html`);
  } else {
    overlay.setBounds(display.bounds);
  }
  overlay.showInactive();
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => overlay?.hide(), ms);
}

// ---------- bandeja ----------
const trayImage = (name: string): Electron.NativeImage =>
  nativeImage.createFromPath(path.join(ASSETS, 'tray', `${name}.png`));

function createTray(): void {
  tray = new Tray(trayImage('off'));
  tray.setToolTip('NeckGuard');
  tray.on('click', togglePopover);
  tray.on('right-click', () =>
    tray?.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'NeckGuard', click: showMain },
        { type: 'separator' },
        { role: 'quit' },
      ]),
    ),
  );
}

function applyTrayUpdate(s: TraySnapshot): void {
  lastSnapshot = s;
  const icon = trayIconFor(s);
  const tip = s.mini?.hypervigilance === false ? 'NeckGuard' : `NeckGuard — ${s.labels.status}`;
  if (`${icon}|${tip}` !== lastTray) {
    lastTray = `${icon}|${tip}`;
    tray?.setImage(trayImage(icon));
    tray?.setToolTip(tip);
  }
  if (popover && !popover.isDestroyed()) popover.webContents.send('tray:snapshot', s);
  if (mini && !mini.isDestroyed() && mini.isVisible()) {
    const h = s.mini?.breakInfo
      ? MINI_BREAK_SIZE.height
      : s.mini?.hypervigilance === false
        ? MINI_HEIGHT_COMPACT
        : MINI_SIZE.height;
    const w = s.mini?.breakInfo ? MINI_BREAK_SIZE.width : MINI_SIZE.width;
    const b = mini.getBounds();
    if (b.width !== w || b.height !== h) {
      // El borde derecho se mantiene fijo para que la ventana no se salga de la pantalla.
      mini.setBounds({ x: b.x + b.width - w, y: b.y, width: w, height: h });
    }
    mini.webContents.send('tray:snapshot', s);
  }
  // Evita App Nap solo mientras se analiza activamente.
  const analysing = !s.paused && s.suppressed !== 'locked';
  if (analysing && powerBlocker === null) powerBlocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!analysing && powerBlocker !== null) {
    powerSaveBlocker.stop(powerBlocker);
    powerBlocker = null;
  }
}

// ---------- almacenamiento atómico ----------
const dataFile = (key: string): string => path.join(app.getPath('userData'), `${key}.json`);

function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// ---------- IPC ----------
const fromMain = (e: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  !!mainWindow && e.sender === mainWindow.webContents && isTrustedUrl(e.senderFrame?.url);
const fromPopover = (e: IpcMainEvent): boolean =>
  !!popover && e.sender === popover.webContents && isTrustedUrl(e.senderFrame?.url);
const fromMini = (e: IpcMainEvent): boolean =>
  !!mini && e.sender === mini.webContents && isTrustedUrl(e.senderFrame?.url);

function registerIpc(): void {
  ipcMain.handle('storage:get', (e, key: unknown) => {
    if (!fromMain(e) || !validStorageKey(key)) throw new Error('rechazado');
    try {
      return fs.readFileSync(dataFile(key), 'utf8');
    } catch {
      return null;
    }
  });
  ipcMain.handle('storage:set', (e, key: unknown, value: unknown) => {
    if (!fromMain(e) || !validStorageKey(key) || !validStorageValue(value)) throw new Error('rechazado');
    writeAtomic(dataFile(key), value);
  });
  ipcMain.handle('storage:remove', (e, key: unknown) => {
    if (!fromMain(e) || !validStorageKey(key)) throw new Error('rechazado');
    fs.rmSync(dataFile(key), { force: true });
  });

  ipcMain.handle('notify', (e, o: unknown) => {
    if (!fromMain(e) || !validNotify(o) || !Notification.isSupported()) return false;
    const n = new Notification({ title: o.title, body: o.body, silent: o.silent ?? true });
    n.on('click', showMain);
    n.show();
    return true;
  });

  ipcMain.handle('login:get', (e) => {
    if (!fromMain(e)) throw new Error('rechazado');
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('login:set', (e, v: unknown) => {
    if (!fromMain(e) || typeof v !== 'boolean') throw new Error('rechazado');
    app.setLoginItemSettings({ openAtLogin: v });
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('camera:settings', async (e) => {
    if (!fromMain(e)) throw new Error('rechazado');
    await shell.openExternal(
      process.platform === 'win32'
        ? 'ms-settings:privacy-webcam'
        : 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
    );
  });
  ipcMain.handle('camera:access', async (e) => {
    if (!fromMain(e)) throw new Error('rechazado');
    if (process.platform !== 'darwin') return 'granted';
    let status = systemPreferences.getMediaAccessStatus('camera');
    if (status === 'not-determined') {
      await systemPreferences.askForMediaAccess('camera');
      status = systemPreferences.getMediaAccessStatus('camera');
    }
    return status;
  });

  ipcMain.on('tray:update', (e, s: unknown) => {
    if (fromMain(e) && validTraySnapshot(s)) applyTrayUpdate(s);
  });
  ipcMain.on('overlay:show', (e, ms: unknown) => {
    if (fromMain(e)) showOverlay(clampOverlayMs(ms));
  });
  ipcMain.on('mini:set', (e, on: unknown) => {
    if (fromMain(e) && typeof on === 'boolean') setMiniMode(on);
  });
  ipcMain.on('tray:send-command', (e, c: unknown) => {
    if (!(fromPopover(e) || fromMini(e)) || !validTrayCommand(c)) return;
    popover?.hide();
    if (c === 'openWindow') showMain();
    else mainWindow?.webContents.send('tray:command', c);
    if (c === 'recalibrate') showMain();
  });
}

function registerPower(): void {
  const send = (ev: string): void => mainWindow?.webContents.send('system:event', ev);
  powerMonitor.on('suspend', () => send('suspend'));
  powerMonitor.on('resume', () => send('resume'));
  powerMonitor.on('lock-screen', () => send('lock'));
  powerMonitor.on('unlock-screen', () => send('unlock'));
}

// ---------- ciclo de vida ----------
if (process.platform === 'win32') app.setAppUserModelId('app.neckguard.desktop');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('activate', showMain);
  app.on('window-all-closed', () => undefined); // la app vive en la barra de menús

  void app.whenReady().then(() => {
    registerAppProtocol();
    registerPermissions();
    registerIpc();
    registerPower();
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
    const dockIcon = path.join(app.getAppPath(), 'build', 'icon.png');
    if (fs.existsSync(dockIcon)) app.dock?.setIcon(dockIcon);
    createTray();
    const hidden = process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
    createMainWindow(!hidden);
  });
}
