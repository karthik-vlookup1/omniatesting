import { ActionIcon, Badge, Button, Group, Select, Switch, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconLock, IconPencil, IconUserPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
} from '../../components';
import { ROLES, ROLE_LABEL, useCurrentUser, type Role } from '../../data/auth';
import { useUpdateUser, useUsers, type UserSummary } from '../../data/users';
import { errorMessage } from '../../lib/api';
import { formatDateTime, formatRelative } from '../../lib/format';
import { UserFormModal } from './UserFormModal';

type StatusFilter = 'all' | 'active' | 'inactive';

const ROLE_COLOR: Record<Role, string> = { admin: 'grape', accounts: 'blue', staff: 'teal', readonly: 'gray' };

function isLocked(u: UserSummary, now = Date.now()): boolean {
  return Boolean(u.lockedUntil && new Date(u.lockedUntil).getTime() > now);
}

/** FRONTEND_REFERENCE.md §5.2: admin-only user administration over /api/users. */
export function UsersPage() {
  useDocumentTitle('Users · Omnia Recon');
  const me = useCurrentUser();
  const users = useUsers();
  const update = useUpdateUser();

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<UserSummary | null>(null);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return (users.data ?? [])
      .filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .filter((u) => role === 'all' || u.role === role)
      .filter((u) => status === 'all' || (status === 'active' ? u.isActive : !u.isActive))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'en-GB'));
  }, [users.data, query, role, status]);

  const setActive = (u: UserSummary, isActive: boolean) =>
    update.mutate(
      { id: u.id, input: { isActive } },
      {
        onSuccess: (saved) => {
          setDeactivating(null);
          notifications.show({
            color: 'teal',
            title: isActive ? 'User reactivated' : 'User deactivated',
            message: isActive ? `${saved.fullName} can sign in again.` : `${saved.fullName} has been signed out and cannot sign in.`,
          });
        },
        onError: (err) => {
          if (!deactivating) notifications.show({ color: 'red', title: 'Could not update user', message: errorMessage(err) });
        },
      },
    );

  const columns: DataTableColumn<UserSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (u) => (
        <Group gap={6} wrap="nowrap">
          <Text fz="sm" fw={500} truncate>
            {u.fullName}
          </Text>
          {u.id === me.id && (
            <Badge size="xs" variant="outline" color="gray">
              You
            </Badge>
          )}
        </Group>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (u) => u.email,
      truncate: { tooltip: (u) => u.email },
      width: 260,
    },
    {
      key: 'role',
      header: 'Role',
      cell: (u) => (
        <Badge variant="light" color={ROLE_COLOR[u.role]}>
          {ROLE_LABEL[u.role]}
        </Badge>
      ),
    },
    {
      key: 'active',
      header: 'Active',
      cell: (u) => {
        const self = u.id === me.id;
        const toggle = (
          <Switch
            size="sm"
            checked={u.isActive}
            disabled={self || (update.isPending && update.variables?.id === u.id)}
            aria-label={`Active: ${u.fullName}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => (e.currentTarget.checked ? setActive(u, true) : setDeactivating(u))}
          />
        );
        return self ? <Tooltip label="You cannot deactivate your own account">{<span>{toggle}</span>}</Tooltip> : toggle;
      },
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      cell: (u) =>
        u.lastLoginAt ? (
          <Tooltip label={formatDateTime(u.lastLoginAt)}>
            <Text span fz="sm" tabIndex={0}>
              {formatRelative(u.lastLoginAt)}
            </Text>
          </Tooltip>
        ) : (
          <Text span fz="sm" c="dimmed">
            Never
          </Text>
        ),
    },
    {
      key: 'locked',
      header: 'Locked until',
      cell: (u) =>
        isLocked(u) ? (
          <StatusBadge tone="warning" label={formatDateTime(u.lockedUntil)} icon={<IconLock size={12} aria-hidden />} />
        ) : (
          <Text span fz="sm" c="dimmed">
            —
          </Text>
        ),
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: 'right',
      width: 56,
      cell: (u) => (
        <Tooltip label="Edit">
          <ActionIcon aria-label={`Edit ${u.fullName}`} onClick={() => setEditing(u)}>
            <IconPencil size={16} />
          </ActionIcon>
        </Tooltip>
      ),
    },
  ];

  const filtered = query !== '' || role !== 'all' || status !== 'all';
  const total = users.data?.length ?? 0;
  const activeCount = users.data?.filter((u) => u.isActive).length ?? 0;

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to Omnia Recon and what they can do. Changing a role, deactivating or resetting a password signs that person out everywhere."
        meta={
          users.data && (
            <Text fz="sm" c="dimmed" className="tabular">
              {activeCount} active of {total}
            </Text>
          )
        }
        actions={
          <Button leftSection={<IconUserPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>
            Add user
          </Button>
        }
      />

      <FilterBar
        active={filtered}
        onReset={() => {
          setQuery('');
          setRole('all');
          setStatus('all');
        }}
      >
        <SearchInput label="Search" placeholder="Name or e-mail" value={query} onSearch={setQuery} w={260} debounceMs={150} />
        <Select
          label="Role"
          w={160}
          value={role}
          onChange={(v) => setRole((v as Role | 'all' | null) ?? 'all')}
          data={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))]}
        />
        <Select
          label="Status"
          w={140}
          value={status}
          onChange={(v) => setStatus((v as StatusFilter | null) ?? 'all')}
          data={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </FilterBar>

      <DataTable
        caption="Users"
        data={users.data ? rows : undefined}
        loading={users.isPending}
        error={users.error}
        onRetry={() => void users.refetch()}
        columns={columns}
        getRowId={(u) => u.id}
        rowTone={(u) => (isLocked(u) ? 'warning' : undefined)}
        minWidth={860}
        empty={
          filtered ? (
            <EmptyState size="sm" title="No users match these filters" description="Clear the filters to see everyone." />
          ) : (
            <EmptyState size="sm" title="No users yet" description="Add the first person who needs to sign in." />
          )
        }
      />

      <UserFormModal
        opened={adding || editing !== null}
        user={editing}
        currentUserId={me.id}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        opened={deactivating !== null}
        onClose={() => {
          setDeactivating(null);
          update.reset();
        }}
        onConfirm={() => deactivating && setActive(deactivating, false)}
        title="Deactivate user"
        message={
          deactivating
            ? `${deactivating.fullName} will be signed out on every device and will not be able to sign in until reactivated.`
            : ''
        }
        confirmLabel="Deactivate"
        tone="danger"
        loading={update.isPending}
        error={deactivating && update.isError ? errorMessage(update.error) : undefined}
      />
    </>
  );
}
