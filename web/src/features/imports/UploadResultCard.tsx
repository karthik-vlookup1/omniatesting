import { Alert, Button, Card, Divider, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconArrowRight, IconCircleCheck } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { UploadResponse } from '../../data/imports';
import { formatCount, formatDate, formatMoney } from '../../lib/format';
import { matchSummaryText } from './summary';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={2}>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      <Text fz="sm" fw={600} className="tabular">
        {value}
      </Text>
    </Stack>
  );
}

export interface UploadResultCardProps {
  result: UploadResponse;
  bankLabel: string;
  fileName: string;
  /** Link to the review queue for this batch, once that screen exists. */
  reviewHref?: (batchId: string) => string;
}

export function UploadResultCard({ result, bankLabel, fileName, reviewHref }: UploadResultCardProps) {
  const { import: imp, matching } = result;
  const toReview = matching ? matching.needsReview + matching.yetToTake + matching.partiallyMatched : 0;

  return (
    <Card>
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon color="teal" variant="light" size={36} radius="xl" aria-hidden>
            <IconCircleCheck size={20} />
          </ThemeIcon>
          <Stack gap={2} miw={0}>
            <Title order={2} fz="md">
              Imported {formatCount(imp.rowsInserted)} new line{imp.rowsInserted === 1 ? '' : 's'}
            </Title>
            <Text fz="sm" c="dimmed" truncate>
              {bankLabel} · {fileName} · {formatDate(imp.periodFrom)} – {formatDate(imp.periodTo)}
            </Text>
          </Stack>
        </Group>

        {matching ? (
          <Alert color={toReview > 0 ? 'yellow' : 'teal'} variant="light" p="sm">
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Text fz="sm" fw={500} data-testid="match-summary" className="tabular">
                {matchSummaryText(matching)}
              </Text>
              {reviewHref && toReview > 0 && (
                <Button component={Link} to={reviewHref(imp.batchId)} size="xs" rightSection={<IconArrowRight size={14} aria-hidden />}>
                  Review these lines
                </Button>
              )}
            </Group>
          </Alert>
        ) : (
          <Alert color="orange" icon={<IconAlertTriangle size={18} aria-hidden />} title="Matching did not run">
            <Text fz="sm">The statement was imported. Its lines will be matched when matching is run again.</Text>
          </Alert>
        )}

        <Divider />
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" verticalSpacing="md">
          <Fact label="Rows in file" value={formatCount(imp.rowsTotal)} />
          <Fact label="New lines" value={formatCount(imp.rowsInserted)} />
          <Fact label="Duplicates skipped" value={formatCount(imp.rowsDuplicate)} />
          <Fact label="Rows skipped" value={formatCount(imp.rowsSkipped)} />
          <Fact label="Money in" value={formatMoney(imp.moneyIn)} />
          <Fact label="Money out" value={formatMoney(imp.moneyOut)} />
          <Fact label="With TID" value={formatCount(imp.withTid)} />
          <Fact label="With NI / payer account" value={`${formatCount(imp.withNi)} / ${formatCount(imp.withPayerAccount)}`} />
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
