import { Badge, Box, Button, Group, Menu, Paper, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip, UnstyledButton, ActionIcon } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import {
  IconAdjustmentsDollar,
  IconArrowsExchange,
  IconCalendarDollar,
  IconCash,
  IconChevronDown,
  IconFileText,
  IconListDetails,
  IconReceipt,
  IconRefresh,
  IconReceiptRefund,
  IconUserDollar,
  IconWallet,
  IconWritingSign,
  IconCreditCardPay,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { tenancyAddress, tenancyLine, useTenancy } from '../../data/tenancies';
import { isApiError } from '../../lib/api';
import { useRecordTabs } from '../../lib/recordTabs';
import { useAgentosTenants } from '../agentos/api';
import { AddPayerAccountModal } from '../payer-accounts/AddPayerAccountModal';
import { usePayerAccounts } from '../payer-accounts/api';
import { useAdjustments, useReceipts } from '../receipts/api';
import { BenefitAwardModal } from '../rent-terms/BenefitAwardModal';
import { PayerSplitModal } from '../rent-terms/PayerSplitModal';
import { PaymentMethodModal } from '../rent-terms/PaymentMethodModal';
import { useRentAccount } from '../rent-terms/api';
import { formatPence } from '../rent-terms/money';
import { AccountSectionsFor } from './AccountSectionsFor';
import { AdjustmentModal, type AdjustmentKind } from './AdjustmentModal';
import { DetailsSection } from './DetailsSection';
import { JournalTransferModal } from './JournalTransferModal';
import { OverviewSection } from './OverviewSection';
import { RecordNav } from './RecordNav';
import { SetRentModal } from './SetRentModal';
import { TermsSection, StatementSection } from './TermsStatementSections';
import { parseDetailsTab, parseView, totalBalancePence, type RecordView, type RentAction } from './recordModel';

type Dialog = { kind: 'adjustment'; adjustment: AdjustmentKind } | { kind: 'journal' } | { kind: RentAction } | { kind: 'payer' } | null;

const VIEW_TITLE: Record<RecordView, string> = {
  overview: 'Overview',
  details: 'Tenant details',
  account: 'Rent account',
  receipts: 'Receipts',
  adjustments: 'Adjustments',
  payers: 'Payer accounts',
  terms: 'Rent terms',
  statement: 'Statement',
};

/**
 * The tenant record — LetMC's main screen (guide steps 3–5 and tenancy_details/*), at
 * /tenancies/:tid?view=…&tab=…. Dark record menu on the left, header with Actions ▾, a count strip
 * in place of LetMC's Calls / Emails / SMS row, then the chosen view. See plans/recon-601.md.
 */
export function TenancyRecordPage() {
  const { tid = '' } = useParams();
  const [params] = useSearchParams();
  const view = parseView(params.get('view'));
  const tab = parseDetailsTab(params.get('tab'));
  const user = useCurrentUser();
  const canWrite = can(user, 'write');
  const canFinance = can(user, 'finance');
  const qc = useQueryClient();
  const { open: openTab } = useRecordTabs();
  const [dialog, setDialog] = useState<Dialog>(null);

  const tenancy = useTenancy(tid);
  const rent = useRentAccount(tid);
  const receipts = useReceipts({ tid, status: '', page: 1 });
  const adjustments = useAdjustments(tid);
  const payers = usePayerAccounts({ tid });
  const agentos = useAgentosTenants();

  const t = tenancy.data;
  const title = t ? (t.tenantName ? `${t.tid} ${t.tenantName}` : t.tid) : tid;
  useDocumentTitle(`${title} · ${VIEW_TITLE[view]} · Omnia Recon`);

  // Opening a record adds it to the open-record tabs in the search strip (LetMC behaviour).
  useEffect(() => {
    if (t) openTab({ tid: t.tid, label: t.tenantName ? `${t.tid} ${t.tenantName}` : t.tid });
  }, [t, openTab]);

  if (tenancy.isError) {
    const notFound = isApiError(tenancy.error) && tenancy.error.status === 404;
    return (
      <Box p="lg" maw={720} mx="auto">
        {notFound ? (
          <EmptyState
            title={`No tenancy ${tid}`}
            description="Check the TID, or search by name or NI number in the search bar above."
            action={
              <Button component={Link} to="/tenancies">
                Back to tenancies
              </Button>
            }
          />
        ) : (
          <ErrorState error={tenancy.error} title="Could not open this tenancy" onRetry={() => void tenancy.refetch()} retrying={tenancy.isFetching} />
        )}
      </Box>
    );
  }

  const total = totalBalancePence(rent.data);
  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['tenancies', 'detail', tid] });
    void rent.refetch();
    void receipts.refetch();
    void adjustments.refetch();
    void payers.refetch();
    void agentos.refetch();
  };
  const refreshing = tenancy.isFetching || rent.isFetching || receipts.isFetching || adjustments.isFetching || payers.isFetching;

  return (
    <Group align="stretch" gap={0} wrap="nowrap" mih="calc(100dvh - 98px)">
      <RecordNav
        current={view}
        counts={{
          receipts: receipts.data?.total ?? null,
          adjustments: adjustments.data?.adjustments.length ?? null,
          payers: payers.data?.length ?? null,
          periods: rent.data ? rent.data.payers.reduce((n, p) => n + p.lines.length, 0) : null,
          terms: rent.data ? rent.data.schedules.length + rent.data.awards.length + rent.data.splits.length + rent.data.paymentMethods.length : null,
        }}
        header={
          <Stack gap={6}>
            <Text fz={11} fw={700} tt="uppercase" c="var(--app-topbar-muted)" style={{ letterSpacing: '0.08em' }}>
              Tenancy {tid}
            </Text>
            <Paper radius="md" p="sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Text fz="xs" c="var(--app-topbar-muted)">
                Balance
              </Text>
              {rent.isPending ? (
                <Skeleton h={26} mt={4} />
              ) : (
                <Text fz={24} fw={700} className="figure" c={total !== null && total > 0 ? '#ff9b8a' : '#7be0b6'}>
                  {total === null ? '—' : formatPence(total)}
                </Text>
              )}
              {t && (
                <Badge mt={6} size="sm" variant="light" color={t.status === 'active' ? 'teal' : 'gray'}>
                  {t.status === 'active' ? 'Active tenancy' : t.status === 'ended' ? 'Ended tenancy' : 'Pending tenancy'}
                </Badge>
              )}
            </Paper>
          </Stack>
        }
      />

      <Box style={{ flex: 1, minWidth: 0 }}>
        <CountStrip
          items={[
            { view: 'receipts', label: 'Receipts', icon: <IconReceipt size={16} />, count: receipts.data?.total },
            { view: 'adjustments', label: 'Adjustments', icon: <IconAdjustmentsDollar size={16} />, count: adjustments.data?.adjustments.length },
            { view: 'payers', label: 'Payer accounts', icon: <IconWallet size={16} />, count: payers.data?.length },
            { view: 'account', label: 'Ledger lines', icon: <IconListDetails size={16} />, count: rent.data?.payers.reduce((n, p) => n + p.lines.length, 0) },
          ]}
        />

        <Box px="xl" py="lg">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="lg" mb="lg">
            <Box miw={0}>
              {t ? (
                <>
                  <Title order={1} fz={26} fw={650} style={{ letterSpacing: '-0.01em' }}>
                    {title}
                  </Title>
                  <Text c="dimmed" fz="sm" mt={4} lineClamp={2}>
                    Tenant at {tenancyAddress(t)} · {tenancyLine(t)}
                  </Text>
                </>
              ) : (
                <Stack gap={8}>
                  <Skeleton h={28} w={280} />
                  <Skeleton h={14} w={520} />
                </Stack>
              )}
            </Box>
            <Group gap="xs" wrap="nowrap" data-print-hidden>
              <ActionsMenu canWrite={canWrite} canFinance={canFinance} onPick={setDialog} />
              <Tooltip label="Refresh this record">
                <ActionIcon variant="default" size={36} aria-label="Refresh record" onClick={refreshAll} loading={refreshing}>
                  <IconRefresh size={17} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Title order={2} fz="lg" mb="md" c="dimmed" fw={600}>
            {VIEW_TITLE[view]}
          </Title>

          {!t ? (
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              <Skeleton h={220} radius="md" />
              <Skeleton h={220} radius="md" />
              <Skeleton h={220} radius="md" />
            </SimpleGrid>
          ) : view === 'overview' ? (
            <OverviewSection tenancy={t} rent={rent} receipts={receipts} agentos={agentos} />
          ) : view === 'details' ? (
            <DetailsSection tab={tab} tenancy={t} rent={rent} receipts={receipts} payers={payers} />
          ) : view === 'terms' ? (
            <TermsSection tid={tid} rent={rent} canWrite={canWrite} onAction={(kind) => setDialog({ kind })} />
          ) : view === 'statement' ? (
            <StatementSection tid={tid} canWrite={canWrite} />
          ) : (
            <AccountSectionsFor view={view} tid={tid} rent={rent} payers={payers} canWrite={canWrite} canFinance={canFinance} onNewAdjustment={() => setDialog({ kind: 'adjustment', adjustment: 'refund' })} />
          )}
        </Box>
      </Box>

      {t && (
        <>
          <AdjustmentModal
            tid={tid}
            title={title}
            balancePence={total}
            kind={dialog?.kind === 'adjustment' ? dialog.adjustment : 'refund'}
            opened={dialog?.kind === 'adjustment'}
            onClose={() => setDialog(null)}
            key={dialog?.kind === 'adjustment' ? dialog.adjustment : 'adjustment'}
          />
          <JournalTransferModal tid={tid} title={title} opened={dialog?.kind === 'journal'} onClose={() => setDialog(null)} />
          <SetRentModal tid={tid} title={title} opened={dialog?.kind === 'rent'} onClose={() => setDialog(null)} />
          <BenefitAwardModal tid={tid} opened={dialog?.kind === 'award'} onClose={() => setDialog(null)} />
          <PayerSplitModal tid={tid} opened={dialog?.kind === 'split'} onClose={() => setDialog(null)} />
          <PaymentMethodModal tid={tid} opened={dialog?.kind === 'method'} onClose={() => setDialog(null)} />
          <AddPayerAccountModal opened={dialog?.kind === 'payer'} onClose={() => setDialog(null)} />
        </>
      )}
    </Group>
  );
}

