# Empaquetado (macOS)

## Build sin firmar (desarrollo)

```bash
npm install
npm run electron:pack        # release/NeckGuard-<versión>-universal.dmg (arm64 + x64)
npm run electron:pack:dir    # release/mac-arm64/NeckGuard.app (solo arquitectura del equipo)
```

Un `.app` sin firmar se abre con clic derecho → Abrir (Gatekeeper). Verificado: el `.app` arm64 se genera, incluye `NSCameraUsageDescription` y arranca. El `.dmg` universal no se ha construido en esta sesión.

## Windows

```bash
npm run electron:pack:win      # release/NeckGuard-Setup-<v>[-x64|-arm64].exe (NSIS) + NeckGuard-Portable-<v>-x64.exe
npm run electron:pack:win:dir  # release/win-unpacked/ (solo x64, sin instalador)
```

Se puede construir desde macOS. Sin firmar: SmartScreen mostrará un aviso. Para firmar, define `CSC_LINK` y `CSC_KEY_PASSWORD` (certificado .pfx) o configura `win.azureSignOptions` en `electron-builder.yml`.

## Permisos macOS

- `NSCameraUsageDescription` en `Info.plist` (`electron-builder.yml → mac.extendInfo`).
- Entitlements (`build/entitlements.mac.plist`): `com.apple.security.device.camera`, `cs.allow-jit`, `cs.allow-unsigned-executable-memory` (requeridos por V8 con hardened runtime).
- Solicitud en tiempo de ejecución con `systemPreferences.askForMediaAccess('camera')` (IPC `camera:access`); si se deniega, la UI enlaza a Ajustes del Sistema > Privacidad > Cámara.

## Firma y notarización (requiere cuenta de Apple Developer — no disponible aquí)

1. Certificado «Developer ID Application» en el llavero.
2. En `electron-builder.yml` elimina `identity: null` (o fija `identity: "Developer ID Application: …"`) y añade `notarize: true`.
3. Variables de entorno: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
4. `npm run electron:pack` firma con hardened runtime, notariza y grapa el ticket.

## Notas de seguridad Electron

`contextIsolation`, `sandbox`, sin `nodeIntegration`, sin `remote`; carga desde `app://neckguard/` con CSP por cabecera; navegación y `window.open` bloqueados; IPC con validación de emisor y argumentos; peticiones no locales canceladas. El aviso «Insecure Content-Security-Policy» de Electron en desarrollo es un falso positivo por `'wasm-unsafe-eval'` y no aparece empaquetada.

## Ventana oculta y suspensión

`backgroundThrottling:false`; `powerSaveBlocker('prevent-app-suspension')` solo mientras se analiza activamente (se libera en pausa/bloqueo); `powerMonitor` (`suspend`, `resume`, `lock-screen`, `unlock-screen`) pausa el análisis y cuenta como ausencia. Cerrar la ventana la oculta (la app sigue en la barra de menús); salir con ⌘Q.
