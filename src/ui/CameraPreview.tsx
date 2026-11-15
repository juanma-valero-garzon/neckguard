// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { useEffect, useRef, type ReactNode } from 'react';
import { runtime } from '../app/runtime';
import { useApp } from '../app/store';
import { Notice } from './components';
import { useT } from './useT';

/** Monta el <video> y el canvas de esqueleto (que posee el runtime) dentro de un contenedor de la UI. */
export function CameraPreview({ visible = true }: { visible?: boolean }): ReactNode {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const camera = useApp((s) => s.camera);
  const model = useApp((s) => s.model);
  const modelError = useApp((s) => s.modelError);

  useEffect(() => {
    const el = box.current;
    if (!el || !visible) return;
    const video = runtime.video;
    const host = video.parentElement;
    el.appendChild(video);
    el.appendChild(runtime.overlay);
    video.classList.add('preview-video');
    return () => {
      video.classList.remove('preview-video');
      runtime.overlay.remove();
      host?.appendChild(video);
    };
  }, [visible]);

  const overlay = ((): ReactNode => {
    if (camera.status === 'error' && camera.error) {
      return (
        <Notice
          kind="error"
          actions={
            camera.error === 'denied' ? (
              <button onClick={() => runtime.openCameraSettings()}>{t('camera.openSettings')}</button>
            ) : (
              <button onClick={() => void runtime.startCamera()}>{t('common.retry')}</button>
            )
          }
        >
          {t(`camera.error.${camera.error}`)}
        </Notice>
      );
    }
    if (camera.status === 'reconnecting')
      return <Notice kind="warning">{t('camera.reconnecting', { count: camera.attempt })}</Notice>;
    if (camera.status === 'starting') return <Notice>{t('camera.starting')}</Notice>;
    if (camera.status === 'idle')
      return (
        <Notice actions={<button onClick={() => void runtime.startCamera()}>{t('camera.start')}</button>}>
          {t('camera.idle')}
        </Notice>
      );
    if (model === 'loading') return <Notice>{t('model.loading')}</Notice>;
    if (model === 'error') {
      return (
        <Notice
          kind="error"
          actions={<button onClick={() => void runtime.retryVision()}>{t('common.retry')}</button>}
        >
          {t('model.error')}
          {modelError && <small className="mono"> {modelError}</small>}
        </Notice>
      );
    }
    if (model === 'cpu') return <Notice kind="warning">{t('model.cpu')}</Notice>;
    return null;
  })();

  return (
    <div className="preview">
      {visible ? (
        <div ref={box} className="preview-box mirrored" />
      ) : (
        <div className="preview-box hidden-preview">{t('preview.hidden')}</div>
      )}
      {overlay}
    </div>
  );
}
