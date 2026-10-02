import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './theme/global.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createQueryClient } from './lib/query';
import { theme } from './theme';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// `npm run dev:preview` only. `import.meta.env.DEV` is false in every `vite build`, so this branch
// and the preview module are removed from production bundles.
let PreviewBanner: ComponentType | null = null;
if (import.meta.env.DEV && import.meta.env.MODE === 'preview-api') {
  const preview = await import('./dev/previewApi');
  preview.installPreviewApi();
  PreviewBanner = (await import('./dev/PreviewBanner')).PreviewBanner;
}

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" limit={4} />
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
      {PreviewBanner && <PreviewBanner />}
    </MantineProvider>
  </StrictMode>,
);
