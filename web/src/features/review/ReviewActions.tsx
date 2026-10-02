import { Alert, Badge, Button, Group, Kbd, Paper, Stack, Text, Title } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBan, IconCheck, IconPlus, IconRotate, IconSearch, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { can, useCurrentUser } from '../../data/auth';
import { useIncludeLine, useRejectSuggestion } from '../../data/review';
import { PAYER_LABEL, methodLabel, type BankLine, type Suggestion } from '../../data/transactions';
import { errorMessage } from '../../lib/api';
import type { LineActionsProps } from '../transactions/LineDrawer';
import { ConfidenceBadge } from '../transactions/badges';
import { ConfirmMatchForm, type MatchTarget } from './ConfirmMatchForm';
import { ExcludeForm } from './ExcludeForm';
import { TenancyPicker } from './TenancyPicker';

type Panel = { kind: 'confirm'; target: MatchTarget } | { kind: 'pick' } | { kind: 'exclude' } | null;

function SuggestionCard({
  s,
  actionable,
  onAccept,
  onReject,
  rejecting,
}: {
  s: Suggestion;
  actionable: boolean;
  onAccept: () => void;
  onReject: () => void;
  rejecting: boolean;
}) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Stack gap={2} miw={0}>
          <Group gap={6} wrap="nowrap">
            <Text fz="sm" fw={600} ff="monospace">
              {s.tid}
            </Text>
            <Text fz="sm" truncate>
              {s.tenantName ?? 'Unknown tenant'}
            </Text>
          </Group>
          <Text fz="xs" c="dimmed">
            {methodLabel(s.method)} · {PAYER_LABEL[s.payer]}
          </Text>
          {s.reason && (
            <Text fz="xs" c="dimmed">
              {s.reason}
            </Text>
          )}
        </Stack>
        <Stack gap={6} align="flex-end">
          <ConfidenceBadge suggestion={s} />
          {actionable && s.status === 'open' ? (
            <Group gap={4} wrap="nowrap">
              <Button size="compact-xs" variant="default" leftSection={<IconX size={12} aria-hidden />} onClick={onReject} loading={rejecting} aria-label={`Reject ${s.tid}`}>
                Reject
              </Button>
              <Button size="compact-xs" leftSection={<IconCheck size={12} aria-hidden />} onClick={onAccept} aria-label={`Accept ${s.tid}`}>
                Accept
              </Button>
            </Group>
          ) : (
            s.status !== 'open' && (
              <Badge size="sm" variant="outline" color={s.status === 'accepted' ? 'green' : 'gray'}>
                {s.status === 'accepted' ? 'Accepted' : 'Rejected'}
              </Badge>
            )
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

/**
 * The decisions a writer can take on one bank line (FRONTEND_REFERENCE.md §6.1), plugged into the
 * line drawer. Read-only users see the suggestions without buttons. Keyed by line so an open form
 * never carries over when j / k moves to another line.
 */
export function ReviewActions(props: LineActionsProps) {
  return <LineDecisions key={props.line.id} {...props} />;
}

function LineDecisions({ line, onDone }: LineActionsProps) {
  const user = useCurrentUser();
  const writer = can(user, 'write');
  const reject = useRejectSuggestion();
  const include = useIncludeLine();
  const [panel, setPanel] = useState<Panel>(line.status === 'yet_to_take' && writer ? { kind: 'pick' } : null);

  const moneyOut = Number(line.amount) <= 0;
  const matchable = writer && !moneyOut && (line.status === 'needs_review' || line.status === 'yet_to_take' || line.status === 'partially_matched' || line.status === 'new');
  const open = line.suggestions.filter((s) => s.status === 'open');
  const decided = line.suggestions.filter((s) => s.status !== 'open');
  const top = open[0];
  // The server refuses to exclude a line that already has receipts (matched or part matched).
  const excludable = writer && line.status !== 'matched' && line.status !== 'partially_matched';

  const finish = (updated: BankLine) => {
    setPanel(null);
    onDone(updated);
  };

  useHotkeys([
    ['a', () => matchable && top && setPanel({ kind: 'confirm', target: { kind: 'suggestion', suggestion: top } })],
    ['x', () => excludable && setPanel({ kind: 'exclude' })],
  ]);

  const rejectOne = (s: Suggestion) =>
    reject.mutate(
      { lineId: line.id, suggestionId: s.id },
      {
        onSuccess: (updated) => {
          notifications.show({
            color: 'teal',
            title: 'Suggestion rejected',
            message: updated.status === 'yet_to_take' ? `${s.tid} rejected. No suggestions left: the line is now yet to take.` : `${s.tid} rejected.`,
          });
          // Stay on the line while other suggestions remain to decide.
          if (updated.suggestions.some((x) => x.status === 'open')) return;
          setPanel({ kind: 'pick' });
        },
        onError: (err) => notifications.show({ color: 'red', title: 'Could not reject', message: errorMessage(err) }),
      },
    );

  const includeAgain = () =>
    include.mutate(
      { lineId: line.id },
      {
        onSuccess: (updated) => {
          notifications.show({
            color: 'teal',
            title: 'Line included again',
            message: updated.status === 'matched' ? 'It was matched automatically.' : 'It is back in the review queue.',
          });
          onDone(updated);
        },
      },
    );

  if (line.status === 'excluded') {
    return (
      <Stack gap="sm">
        <Title order={3} fz="sm">
          Excluded line
        </Title>
        {writer && !moneyOut && (
          <>
            <Text fz="sm" c="dimmed">
              Including it again re-runs matching: it may be matched automatically or come back for review.
            </Text>
            {include.isError && (
              <Alert color="red" role="alert" p="xs">
                {errorMessage(include.error)}
              </Alert>
            )}
            <Group>
              <Button variant="default" leftSection={<IconRotate size={16} aria-hidden />} onClick={includeAgain} loading={include.isPending}>
                Include again
              </Button>
            </Group>
          </>
        )}
        {moneyOut && (
          <Text fz="sm" c="dimmed">
            Money going out stays excluded.
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3} fz="sm">
          {line.status === 'matched' ? 'Suggestions' : 'Decide this line'}
        </Title>
        {matchable && (
          <Text fz="xs" c="dimmed">
            <Kbd size="xs">a</Kbd> accept top · <Kbd size="xs">x</Kbd> exclude
          </Text>
        )}
      </Group>

      {moneyOut && line.status !== 'matched' && (
        <Alert color="gray" variant="light" p="sm">
          <Text fz="sm">Money going out cannot be matched to rent. Exclude it with a reason, e.g. “Bank charge”.</Text>
        </Alert>
      )}
      {!writer && line.status !== 'matched' && (
        <Text fz="sm" c="dimmed">
          Your role can view lines but not decide them.
        </Text>
      )}

      {open.length > 0 ? (
        <Stack gap="xs">
          {open.map((s) =>
            panel?.kind === 'confirm' && panel.target.kind === 'suggestion' && panel.target.suggestion.id === s.id ? (
              <ConfirmMatchForm key={s.id} line={line} target={panel.target} onCancel={() => setPanel(null)} onDone={finish} />
            ) : (
              <SuggestionCard
                key={s.id}
                s={s}
                actionable={matchable}
                onAccept={() => setPanel({ kind: 'confirm', target: { kind: 'suggestion', suggestion: s } })}
                onReject={() => rejectOne(s)}
                rejecting={reject.isPending && reject.variables?.suggestionId === s.id}
              />
            ),
          )}
        </Stack>
      ) : (
        line.status !== 'matched' && (
          <Text fz="sm" c="dimmed">
            No suggestions for this line{line.status === 'yet_to_take' ? ': find the tenancy below.' : '.'}
          </Text>
        )
      )}

      {matchable && (
        <>
          {panel?.kind === 'pick' ? (
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fz="sm" fw={600}>
                    Pick another tenancy
                  </Text>
                  {open.length > 0 && (
                    <Button size="compact-xs" variant="subtle" onClick={() => setPanel(null)}>
                      Close
                    </Button>
                  )}
                </Group>
                <TenancyPicker onPick={(t) => setPanel({ kind: 'confirm', target: { kind: 'tid', tid: t.tid, tenantName: t.tenantName } })} />
              </Stack>
            </Paper>
          ) : panel?.kind === 'confirm' && panel.target.kind === 'tid' ? (
            <ConfirmMatchForm line={line} target={panel.target} onCancel={() => setPanel({ kind: 'pick' })} onDone={finish} />
          ) : (
            <Group>
              <Button variant="default" size="xs" leftSection={<IconSearch size={14} aria-hidden />} onClick={() => setPanel({ kind: 'pick' })}>
                Pick another tenancy
              </Button>
            </Group>
          )}
        </>
      )}

      {excludable && (
        panel?.kind === 'exclude' ? (
          <ExcludeForm line={line} onCancel={() => setPanel(null)} onDone={finish} />
        ) : (
          <Group>
            <Button variant="subtle" color="gray" size="xs" leftSection={<IconBan size={14} aria-hidden />} onClick={() => setPanel({ kind: 'exclude' })}>
              Exclude
            </Button>
          </Group>
        )
      )}

      {decided.length > 0 && (
        <Stack gap="xs">
          <Text fz="xs" c="dimmed" fw={600} tt="uppercase">
            Already decided
          </Text>
          {decided.map((s) => (
            <SuggestionCard key={s.id} s={s} actionable={false} onAccept={() => {}} onReject={() => {}} rejecting={false} />
          ))}
        </Stack>
      )}

      {line.status === 'partially_matched' && (
        <Text fz="xs" c="dimmed">
          <IconPlus size={12} aria-hidden /> Part matched: confirm another tenancy for the remaining amount.
        </Text>
      )}
    </Stack>
  );
}
