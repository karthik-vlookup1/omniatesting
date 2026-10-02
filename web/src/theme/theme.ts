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
 * One theme for the whole product. Values are chosen for a dense, data-heavy finance tool:
 * a deep navy primary (trust, contrast), a neutral slate surface hierarchy, compact type and
 * small radii. Semantic tones (success / warning / danger / info / neutral) live in `tones.ts`.
 */

// Deep navy. Shade 7 is the primary in light mode: >= 7:1 contrast against white.
const brand: MantineColorsTuple = [
  '#eef3f9',
  '#dce5f0',
  '#b6c9de',
  '#8dabcb',
  '#6b91ba',
  '#5581b0',
  '#4878ab',
  '#386696',
  '#2e5a86',
  '#1c3d5a',
];

// Cool neutral used for surfaces, borders and secondary text.
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

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 7,
  colors: { brand, slate },
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
    ActionIcon: ActionIcon.extend({ defaultProps: { variant: 'subtle', color: 'slate.7', radius: 'sm' } }),
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
        borderColor: 'var(--mantine-color-slate-1)',
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
    navbarWidth: 248,
    headerHeight: 56,
  },
});
