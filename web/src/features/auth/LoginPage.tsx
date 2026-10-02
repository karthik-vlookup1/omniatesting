import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser, useLogin } from './useAuth';

export function LoginPage() {
  const me = useCurrentUser();
  const loginMutation = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (v.trim() === '' ? 'Enter your e-mail' : null),
      password: (v) => (v === '' ? 'Enter your password' : null),
    },
  });

  if (me.data) return <Navigate to={from} replace />;

  const submit = form.onSubmit((values) => {
    loginMutation.mutate(values, { onSuccess: () => navigate(from, { replace: true }) });
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w="100%" maw={380}>
        <form onSubmit={submit} noValidate>
          <Stack>
            <Title order={2}>Omnia Recon</Title>
            {loginMutation.error && (
              <Alert color="red" role="alert">
                {loginMutation.error.message}
              </Alert>
            )}
            <TextInput label="E-mail" type="email" autoComplete="username" required {...form.getInputProps('email')} />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              required
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={loginMutation.isPending}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
