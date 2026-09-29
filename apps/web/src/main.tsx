import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import './i18n';
import './index.css';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './auth/AuthProvider';
import { OrgProvider } from './org/OrgProvider';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
