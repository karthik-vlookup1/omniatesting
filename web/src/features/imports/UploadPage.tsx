import { Alert, Button, Card, Grid, Group, Select, Stack, Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconEye, IconUpload } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { ErrorState, PageHeader } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { MAX_UPLOAD_BYTES, useBankAccounts, useUploadStatement, type BankAccount, type UploadResponse } from '../../data/imports';
import { RecentImportsTable } from './RecentImportsTable';
import { StatementDropzone } from './StatementDropzone';
import { UploadErrorAlert } from './UploadErrorAlert';
import { UploadResultCard } from './UploadResultCard';

const LAST_BANK_KEY = 'omnia.upload.lastBankAccountId';

function readLastBank(): string | null {
  try {
    return window.localStorage.getItem(LAST_BANK_KEY);
  } catch {
    return null;
  }
}

function rememberBank(id: string): void {
  try {
    window.localStorage.setItem(LAST_BANK_KEY, id);
  } catch {
    // Storage unavailable: the bank just is not pre-selected next time.
  }
}

function bankLabel(b: BankAccount): string {
  return `${b.code} · ${b.accountName}`;
}

export interface UploadPageProps {
  /** Where "Review these lines" goes for a batch; omitted until the review screen exists. */
  reviewHref?: (batchId: string) => string;
}

/** FRONTEND_REFERENCE.md §6.2: upload a bank statement once, see what was imported and matched. */
export function UploadPage({ reviewHref }: UploadPageProps) {
  useDocumentTitle('Upload statement · Omnia Recon');
  const user = useCurrentUser();
  const canWrite = can(user, 'write');
  const banks = useBankAccounts();
  const upload = useUploadStatement();

  const [bankId, setBankId] = useState<string | null>(() => readLastBank());
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [last, setLast] = useState<{ result: UploadResponse; bank: string; fileName: string } | null>(null);

  const active = useMemo(() => (banks.data ?? []).filter((b) => b.isActive), [banks.data]);
  const options = active.map((b) => ({
    value: b.id,
    label: b.profile ? `${bankLabel(b)} (profile v${b.profile.version})` : `${bankLabel(b)} — no CSV profile yet`,
    disabled: !b.profile,
  }));
  const selected = active.find((b) => b.id === bankId && b.profile) ?? null;
  const noProfiles = banks.isSuccess && active.every((b) => !b.profile);

  const chooseFile = (f: File | null) => {
    upload.reset();
    setFile(f);
    if (!f) return setFileError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Choose a .csv file exported from the bank.');
    if (f.size === 0) return setFileError('This file is empty.');
    if (f.size > MAX_UPLOAD_BYTES) return setFileError('The file is larger than 10 MB.');
    setFileError(null);
  };

  const submit = () => {
    setBankError(selected ? null : 'Choose the bank account this statement is from');
    if (!file) setFileError('Choose a statement file');
    if (!selected || !file || fileError) return;
    rememberBank(selected.id);
    upload.mutate(
      { bankAccountId: selected.id, file },
      {
        onSuccess: (result) => {
          setLast({ result, bank: bankLabel(selected), fileName: file.name });
          setFile(null);
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Upload statement"
        description="Upload each bank statement CSV once. Columns are read by name using the bank's CSV profile, duplicate lines from overlapping statements are skipped, and every new line is matched automatically."
      />

      <Grid gap="lg" mb="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card h="100%">
            {canWrite ? (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <Stack gap="md">
                  <Title order={2} fz="md">
                    New upload
                  </Title>
                  {banks.isError ? (
                    <ErrorState error={banks.error} title="Could not load bank accounts" onRetry={() => void banks.refetch()} />
                  ) : (
                    <Select
                      label="Bank account"
                      placeholder={banks.isPending ? 'Loading…' : 'Choose a bank account'}
                      data={options}
                      value={selected?.id ?? null}
                      onChange={(v) => {
                        setBankId(v);
                        setBankError(null);
                        upload.reset();
                      }}
                      disabled={banks.isPending || upload.isPending}
                      error={bankError}
                      required
                      searchable
                      nothingFoundMessage="No matching bank account"
                      description="Banks without a CSV profile cannot be uploaded yet."
                    />
                  )}
                  {noProfiles && (
                    <Alert color="orange" variant="light">
                      <Text fz="sm">No bank account has a CSV profile yet. An admin or accounts user needs to set one up first.</Text>
                    </Alert>
                  )}
                  <StatementDropzone file={file} onChange={chooseFile} disabled={upload.isPending} error={fileError} />
                  {upload.isError && <UploadErrorAlert error={upload.error} />}
                  <Group justify="flex-end">
                    <Button type="submit" loading={upload.isPending} leftSection={<IconUpload size={16} aria-hidden />}>
                      Upload and match
                    </Button>
                  </Group>
                </Stack>
              </form>
            ) : (
              <Stack gap="sm">
                <Title order={2} fz="md">
                  New upload
                </Title>
                <Alert color="gray" icon={<IconEye size={18} aria-hidden />} title="View only">
                  <Text fz="sm">Your role can see imports but not upload statements. Ask an admin if you need upload access.</Text>
                </Alert>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 7 }}>
          {last ? (
            <UploadResultCard result={last.result} bankLabel={last.bank} fileName={last.fileName} reviewHref={reviewHref} />
          ) : (
            <Card h="100%">
              <Stack gap="xs">
                <Title order={2} fz="md">
                  What happens when you upload
                </Title>
                <Text fz="sm" c="dimmed">
                  1. The file is checked against the bank's CSV profile. A file uploaded before is refused.
                </Text>
                <Text fz="sm" c="dimmed">
                  2. New lines are saved; lines already imported from an overlapping statement are skipped.
                </Text>
                <Text fz="sm" c="dimmed">
                  3. Each line is matched to a tenancy where the evidence is strong (TID, NI number, a known payer account).
                </Text>
                <Text fz="sm" c="dimmed">
                  4. Anything uncertain goes to the review queue; nothing is guessed silently.
                </Text>
              </Stack>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      <Title order={2} fz="md" mb="sm">
        Recent imports
      </Title>
      <RecentImportsTable reviewHref={reviewHref} />
    </>
  );
}
