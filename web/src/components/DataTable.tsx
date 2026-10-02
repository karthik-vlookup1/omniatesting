import { Paper, Table, Text, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { memo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { TONE_COLOR, type Tone } from '../theme';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers and money are right-aligned; everything else defaults to left. */
  align?: 'left' | 'right' | 'center';
  width?: CSSProperties['width'];
  /**
   * Truncate to one line with an ellipsis. `tooltip` supplies the full text shown on hover/focus,
   * so nothing is ever hidden without a way to read it.
   */
  truncate?: { tooltip: (row: T) => string | null | undefined };
  /** Server-side sorting: the table only reports the requested order. */
  sortable?: boolean;
}

export interface DataTableProps<T> {
  data: readonly T[] | undefined;
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T) => string;
  /** Short description for screen readers, e.g. "Bank transactions". */
  caption: string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Rendered when `data` is an empty array. */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Accessible name for a row when it is clickable, e.g. "Open transaction 12 Oct, £450.00". */
  rowLabel?: (row: T) => string;
  /** A coloured left edge marking row state (e.g. needs review). Always paired with a text status. */
  rowTone?: (row: T) => Tone | undefined;
  selectedRowId?: string | null;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** Width at which the table scrolls horizontally instead of squashing columns. */
  minWidth?: number;
  /** Height at which the body scrolls under a sticky header. */
  maxHeight?: CSSProperties['maxHeight'];
}

function SortHeader({
  label,
  columnKey,
  sort,
  onSortChange,
  align,
}: {
  label: ReactNode;
  columnKey: string;
  sort: SortState | null | undefined;
  onSortChange: (s: SortState) => void;
  align: 'left' | 'right' | 'center';
}) {
  const active = sort?.key === columnKey;
  const Icon = !active ? IconArrowsSort : sort.direction === 'asc' ? IconArrowUp : IconArrowDown;
  return (
    <UnstyledButton
      onClick={() =>
        onSortChange({ key: columnKey, direction: active && sort.direction === 'asc' ? 'desc' : 'asc' })
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      {label}
      <Icon size={13} stroke={2} aria-hidden style={{ opacity: active ? 1 : 0.45 }} />
    </UnstyledButton>
  );
}

function DataTableInner<T>({
  data,
  columns,
  getRowId,
  caption,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  rowLabel,
  rowTone,
  selectedRowId,
  sort,
  onSortChange,
  minWidth = 720,
  maxHeight = 'calc(100dvh - 280px)',
}: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !data) {
    return (
      <Paper withBorder p="sm">
        <LoadingState variant="skeleton" label={`Loading ${caption.toLowerCase()}`} />
      </Paper>
    );
  }

  const rows = data ?? [];

  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }} aria-busy={loading || undefined}>
      <Table.ScrollContainer minWidth={minWidth} maxHeight={maxHeight} type="native">
        <Table stickyHeader striped={false} layout="auto">
          <VisuallyHidden component="caption">{caption}</VisuallyHidden>
          <Table.Thead>
            <Table.Tr>
              {columns.map((col) => {
                const align = col.align ?? 'left';
                const ariaSort =
                  col.sortable && sort?.key === col.key
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined;
                return (
                  <Table.Th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    style={{
                      width: col.width,
                      textAlign: align,
                      whiteSpace: 'nowrap',
                      background: 'var(--app-surface-subtle)',
                      color: 'var(--mantine-color-dimmed)',
                      fontSize: 'var(--mantine-font-size-xs)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      zIndex: 1,
                    }}
                  >
                    {col.sortable && onSortChange ? (
                      <SortHeader label={col.header} columnKey={col.key} sort={sort} onSortChange={onSortChange} align={align} />
                    ) : (
                      col.header
                    )}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length} p={0}>
                  {empty ?? <EmptyState size="sm" title="Nothing to show" description="No records match these filters." />}
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row) => {
                const id = getRowId(row);
                const tone = rowTone?.(row);
                const clickable = Boolean(onRowClick);
                const selected = selectedRowId === id;
                return (
                  <Table.Tr
                    key={id}
                    data-focusable={clickable || undefined}
                    data-selected={selected || undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? rowLabel?.(row) : undefined}
                    aria-selected={clickable ? selected : undefined}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    onKeyDown={clickable ? (e) => onKeyDown(e, row) : undefined}
                    bg={selected ? 'var(--mantine-primary-color-light)' : undefined}
                    style={{
                      cursor: clickable ? 'pointer' : undefined,
                      boxShadow: tone ? `inset 3px 0 0 var(--mantine-color-${TONE_COLOR[tone]}-6)` : undefined,
                    }}
                  >
                    {columns.map((col) => {
                      const content = col.cell(row);
                      const align = col.align ?? 'left';
                      if (col.truncate) {
                        const full = col.truncate.tooltip(row);
                        return (
                          <Table.Td key={col.key} style={{ textAlign: align, maxWidth: col.width ?? 280 }}>
                            <Tooltip label={full} disabled={!full}>
                              <Text fz="sm" truncate="end" tabIndex={full ? 0 : undefined}>
                                {content}
                              </Text>
                            </Tooltip>
                          </Table.Td>
                        );
                      }
                      return (
                        <Table.Td
                          key={col.key}
                          style={{ textAlign: align, whiteSpace: align === 'right' ? 'nowrap' : undefined }}
                          className={align === 'right' ? 'tabular' : undefined}
                        >
                          {content}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

/** The product's one table: sticky header, aligned numbers, truncation with tooltips, row states. */
export const DataTable = memo(DataTableInner) as typeof DataTableInner;
