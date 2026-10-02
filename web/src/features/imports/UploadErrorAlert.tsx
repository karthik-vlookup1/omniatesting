import { Alert, List, Text } from '@mantine/core';
import { IconAlertCircle, IconCopy } from '@tabler/icons-react';
import { CANONICAL_FIELD_LABEL, type CanonicalField, type UploadRejection } from '../../data/imports';
import { errorMessage, isApiError } from '../../lib/api';

const MAX_ROW_ERRORS = 20;

function rejection(err: unknown): UploadRejection {
  if (!isApiError(err) || typeof err.details !== 'object' || err.details === null) return {};
  return err.details as UploadRejection;
}

/**
 * Explains why an upload was refused (FRONTEND_REFERENCE.md §5.5): the same file again (409), a
 * layout that does not match the bank's CSV profile, or rows that could not be read. The whole
 * file is rejected in the last two cases, so nothing was imported.
 */
export function UploadErrorAlert({ error }: { error: unknown }) {
  const details = rejection(error);
  const duplicate = isApiError(error) && error.code === 'conflict';

  if (details.missingFields && details.missingFields.length > 0) {
    return (
      <Alert color="red" title="This file does not match the bank's CSV layout" icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
        <Text fz="sm">{errorMessage(error)}</Text>
        <Text fz="sm" mt="xs">
          Columns not found:
        </Text>
        <List size="sm" mt={4}>
          {details.missingFields.map((f) => (
            <List.Item key={f}>{CANONICAL_FIELD_LABEL[f as CanonicalField] ?? f}</List.Item>
          ))}
        </List>
        <Text fz="sm" mt="xs">
          Nothing was imported. If the bank has renamed or moved columns, update the CSV profile for this
          bank, then upload again.
        </Text>
      </Alert>
    );
  }

  if (details.rowErrors && details.rowErrors.length > 0) {
    const shown = details.rowErrors.slice(0, MAX_ROW_ERRORS);
    const more = details.rowErrors.length - shown.length;
    return (
      <Alert color="red" title="Some rows could not be read" icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
        <Text fz="sm">{errorMessage(error)} Nothing was imported; fix these rows and upload again.</Text>
        <List size="sm" mt="xs" spacing={2}>
          {shown.map((r) => (
            <List.Item key={`${r.line}-${r.error}`}>
              <Text span fz="sm" className="tabular" fw={500}>
                Line {r.line}:
              </Text>{' '}
              {r.error}
            </List.Item>
          ))}
        </List>
        {more > 0 && (
          <Text fz="xs" c="dimmed" mt={4}>
            …and {more} more.
          </Text>
        )}
      </Alert>
    );
  }

  return (
    <Alert
      color={duplicate ? 'orange' : 'red'}
      title={duplicate ? 'Already imported' : 'Upload failed'}
      icon={duplicate ? <IconCopy size={18} aria-hidden /> : <IconAlertCircle size={18} aria-hidden />}
      role="alert"
    >
      <Text fz="sm">{errorMessage(error)}</Text>
      {duplicate && (
        <Text fz="sm" mt={4}>
          Each statement is imported once, so nothing was added. Lines from overlapping statements are
          skipped automatically.
        </Text>
      )}
    </Alert>
  );
}
