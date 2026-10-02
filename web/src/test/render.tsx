import { MantineProvider } from '@mantine/core';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/** Renders inside a MantineProvider. Feature tests add their own Query/Router wrappers. */
export function renderWithMantine(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const Wrapper = ({ children }: { children: ReactNode }) => <MantineProvider>{children}</MantineProvider>;
  return render(ui, { wrapper: Wrapper, ...options });
}
