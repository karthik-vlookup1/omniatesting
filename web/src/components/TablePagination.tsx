import { Group, Pagination, Text } from '@mantine/core';
import { formatCount } from '../lib/format';

export interface TablePaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** "Showing 51–100 of 1,240" plus page controls. Hidden when everything fits on one page. */
export function TablePagination({ page, pageSize, total, onPageChange }: TablePaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <Group justify="space-between" mt="sm" gap="sm" wrap="wrap">
      <Text fz="xs" c="dimmed" className="tabular" aria-live="polite">
        Showing {formatCount(from)}–{formatCount(to)} of {formatCount(total)}
      </Text>
      {pages > 1 && (
        <Pagination
          size="sm"
          total={pages}
          value={page}
          onChange={onPageChange}
          withEdges={pages > 7}
          getControlProps={(control) => ({ 'aria-label': `${control} page` })}
        />
      )}
    </Group>
  );
}
