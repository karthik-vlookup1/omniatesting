/** UK (Europe/London) time parts, with milliseconds floored to a multiple of 10 so SQL datetime stores them exactly. */
export interface UkParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
}

const FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function ukParts(at: Date): UkParts {
  const get: Record<string, number> = {};
  for (const part of FORMAT.formatToParts(at)) if (part.type !== 'literal') get[part.type] = Number(part.value);
  return {
    y: get.year!,
    mo: get.month!,
    d: get.day!,
    h: get.hour!,
    mi: get.minute!,
    s: get.second!,
    ms: Math.floor(at.getUTCMilliseconds() / 10) * 10,
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');
const p3 = (n: number) => String(n).padStart(3, '0');
const p4 = (n: number) => String(n).padStart(4, '0');

export const ukDateTimeLiteral = (p: UkParts): string =>
  `${p4(p.y)}-${p2(p.mo)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}.${p3(p.ms)}`;

/** The batch reference: push start, UK time, to the minute. */
export const batchReference = (p: UkParts): string => `${p4(p.y)}-${p2(p.mo)}-${p2(p.d)}-${p2(p.h)}-${p2(p.mi)}`;

/** 'S' + push date + a 4-digit counter that restarts at 0001 on every push. */
export const bankingRef = (p: UkParts, index: number): string => `S${p4(p.y)}${p2(p.mo)}${p2(p.d)}-${p4(index)}`;

export interface RandomSource {
  digits2(): string;
  hex8(): string;
}

const L = (n: number): string => String.fromCharCode(65 + n);

/** `[A+hour][ss][2 digits][A+month][mm][dd]-[8 hex]`: mm is the MINUTES, dd the day of the month. */
export const vecoReference = (p: UkParts, rnd: RandomSource): string =>
  `${L(p.h)}${p2(p.s)}${rnd.digits2()}${L(p.mo)}${p2(p.mi)}${p2(p.d)}-${rnd.hex8()}`;
