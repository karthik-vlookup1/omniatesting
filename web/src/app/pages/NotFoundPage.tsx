import { Button } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconMapOff } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components';

export function NotFoundPage() {
  useDocumentTitle('Page not found · Omnia Recon');
  return (
    <EmptyState
      icon={<IconMapOff stroke={1.5} aria-hidden />}
      title="Page not found"
      description="This address does not match any page in Omnia Recon. It may have been mistyped or the page may have moved."
      action={
        <Button component={Link} to="/" variant="default">
          Go to Home
        </Button>
      }
    />
  );
}
