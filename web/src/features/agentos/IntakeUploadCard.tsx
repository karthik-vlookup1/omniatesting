import { Alert, Button, Card, Group, List, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { ApiError, errorMessage } from '../../lib/api';
import { useUploadIntake, type IntakeImportResult } from './api';

interface RowError {
  line: number;
  field: string;
  reason: string;
}

/** Upload of the formatted bank file; reports the match counts, row errors or the duplicate batch. */
export function IntakeUploadCard({ onBatch }: { onBatch: (batchId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<IntakeImportResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const upload = useUploadIntake();

  const submit = () => {
    if (!file) return;
    setResult(null);
    setError(null);
    upload.mutate(file, {
      onSuccess: (batch) => {
        setResult(batch);
        onBatch(batch.batchId);
      },
      onError: (err) => setError(err),
    });
  };

  const details = error instanceof ApiError ? (error.details as { rowErrors?: RowError[]; batchId?: string } | undefined) : undefined;
  const rowErrors = details?.rowErrors?.slice(0, 20) ?? [];
  const dupBatch = error instanceof ApiError && error.status === 409 ? details?.batchId : undefined;
  const c = result?.matchCounts;

  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={2} fz="md">
          Upload formatted bank file
        </Title>
        <Group align="flex-end">
          <input
            type="file"
            accept=".csv,text/csv"
            data-testid="agentos-file"
            aria-label="Formatted bank file"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
          <Button onClick={submit} disabled={!file} loading={upload.isPending}>
            Upload
          </Button>
        </Group>
        {result && c && (
          <Alert color="green" role="status">
            Uploaded {result.rowsTotal} lines: matched {c.matched}, ambiguous {c.ambiguous}, unmatched {c.unmatched}
            {result.unresolvedRefs > 0 && (
              <Text size="sm" mt={4}>
                {result.unresolvedRefs} tenant references not found in Omnia
              </Text>
            )}
          </Alert>
        )}
        {error && (
          <Alert color="red" role="alert">
            <Text>{errorMessage(error)}</Text>
            {rowErrors.length > 0 && (
              <List size="sm" mt="xs">
                {rowErrors.map((r, i) => (
                  <List.Item key={i}>
                    Line {r.line}: {r.field} {r.reason}
                  </List.Item>
                ))}
              </List>
            )}
            {dupBatch && (
              <Button variant="default" size="xs" mt="xs" onClick={() => onBatch(dupBatch)}>
                Show that batch
              </Button>
            )}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
