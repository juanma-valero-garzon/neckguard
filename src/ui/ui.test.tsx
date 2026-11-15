// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { defaultStore, emptyTotals } from '../stats/model';
import { App } from './App';
import { MiniView } from './MiniView';
import type { NeckGuardBridge, TraySnapshot } from '../platform/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  return host;
}

const click = async (el: Element | null): Promise<void> => {
  if (!el) throw new Error('elemento no encontrado');
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const button = (c: HTMLElement, text: RegExp): HTMLButtonElement =>
  [...c.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement;

beforeAll(async () => {
  localStorage.clear();
  await runtime.init();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = host = null;
});

describe('UI: onboarding y bloqueo de ejercicios', () => {
  it('muestra el aviso legal y no permite continuar sin aceptarlo', async () => {
    const c = await mount();
    expect(c.textContent).toContain('no es un producto sanitario');
    expect(button(c, /Siguiente/).disabled).toBe(true);
    await click(c.querySelector('input[type=checkbox]'));
    expect(button(c, /Siguiente/).disabled).toBe(false);
    await click(button(c, /Siguiente/));
    expect(c.textContent).toContain('Señales de alerta');
    expect(c.querySelectorAll('ul.bullets li').length).toBeGreaterThanOrEqual(9);
    expect(c.textContent).toContain('suspende los ejercicios y consulta');
    expect(c.textContent).toContain('los ejercicios quedan bloqueados');
  });

  it('en la pantalla de ejercicios, sin confirmar señales de alerta están bloqueados', async () => {
    runtime.updateSettings((s) => ({ ...s, onboarding: { ...s.onboarding, completed: true } }));
    runtime.navigate('exercises');
    const c = await mount();
    expect(c.textContent).toContain('Los ejercicios están bloqueados');
    expect(c.querySelector('article')).toBeNull();
  });

  it('tras confirmar se ven los básicos; los avanzados requieren aceptar la advertencia', async () => {
    runtime.updateSettings((s) => ({ ...s, onboarding: { ...s.onboarding, redFlagsConfirmed: true } }));
    const c = await mount();
    expect(c.querySelectorAll('article').length).toBe(4);
    expect(c.textContent).toContain('Retracción cervical en sedestación');
    expect(c.textContent).not.toContain('Retracción con extensión');
    const unlock = button(c, /Desbloquear/);
    expect(unlock.disabled).toBe(true);
    await click(c.querySelector('input[type=checkbox]'));
    await click(button(c, /Desbloquear/));
    expect(c.textContent).toContain('Retracción con extensión');
    expect(c.textContent).toContain('Extensión de cuello sentado');
    expect(c.querySelectorAll('article').length).toBe(6);
    expect(c.textContent).toContain('Regla de seguridad');
  });

  it('el preset Sensible oculta los avanzados', async () => {
    runtime.updateSettings((s) => ({ ...s, preset: 'sensitive' }));
    const c = await mount();
    expect(c.querySelectorAll('article').length).toBe(4);
    expect(c.textContent).toContain('no muestra ejercicios avanzados');
    runtime.updateSettings((s) => ({ ...s, preset: 'standard' }));
  });
});

describe('modo frontal/lateral por cámara', () => {
  const cam = (label: string) => ({
    status: 'running' as const,
    error: null,
    devices: [],
    active: { deviceId: `id-${label}`, label },
    deviceChanged: false,
    attempt: 0,
  });
  const onCamera = (c: ReturnType<typeof cam>): void =>
    (runtime as unknown as { onCameraState(c: unknown): void }).onCameraState(c);

  it('cualquier cámara puede ser frontal o lateral y cada una conserva su modo', () => {
    onCamera(cam('Portátil'));
    runtime.updateSettings((s) => ({ ...s, mode: 'lateral' }));
    onCamera(cam('USB'));
    expect(useApp.getState().settings.mode).toBe('lateral'); // primera vez: hereda
    runtime.updateSettings((s) => ({ ...s, mode: 'frontal' }));
    onCamera(cam('Portátil'));
    expect(useApp.getState().settings.mode).toBe('lateral');
    onCamera(cam('USB'));
    expect(useApp.getState().settings.mode).toBe('frontal');
    expect(useApp.getState().settings.cameraModes).toEqual({ Portátil: 'lateral', USB: 'frontal' });
  });

  it('la pantalla de calibración permite elegir el modo', async () => {
    useApp.setState({ camera: cam('Portátil') });
    runtime.navigate('calibration');
    const c = await mount();
    expect(c.querySelector('select')).toBeTruthy();
    expect(c.textContent).toContain('El modo se recuerda para cada cámara');
    runtime.updateSettings((s) => ({ ...s, mode: 'frontal' }));
  });
});

describe('UI: panel en una columna con tarjetas plegables', () => {
  const toggle = (c: HTMLElement, title: RegExp): HTMLButtonElement =>
    [...c.querySelectorAll<HTMLButtonElement>('button.card-toggle')].find((b) =>
      title.test(b.textContent ?? ''),
    )!;

  it('muestra todas las tarjetas en una sola columna, expandidas por defecto', async () => {
    runtime.navigate('main');
    runtime.updateSettings((x) => ({ ...x, collapsedCards: [] }));
    const c = await mount();
    expect(c.querySelector('.split')).toBeNull();
    const titles = [...c.querySelectorAll('.dashboard-col > section.card h2')].map((h) => h.textContent);
    expect(titles).toEqual([
      'Estado',
      'Cámara',
      'Indicadores clave (cambio respecto a tu base)',
      'Tiempo sentado',
      'Controles',
    ]);
    for (const b of c.querySelectorAll('button.card-toggle'))
      expect(b.getAttribute('aria-expanded')).toBe('true');
  });

  it('cada tarjeta se contrae y expande, y el estado se recuerda en los ajustes', async () => {
    runtime.updateSettings((x) => ({ ...x, collapsedCards: [] }));
    const c = await mount();
    expect(c.querySelectorAll('.meter').length).toBe(3);
    await click(toggle(c, /Indicadores clave/));
    expect(toggle(c, /Indicadores clave/).getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelectorAll('.meter').length).toBe(0);
    expect(useApp.getState().settings.collapsedCards).toEqual(['indicators']);
    await click(toggle(c, /Tiempo sentado/));
    expect(c.querySelector('.card-summary strong')?.textContent).toMatch(/^\d+:\d{2}$/);
    await click(toggle(c, /Indicadores clave/));
    expect(c.querySelectorAll('.meter').length).toBe(3);
    expect(useApp.getState().settings.collapsedCards).toEqual(['sitting']);
    runtime.updateSettings((x) => ({ ...x, collapsedCards: [] }));
  });

  it('al contraer la cámara se libera el vídeo y el análisis sigue (el vídeo vuelve a su contenedor oculto)', async () => {
    runtime.updateSettings((x) => ({ ...x, collapsedCards: [] }));
    const c = await mount();
    expect(c.querySelector('.preview-box')).toBeTruthy();
    await click(toggle(c, /Cámara/));
    expect(c.querySelector('.preview-box')).toBeNull();
    expect(runtime.video.parentElement?.className).toBe('camera-host');
    runtime.updateSettings((x) => ({ ...x, collapsedCards: [] }));
  });
});

describe('UI: pantallas e idioma', () => {
  it('estadísticas sin datos muestra el estado vacío', async () => {
    runtime.navigate('stats');
    const c = await mount();
    expect(c.textContent).toContain('Aún no hay datos');
  });

  it('estadísticas con datos: día/semana/mes, fiabilidad, ausencias y pautas', async () => {
    const before = useApp.getState().store;
    const now = Date.now();
    const st = defaultStore();
    const MIN = 60_000;
    st.sessions.push({
      ...emptyTotals(),
      id: 'a',
      startedAt: now - MIN,
      endedAt: now,
      mode: 'frontal',
      okMs: 180 * MIN,
      badMs: 60 * MIN,
      absentMs: 30 * MIN,
      hours: [],
      deviationMs: { slouch: 50 * MIN, protrusion: 10 * MIN },
      deviationActiveMs: {},
    });
    st.blocks.push({ t: now - 100 * MIN, durMs: 95 * MIN });
    useApp.setState({ store: st });
    runtime.navigate('stats');
    const c = await mount();
    for (const tab of ['Día', 'Semana', 'Mes'])
      expect(c.querySelector('[role=tab][aria-selected]')?.parentElement?.textContent).toContain(tab);
    expect(c.textContent).toContain('Fiabilidad alta');
    expect(c.textContent).toContain('Sentado y analizado: 4 h');
    expect(c.textContent).toContain('Fuera de la silla: 30 min');
    expect(c.textContent).toContain('no cuenta como buena ni como mala postura');
    expect(c.textContent).toContain('Pautas para mejorar');
    expect(c.textContent).toContain('seguidos sentado');
    expect(c.textContent).toContain('consejo médico');
    await click(button(c, /^Semana$/));
    expect(c.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Semana');
    expect(c.querySelector('.period-nav strong')?.textContent).toContain('–');
    await click(button(c, /^Mes$/));
    expect(c.querySelectorAll('.bars .bar-col').length).toBeGreaterThanOrEqual(28);
    await click(button(c, /Anterior/));
    expect(c.textContent).toContain('No hay datos en este periodo');
    useApp.setState({ store: before });
  });

  it('el panel indica que falta calibrar y no muestra veredictos sin datos', async () => {
    runtime.navigate('main');
    useApp.setState({ camera: { ...useApp.getState().camera, status: 'running' } });
    const c = await mount();
    expect(c.textContent).toContain('Falta la calibración');
    expect(c.querySelectorAll('.meter').length).toBe(3);
    expect(c.textContent).toContain('—');
  });

  it('cambia a inglés sin literales residuales en español', async () => {
    runtime.updateSettings((s) => ({ ...s, locale: 'en' }));
    runtime.navigate('about');
    const c = await mount();
    expect(document.documentElement.lang).toBe('en');
    expect(c.textContent).toContain('NeckGuard is not a medical device');
    expect(c.textContent).toContain('Starting clinical thresholds');
    expect(c.textContent).not.toContain('Señales');
    runtime.updateSettings((s) => ({ ...s, locale: 'es' }));
  });

  it('Acerca de muestra la licencia AGPL-3.0 y carga su texto y los avisos de terceros al abrirlos', async () => {
    runtime.navigate('about');
    const c = await mount();
    expect(c.textContent).toContain('GNU Affero General Public License v3.0');
    const viewers = [...c.querySelectorAll<HTMLDetailsElement>('details.license-viewer')];
    expect(viewers).toHaveLength(2);
    for (const d of viewers) {
      await act(async () => {
        d.open = true;
        d.dispatchEvent(new Event('toggle'));
        await new Promise((r) => setTimeout(r, 50));
      });
    }
    expect(viewers[0]?.querySelector('pre')?.textContent).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    expect(viewers[1]?.querySelector('pre')?.textContent).toContain('@mediapipe/tasks-vision');
  });

  it('Acerca de muestra los umbrales con su nivel de confianza y que no están validados', async () => {
    runtime.navigate('about');
    const c = await mount();
    expect(c.querySelector('img.about-icon')?.getAttribute('src')).toMatch(/icon\.svg$/);
    expect(c.textContent).toContain('NO han sido revisados');
    expect(c.querySelectorAll('table.thresholds tbody tr').length).toBe(8);
    expect(c.textContent).toContain('Heurística');
  });

  it('los ajustes ofrecen exportar y borrar datos con confirmación', async () => {
    runtime.navigate('settings');
    const c = await mount();
    expect(button(c, /Exportar mis datos \(JSON\)/)).toBeTruthy();
    expect(button(c, /Exportar mis datos \(CSV\)/)).toBeTruthy();
    await click(button(c, /Borrar todos mis datos/));
    expect(c.textContent).toContain('Se borrarán ajustes');
    await click(button(c, /Cancelar/));
    expect(c.textContent).not.toContain('Se borrarán ajustes');
  });

  it('la ventana de descanso muestra ejercicio, cuenta atrás y las cuatro acciones', async () => {
    runtime.navigate('main');
    runtime.openBreak('micro');
    const c = await mount();
    const dialog = c.querySelector('[role=dialog]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    for (const re of [/Empezar cuenta atrás/, /Hecho/, /Posponer/, /Saltar/])
      expect(button(c, re)).toBeTruthy();
    expect(c.querySelector('.countdown')?.textContent).toBe('1:30');
    await click(button(c, /Saltar/));
    expect(c.querySelector('[role=dialog]')).toBeNull();
  });
});

describe('UI: ventana miniatura', () => {
  it('muestra indicadores clave y tiempo restante, y permite restaurar', async () => {
    const snap: TraySnapshot = {
      level: 'AVISO_LEVE',
      locale: 'es',
      suppressed: null,
      paused: false,
      sittingMin: 5,
      nextBreakMin: 25,
      goodPercent: null,
      labels: { status: 'Aviso', sitting: 'a', nextBreak: 'b', good: '' },
      mini: {
        hypervigilance: true,
        sitting: '12:00',
        sittingLabel: 'Tiempo sentado',
        meters: [
          {
            label: 'Cabeza adelantada',
            text: '+5.0\u00b0',
            zone: 'amber',
            fill: 0.5,
            amberAt: 0.3,
            redAt: 0.6,
          },
        ],
        remaining: '24:10',
        remainingLabel: 'Pr\u00f3ximo descanso',
      },
    };
    const sent: string[] = [];
    window.neckguard = {
      onTraySnapshot: (cb: (s: TraySnapshot) => void) => (cb(snap), () => undefined),
      sendTrayCommand: (c: string) => void sent.push(c),
    } as unknown as NeckGuardBridge;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<MiniView />);
    });
    expect(host.textContent).toContain('Cabeza adelantada');
    expect(host.textContent).toContain('+5.0\u00b0');
    expect(host.textContent).toContain('24:10');
    expect(host.querySelector('.mini .meter-bar .fill')).toBeTruthy();
    await click(host.querySelector('button[aria-label="Restaurar ventana"]'));
    expect(sent).toEqual(['openWindow']);
    delete window.neckguard;
  });

  it('con hipervigilancia OFF solo muestra el tiempo hasta la pausa', async () => {
    const snap: TraySnapshot = {
      level: 'MALA_POSTURA',
      locale: 'es',
      suppressed: null,
      paused: false,
      sittingMin: 5,
      nextBreakMin: 25,
      goodPercent: null,
      labels: { status: 'Mala postura', sitting: 'a', nextBreak: 'b', good: '' },
      mini: {
        hypervigilance: false,
        sitting: '12:00',
        sittingLabel: 'Tiempo sentado',
        meters: [
          {
            label: 'Cabeza adelantada',
            text: '+5.0\u00b0',
            zone: 'red',
            fill: 0.9,
            amberAt: 0.3,
            redAt: 0.6,
          },
        ],
        remaining: '24:10',
        remainingLabel: 'Pr\u00f3ximo descanso',
      },
    };
    window.neckguard = {
      onTraySnapshot: (cb: (s: TraySnapshot) => void) => (cb(snap), () => undefined),
      sendTrayCommand: () => undefined,
    } as unknown as NeckGuardBridge;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<MiniView />);
    });
    expect(host.textContent).toContain('24:10');
    expect(host.textContent).not.toContain('12:00');
    expect(host.textContent).not.toContain('Cabeza adelantada');
    expect(host.querySelector('.mini .meter-bar')).toBeNull();
    delete window.neckguard;
  });

  it('durante un descanso muestra el ejercicio y gestiona las acciones sin la ventana principal', async () => {
    const snap: TraySnapshot = {
      level: 'OK',
      locale: 'es',
      suppressed: null,
      paused: false,
      sittingMin: 30,
      nextBreakMin: 0,
      goodPercent: null,
      labels: { status: 'OK', sitting: 'a', nextBreak: 'b', good: '' },
      mini: {
        hypervigilance: true,
        sitting: '30:00',
        sittingLabel: 'Tiempo sentado',
        meters: [],
        remaining: '',
        remainingLabel: 'Descanso pendiente',
        breakInfo: {
          kind: 'micro',
          title: 'Microdescanso',
          body: 'Levántate.',
          exercise: 'Retracción cervical',
          illustration: 'chinTuck',
          steps: ['Paso uno', 'Paso dos'],
          countdown: '1:30',
          started: false,
          snoozeMin: 5,
        },
      },
    };
    const sent: string[] = [];
    window.neckguard = {
      onTraySnapshot: (cb: (s: TraySnapshot) => void) => (cb(snap), () => undefined),
      sendTrayCommand: (c: string) => void sent.push(c),
    } as unknown as NeckGuardBridge;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<MiniView />);
    });
    expect(host.textContent).toContain('Microdescanso');
    expect(host.textContent).toContain('Paso dos');
    expect(host.querySelector('.mini-break-figure svg.illustration')).toBeTruthy();
    expect(host.querySelector('.countdown')?.textContent).toBe('1:30');
    await click(button(host, /Empezar cuenta atrás/));
    await click(button(host, /Hecho/));
    await click(button(host, /Posponer 5 min/));
    await click(button(host, /Saltar/));
    expect(sent).toEqual(['breakStart', 'breakDone', 'breakSnooze', 'breakSkip']);
    delete window.neckguard;
  });
});
