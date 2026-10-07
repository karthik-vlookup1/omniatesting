import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  Modal,
  NavLink,
  Notification,
  Paper,
  PasswordInput,
  Select,
  Table,
  Textarea,
  TextInput,
  Tooltip,
  createTheme,
  type MantineColorsTuple,
} from '@mantine/core';

/**
 * One theme for the whole product. Values are chosen for a dense, data-heavy finance tool.
 * LetMC-style frame (recon-601, plans/recon-601.md D1): a navy primary for the top bar and primary
 * actions (white on navy-8 is about 8:1) and an orange "ember" accent for the active module, active
 * tab and highlights, so LetMC users feel at home. Ember is never used for small text on white.
 * A neutral slate scale, compact type and small radii. Works in light and dark colour schemes.
 * Semantic tones (success / warning / danger / info / neutral) live in `tones.ts`.
 */

// Cool neutral used for light-mode surfaces, borders and the neutral tone.
const slate: MantineColorsTuple = [
  '#f6f8fa',
  '#eef1f5',
  '#dde3ea',
  '#c6cfda',
  '#a3b0c0',
  '#7d8b9e',
  '#5f6d80',
  '#4a5667',
  '#343e4c',
  '#1f2733',
];

// Primary: deep navy. Shade 8 on white is about 8:1; shade 4 on dark-7 keeps AA in dark mode.
const navy: MantineColorsTuple = [
  '#eef2fa',
  '#dbe3f2',
  '#b5c5e2',
  '#8ca4d1',
  '#6a88c3',
  '#5476ba',
  '#486cb7',
  '#3a5ba1',
  '#2f4f8f',
  '#1f3b70',
];

// Accent: a LetMC-like orange for indicators, and for fills with white text at shade 7 and up.
const ember: MantineColorsTuple = [
  '#fff1ea',
  '#ffe1d3',
  '#fcc0a4',
  '#f99c72',
  '#f67e47',
  '#f56a2c',
  '#f45f1d',
  '#d94e10',
  '#c2440c',
  '#a93907',
];

export const theme = createTheme({
  primaryColor: 'navy',
  primaryShade: { light: 8, dark: 4 },
  colors: { slate, navy, ember },
  white: '#ffffff',
  black: '#1f2733',
  autoContrast: true,
  focusRing: 'auto',
  cursorType: 'pointer',
  respectReducedMotion: true,
  fontSmoothing: true,

  fontFamily:
    "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif",
  fontFamilyMonospace: "'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  fontSizes: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem', lg: '1rem', xl: '1.125rem' },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.5', lg: '1.5', xl: '1.4' },
  headings: {
    fontFamily:
      "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif",
    fontWeight: '650',
    textWrap: 'pretty',
    sizes: {
      h1: { fontSize: '1.5rem', lineHeight: '1.25' },
      h2: { fontSize: '1.25rem', lineHeight: '1.3' },
      h3: { fontSize: '1rem', lineHeight: '1.35' },
      h4: { fontSize: '0.875rem', lineHeight: '1.4' },
      h5: { fontSize: '0.8125rem', lineHeight: '1.4' },
      h6: { fontSize: '0.75rem', lineHeight: '1.4' },
    },
  },

  defaultRadius: 'sm',
  radius: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
  spacing: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  shadows: {
    xs: '0 1px 2px rgba(31, 39, 51, 0.06)',
    sm: '0 1px 3px rgba(31, 39, 51, 0.08), 0 1px 2px rgba(31, 39, 51, 0.04)',
    md: '0 4px 10px rgba(31, 39, 51, 0.08), 0 2px 4px rgba(31, 39, 51, 0.04)',
    lg: '0 10px 24px rgba(31, 39, 51, 0.10), 0 4px 8px rgba(31, 39, 51, 0.05)',
    xl: '0 18px 40px rgba(31, 39, 51, 0.14)',
  },

  components: {
    AppShell: AppShell.extend({ defaultProps: { padding: 'lg' } }),
    Button: Button.extend({ defaultProps: { size: 'sm', radius: 'sm' } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { variant: 'subtle', color: 'gray', radius: 'sm' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'sm' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'sm' } }),
    Select: Select.extend({ defaultProps: { size: 'sm', allowDeselect: false } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'sm', rows: 3 } }),
    Badge: Badge.extend({
      defaultProps: { variant: 'light', radius: 'sm', size: 'md' },
      styles: { root: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 } },
    }),
    Card: Card.extend({ defaultProps: { withBorder: true, radius: 'md', padding: 'lg', shadow: 'xs' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'md' } }),
    Table: Table.extend({
      defaultProps: {
        verticalSpacing: 'xs',
        horizontalSpacing: 'sm',
        fz: 'sm',
        highlightOnHover: true,
        tabularNums: true,
        borderColor: 'var(--app-border-subtle)',
      },
    }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true, openDelay: 300, multiline: true, maw: 360 } }),
    Modal: Modal.extend({
      defaultProps: { centered: true, radius: 'md', overlayProps: { backgroundOpacity: 0.4, blur: 1 } },
    }),
    Alert: Alert.extend({ defaultProps: { variant: 'light', radius: 'md' } }),
    Notification: Notification.extend({ defaultProps: { radius: 'md', withBorder: true } }),
    NavLink: NavLink.extend({ defaultProps: { variant: 'light' } }),
  },

  other: {
    /** Fixed widths so every page lines up. */
    contentMaxWidth: 1440,
    navbarWidth: 240,
    /** LetMC-style header: top bar (modules) + search strip (global search, open-record tabs). */
    topBarHeight: 52,
    searchStripHeight: 46,
    headerHeight: 98,
  },
});
