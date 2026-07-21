import './polyfills';
import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import 'tunecamp-design-system/style.css';
import './core/plugins'; // Bootstrap plugins

import { BrowserRouter } from 'react-router-dom';
import { registerPWA } from './pwa';
import { queryClient } from './lib/queryClient';

registerPWA();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

