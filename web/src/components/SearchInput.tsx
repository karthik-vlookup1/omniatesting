import { CloseButton, TextInput, type TextInputProps } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';

export interface SearchInputProps extends Omit<TextInputProps, 'value' | 'onChange' | 'defaultValue'> {
  value: string;
  /** Called after typing pauses for `debounceMs`, and immediately on clear. */
  onSearch: (value: string) => void;
  debounceMs?: number;
}

/** A search box that does not fire a request per keystroke. */
export function SearchInput({ value, onSearch, debounceMs = 300, label, placeholder, ...rest }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const debounced = useDebouncedCallback(onSearch, debounceMs);

  // Follow external changes (e.g. the URL filter was reset), adjusting state during render.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  return (
    <TextInput
      type="search"
      label={label}
      aria-label={label ? undefined : (placeholder ?? 'Search')}
      placeholder={placeholder ?? 'Search'}
      leftSection={<IconSearch size={15} aria-hidden />}
      value={draft}
      onChange={(e) => {
        setDraft(e.currentTarget.value);
        debounced(e.currentTarget.value.trim());
      }}
      rightSection={
        draft ? (
          <CloseButton
            size="sm"
            aria-label="Clear search"
            onClick={() => {
              setDraft('');
              onSearch('');
            }}
          />
        ) : null
      }
      {...rest}
    />
  );
}
