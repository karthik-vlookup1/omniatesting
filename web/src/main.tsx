import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './theme/global.css';
import { MantineProvider, Text } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './lib/query';
import { theme } from './theme';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" limit={4} />
      <QueryClientProvider client={queryClient}>
        <Text p="xl">Omnia Recon</Text>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