/** LetMC's dark "No Calls + · No Emails + · No SMS + · No Actions +" strip, as Recon counts. */
function CountStrip({ items }: { items: { view: RecordView; label: string; icon: ReactNode; count: number | undefined }[] }) {
  return (
    <SimpleGrid cols={4} spacing={1} style={{ background: 'var(--app-strip-border)' }} data-print-hidden>
      {items.map((i) => (
        <UnstyledButton
          key={i.view}
          component={Link}
          to={`?view=${i.view}`}
          py={10}
          style={{ background: 'var(--app-strip-bg)', color: 'var(--app-topbar-fg)', textAlign: 'center' }}
          aria-label={`${i.count ?? 'Loading'} ${i.label}`}
        >
          <Group gap={8} justify="center" wrap="nowrap">
            {i.icon}
            <Text fz="sm" fw={600}>
              {i.count === undefined ? '…' : i.count === 0 ? `No ${i.label.toLowerCase()}` : `${i.count} ${i.label.toLowerCase()}`}
            </Text>
          </Group>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}

/**
 * LetMC's Actions ▾ (guide step 4, "Accounting" group), limited to actions Recon's API supports
 * and to the user's role. "Take a Payment" is shown disabled with the reason (plans/recon-601.md D5).
 */
function ActionsMenu({ canWrite, canFinance, onPick }: { canWrite: boolean; canFinance: boolean; onPick: (d: Dialog) => void }) {
  if (!canWrite) {
    return (
      <Tooltip label="Read-only accounts cannot change records">
        <Button variant="default" rightSection={<IconChevronDown size={16} />} disabled>
          Actions
        </Button>
      </Tooltip>
    );
  }
  return (
    <Menu position="bottom-end" width={290} shadow="lg" withinPortal>
      <Menu.Target>
        <Button rightSection={<IconChevronDown size={16} />}>Actions</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Accounting</Menu.Label>
        {canFinance && (
          <>
            <Menu.Item leftSection={<IconReceiptRefund size={16} />} onClick={() => onPick({ kind: 'adjustment', adjustment: 'refund' })}>
              Apply refund
            </Menu.Item>
            <Menu.Item leftSection={<IconWritingSign size={16} />} onClick={() => onPick({ kind: 'adjustment', adjustment: 'write_off' })}>
              Write off
            </Menu.Item>
          </>
        )}
        <Menu.Item leftSection={<IconArrowsExchange size={16} />} onClick={() => onPick({ kind: 'journal' })}>
          Journal transfer
        </Menu.Item>
        <Menu.Item
          leftSection={<IconCash size={16} />}
          disabled
          rightSection={<Text fz={10} c="dimmed">from bank lines</Text>}
          title="Recon takes payments from bank statements; use Upload statement and the review queue, then the agentOS Take a Payment export."
        >
          Take a payment
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Rent</Menu.Label>
        <Menu.Item leftSection={<IconCalendarDollar size={16} />} onClick={() => onPick({ kind: 'rent' })}>
          Set rent (make rent due)
        </Menu.Item>
        <Menu.Item leftSection={<IconUserDollar size={16} />} onClick={() => onPick({ kind: 'award' })}>
          Add benefit award
        </Menu.Item>
        <Menu.Item leftSection={<IconAdjustmentsDollar size={16} />} onClick={() => onPick({ kind: 'split' })}>
          Add payer split
        </Menu.Item>
        <Menu.Item leftSection={<IconCreditCardPay size={16} />} onClick={() => onPick({ kind: 'method' })}>
          Add payment method
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Records</Menu.Label>
        <Menu.Item leftSection={<IconWallet size={16} />} onClick={() => onPick({ kind: 'payer' })}>
          Link a payer account
        </Menu.Item>
        <Menu.Item leftSection={<IconFileText size={16} />} component={Link} to="?view=statement">
          Print statement
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
