import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../node_modules/@fontsource-variable/inter/index.css';
import './index.css';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
