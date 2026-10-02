import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDocumentTitle } from '@mantine/hooks';
import { IconAlertCircle, IconChecks, IconClockHour4, IconLock, IconShieldCheck } from '@tabler/icons-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingState } from '../../components';
import { useLogin, useSession } from '../../data/auth';
import { errorMessage, isApiError } from '../../lib/api';
import { safeNextPath } from './redirect';

function loginErrorView(err: unknown): { title: string; body: string; icon: React.ReactNode } {
  if (isApiError(err)) {
    switch (err.code) {
      case 'invalid_credentials':
        return {
          title: 'Sign-in failed',
          body: 'The e-mail or password is incorrect. Check both and try again.',
          icon: <IconAlertCircle size={18} aria-hidden />,
        };
      case 'account_locked':
        return {
          title: 'Account temporarily locked',
          body: 'Too many failed attempts. The account unlocks automatically after 15 minutes, or an administrator can reset your password.',
          icon: <IconLock size={18} aria-hidden />,
        };
      case 'too_many_requests': {
        const minutes = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : null;
        return {
          title: 'Too many sign-in attempts',
          body: minutes
            ? `Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} before trying again.`
            : 'Please wait a few minutes before trying again.',
          icon: <IconClockHour4 size={18} aria-hidden />,
        };
      }
      default:
        break;
    }
  }
  return { title: 'Could not sign in', body: errorMessage(err), icon: <IconAlertCircle size={18} aria-hidden /> };
}

export function LoginPage() {
  useDocumentTitle('Sign in · Omnia Recon');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const loginMutation = useLogin();
  const next = safeNextPath(params.get('next'));
  const expired = params.get('reason') === 'expired';

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Enter your work e-mail address'),
      password: (v) => (v.length > 0 ? null : 'Enter your password'),
    },
  });

  if (session.isPending) return <LoadingState fullScreen label="Checking your session…" />;
  if (session.data) return <Navigate to={next} replace />;

  const failure = loginMutation.isError ? loginErrorView(loginMutation.error) : null;

  return (
    <Box mih="100dvh" style={{ display: 'flex' }}>
      <Box
        visibleFrom="md"
        bg="brand.9"
        c="white"
        p={48}
        style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
      >
        <Group gap="sm">
          <ThemeIcon size={36} radius="md" color="white" variant="white" aria-hidden>
            <IconChecks size={22} color="var(--mantine-color-brand-9)" />
          </ThemeIcon>
          <Text fw={650} fz="lg">
            Omnia Recon
          </Text>
        </Group>
        <Stack gap="md" maw={420}>
          <Title order={2} fz={28} lh={1.25} c="white">
            Rent reconciliation for Omnia Housing
          </Title>
          <Text c="brand.1" fz="md" lh={1.6}>
            Upload each bank statement once. Every line is matched to a tenancy, anything uncertain is
            queued for review, and receipts flow on to the bank statement, Vico and Xero.
          </Text>
        </Stack>
        <Group gap="xs" c="brand.2">
          <IconShieldCheck size={16} aria-hidden />
          <Text fz="xs">Authorised Omnia staff only. All activity is audited.</Text>
        </Group>
      </Box>

      <Box component="main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} p="lg">
        <Stack w="100%" maw={400} gap="lg">
          <Group gap="sm" hiddenFrom="md">
            <ThemeIcon size={32} radius="md" aria-hidden>
              <IconChecks size={20} />
            </ThemeIcon>
            <Text fw={650} fz="lg">
              Omnia Recon
            </Text>
          </Group>

          <Stack gap={4}>
            <Title order={1}>Sign in</Title>
            <Text c="slate.6" fz="sm">
              Use your Omnia Recon account.
            </Text>
          </Stack>

          {expired && !failure && (
            <Alert color="blue" title="Your session has ended" icon={<IconClockHour4 size={18} aria-hidden />}>
              <Text fz="sm">For security you were signed out. Sign in again to carry on where you left off.</Text>
            </Alert>
          )}

          {failure && (
            <Alert color="red" title={failure.title} icon={failure.icon} role="alert">
              <Text fz="sm">{failure.body}</Text>
            </Alert>
          )}

          <Paper withBorder p="lg" shadow="xs">
            <form
              noValidate
              onSubmit={form.onSubmit((values) =>
                loginMutation.mutate(values, { onSuccess: () => navigate(next, { replace: true }) }),
              )}
            >
              <Stack gap="md">
                <TextInput
                  label="E-mail"
                  type="email"
                  autoComplete="username"
                  required
                  data-autofocus
                  autoFocus
                  key={form.key('email')}
                  {...form.getInputProps('email')}
                />
                <PasswordInput
                  label="Password"
                  autoComplete="current-password"
                  required
                  key={form.key('password')}
                  {...form.getInputProps('password')}
                />
                <Button type="submit" fullWidth loading={loginMutation.isPending} mt="xs">
                  Sign in
                </Button>
              </Stack>
            </form>
          </Paper>

          <Text fz="xs" c="slate.6" ta="center">
            Forgotten your password? Ask an Omnia Recon administrator to reset it.
          </Text>
        </Stack>
      </Box>
    </Box>
  );
}
