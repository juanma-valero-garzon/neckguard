import { useState, type ReactNode } from 'react';
import { useT } from './useT';

const LOADERS = {
  license: () => import('../../LICENSE?raw'),
  notices: () => import('../../THIRD_PARTY_NOTICES.md?raw'),
} as const;

/** Texto de licencia incrustado en el build (sin peticiones de red); se carga al abrir. */
export function LicenseViewer({ kind, title }: { kind: keyof typeof LOADERS; title: string }): ReactNode {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>): void => {
    if (!e.currentTarget.open || text !== null) return;
    LOADERS[kind]().then(
      (m) => setText(m.default),
      () => setFailed(true),
    );
  };

  return (
    <details className="license-viewer" onToggle={onToggle}>
      <summary>{title}</summary>
      {failed ? (
        <p role="alert">{t('about.license.error')}</p>
      ) : (
        <pre tabIndex={0}>{text ?? t('common.loading')}</pre>
      )}
    </details>
  );
}
