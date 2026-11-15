// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 NeckGuard contributors

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root no encontrado');
const isMenuBar = window.location.hash === '#/menubar';
const isMini = window.location.hash === '#/mini';
if (isMenuBar || isMini) document.documentElement.classList.add('menubar-root');
if (isMini) document.documentElement.classList.add('mini-root');
if (window.neckguard) document.documentElement.classList.add('electron');

// Popover y miniatura no instancian el runtime (cámara/visión): solo reciben instantáneas.
const Component = isMenuBar
  ? (await import('./ui/MenuBarView')).MenuBarView
  : isMini
    ? (await import('./ui/MiniView')).MiniView
    : (await import('./ui/App')).App;
createRoot(root).render(
  <StrictMode>
    <Component />
  </StrictMode>,
);
