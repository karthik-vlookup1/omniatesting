import { Box, Combobox, Group, Loader, ScrollArea, Text, TextInput, ThemeIcon, useCombobox } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconHomeSearch, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tenancyAddress, tenancyLine, useTenancySearch, type TenancySummary } from '../../data/tenancies';
import { errorMessage } from '../../lib/api';
import { useRecordTabs } from '../../lib/recordTabs';

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

/**
 * LetMC's search box (guide steps 1–2): type a TID, tenant name or full NI number, pick a result,
 * and the tenant record opens in a new record tab. Enter with nothing highlighted opens the full
 * Tenancies list filtered by the text. Uses GET /api/tenancies?q=&status=all.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { open: openTab } = useRecordTabs();
  const [value, setValue] = useState('');
  const [debounced] = useDebouncedValue(value.trim(), 250);
  const enabled = debounced.length >= MIN_CHARS;
  const search = useTenancySearch(debounced, 'all', { enabled });
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

  const results = enabled ? (search.data ?? []).slice(0, MAX_RESULTS) : [];
  const total = enabled ? (search.data?.length ?? 0) : 0;

  const openRecord = (t: TenancySummary) => {
    openTab({ tid: t.tid, label: t.tenantName ? `${t.tid} ${t.tenantName}` : t.tid });
    navigate(`/tenancies/${encodeURIComponent(t.tid)}`);
    setValue('');
    combobox.closeDropdown();
  };

  const openList = () => {
    const q = value.trim();
    if (!q) return;
    navigate(`/tenancies?q=${encodeURIComponent(q)}&status=all`);
    setValue('');
    combobox.closeDropdown();
  };

  return (
    <Combobox
      store={combobox}
      width={560}
      position="bottom-start"
      offset={6}
      shadow="lg"
      onOptionSubmit={(tid) => {
        const t = results.find((r) => r.tid === tid);
        if (t) openRecord(t);
      }}
    >
      <Combobox.Target>
        <TextInput
          aria-label="Search tenancies by TID, name or NI number"
          placeholder="Search TID, name or NI…"
          value={value}
          w={300}
          size="sm"
          leftSection={<IconSearch size={16} stroke={2} aria-hidden />}
          rightSection={search.isFetching && enabled ? <Loader size={14} color="gray.4" /> : null}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => value.trim() && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && combobox.getSelectedOptionIndex() < 0) {
              e.preventDefault();
              openList();
            }
            if (e.key === 'Escape') setValue('');
          }}
          styles={{
            input: {
              background: 'var(--app-strip-field)',
              borderColor: 'var(--app-strip-border)',
              color: 'var(--app-topbar-fg)',
            },
            section: { color: 'var(--app-topbar-muted)' },
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={!value.trim()}>
        <Combobox.Options aria-label="Search results">
          <ScrollArea.Autosize mah={420} type="scroll">
            {!enabled && <Combobox.Empty>Type at least {MIN_CHARS} characters</Combobox.Empty>}
            {enabled && search.isError && (
              <Combobox.Empty>
                <Text fz="sm" c="red">
                  Search failed: {errorMessage(search.error)}
                </Text>
              </Combobox.Empty>
            )}
            {enabled && search.isPending && <Combobox.Empty>Searching…</Combobox.Empty>}
            {enabled && search.isSuccess && results.length === 0 && (
              <Combobox.Empty>No tenancy matches “{debounced}”</Combobox.Empty>
            )}
            {results.map((t) => (
              <Combobox.Option value={t.tid} key={t.tid} aria-label={`Tenant ${t.tid} ${t.tenantName ?? ''}`.trim()}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <ThemeIcon variant="light" color="ember" size={30} radius="md" mt={2} aria-hidden>
                    <IconHomeSearch size={17} />
                  </ThemeIcon>
                  <Box miw={0}>
                    <Text fz="sm" lh={1.35}>
                      Tenant{' '}
                      <Text span fw={700}>
                        {t.tid}
                      </Text>{' '}
                      {t.tenantName ?? <Text span c="dimmed">(no tenant name)</Text>}
                    </Text>
                    <Text fz="xs" c="dimmed" lh={1.4} lineClamp={1}>
                      {tenancyAddress(t)}
                    </Text>
                    <Text fz="xs" c="dimmed" lh={1.4} lineClamp={1}>
                      {tenancyLine(t)}
                    </Text>
                  </Box>
                </Group>
              </Combobox.Option>
            ))}
          </ScrollArea.Autosize>
        </Combobox.Options>
        {total > MAX_RESULTS && (
          <Combobox.Footer>
            <Text fz="xs" c="dimmed">
              Showing {MAX_RESULTS} of {total}. Press Enter to see them all.
            </Text>
          </Combobox.Footer>
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}
