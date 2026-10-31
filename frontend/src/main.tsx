import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './fonts.css';
import './workspace.css';
import './style.css';
import { IconSprite } from './Icon';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <>
      <IconSprite />
      <App />
    </>
  </React.StrictMode>,
);
