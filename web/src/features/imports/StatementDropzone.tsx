import { Button, CloseButton, FileButton, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { useState, type DragEvent } from 'react';
import { formatCount } from '../../lib/format';

export interface StatementDropzoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  error?: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${formatCount(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Drag a CSV here or pick one. The "Choose file" button is the keyboard and screen-reader path. */
export function StatementDropzone({ file, onChange, disabled, error }: StatementDropzoneProps) {
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onChange(dropped);
  };

  return (
    <Stack gap={4}>
      <Text component="span" fz="sm" fw={500}>
        Statement file{' '}
        <Text span c="red" aria-hidden>
          *
        </Text>
      </Text>
      <Paper
        withBorder
        p="lg"
        radius="md"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="statement-dropzone"
        style={{
          borderStyle: file ? 'solid' : 'dashed',
          borderColor: error
            ? 'var(--mantine-color-error)'
            : over
              ? 'var(--mantine-primary-color-filled)'
              : undefined,
          background: over ? 'var(--mantine-primary-color-light)' : undefined,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        {file ? (
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" miw={0}>
              <ThemeIcon variant="light" size={36} radius="md" aria-hidden>
                <IconFileSpreadsheet size={20} />
              </ThemeIcon>
              <Stack gap={0} miw={0}>
                <Text fz="sm" fw={600} truncate>
                  {file.name}
                </Text>
                <Text fz="xs" c="dimmed">
                  {formatSize(file.size)}
                </Text>
              </Stack>
            </Group>
            <CloseButton aria-label="Remove file" onClick={() => onChange(null)} disabled={disabled} />
          </Group>
        ) : (
          <Stack align="center" gap={6} py="xs">
            <ThemeIcon variant="light" size={40} radius="xl" aria-hidden>
              <IconUpload size={20} />
            </ThemeIcon>
            <Text fz="sm" ta="center">
              Drag a bank statement CSV here, or
            </Text>
            <FileButton onChange={onChange} accept=".csv,text/csv" disabled={disabled}>
              {(props) => (
                <Button {...props} variant="default" size="xs">
                  Choose file
                </Button>
              )}
            </FileButton>
            <Text fz="xs" c="dimmed">
              CSV, up to 10 MB
            </Text>
          </Stack>
        )}
      </Paper>
      {error && (
        <Text fz="xs" c="red" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  );
}
