import { Button } from '@mantine/core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithMantine } from './render';

describe('test environment', () => {
  it('provides the browser APIs Mantine needs', () => {
    expect(typeof window.matchMedia).toBe('function');
    expect(typeof window.ResizeObserver).toBe('function');
  });

  it('renders a Mantine component', () => {
    renderWithMantine(<Button>Upload</Button>);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });
});
