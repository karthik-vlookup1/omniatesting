import '@mantine/core/styles.css';
import { MantineProvider, Text } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <MantineProvider>
      <Text p="xl">Omnia Recon</Text>
    </MantineProvider>
  </StrictMode>,
);
