import { IconLayoutDashboard, type Icon } from '@tabler/icons-react';
import type { Capability } from '../data/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /** Hidden from roles without this capability (the route is guarded separately). */
  capability?: Capability;
  /** Match child paths too (e.g. /imports/123 highlights Imports). */
  matchPrefix?: boolean;
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

/**
 * The sidebar. A screen is added here only when its feature ships, so the navigation never
 * offers somewhere that does not exist yet.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ label: 'Overview', to: '/', icon: IconLayoutDashboard }],
  },
];
