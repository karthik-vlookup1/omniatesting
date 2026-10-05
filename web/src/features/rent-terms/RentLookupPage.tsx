import { Button, Group, Paper, TextInput } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components';

/** Enter a tenancy ID to open its rent terms and rent account. */
export function RentLookupPage() {
  useDocumentTitle('Rent · Omnia Recon');
  const navigate = useNavigate();
  const [tid, setTid] = useState('');
  const clean = tid.trim();

  return (
    <>
      <PageHeader title="Rent" description="Open a tenancy's rent terms, benefit awards, payer splits and rent account." />
      <Paper withBorder p="md" maw={520}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (clean) void navigate(`/rent/${encodeURIComponent(clean.toUpperCase())}`);
          }}
        >
          <Group align="flex-end">
            <TextInput label="Tenancy ID" placeholder="e.g. T1234" value={tid} onChange={(e) => setTid(e.currentTarget.value)} style={{ flex: 1 }} />
            <Button type="submit" disabled={!clean}>
              Open
            </Button>
          </Group>
        </form>
      </Paper>
    </>
  );
}
