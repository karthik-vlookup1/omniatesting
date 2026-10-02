import { Button } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconLock } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components';

/** Shown when a signed-in user opens a page their role cannot use. */
export function ForbiddenPage() {
  useDocumentTitle('No access · Omnia Recon');
  return (
    <EmptyState
      icon={<IconLock stroke={1.5} aria-hidden />}
      title="You do not have access to this page"
      description="Your role does not include this area. If you need it for your work, ask an Omnia Recon administrator."
      action={
        <Button component={Link} to="/" variant="default">
          Go to Home
        </Button>
      }
    />
  );
}
