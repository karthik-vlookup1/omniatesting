import { Text, type TextProps } from '@mantine/core';
import { formatMoney } from '../lib/format';

export interface MoneyProps extends Omit<TextProps, 'children'> {
  value: number | string | null | undefined;
  /** Colour money out (negative) red. Off by default: most columns show money in. */
  signed?: boolean;
}

/** A GBP amount with tabular figures, so columns of money line up digit for digit. */
export function Money({ value, signed, ...rest }: MoneyProps) {
  const negative = signed && Number(value) < 0;
  return (
    <Text span fz="sm" className="tabular" c={negative ? 'red.8' : undefined} {...rest}>
      {formatMoney(value)}
    </Text>
  );
}
