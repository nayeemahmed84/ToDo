import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans';
import './index.css';
import './styles/theme-light.css';
import './styles/pwa.css';
import './styles/theme-glass.css';
import './styles/theme-dark.css';
import './styles/productivity.css';
import './styles/board.css';
import './styles/saved-filters.css';
import './styles/presence.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
