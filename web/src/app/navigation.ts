import { IconHome, IconListCheck, IconUpload, IconUserCog, type Icon } from '@tabler/icons-react';
import type { Capability } from '../data/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /** Hidden from roles without this capability (the route is guarded separately). */
  capability?: Capability;
  /** Match child paths too (e.g. /review?status=… or /imports/123). */
  matchPrefix?: boolean;
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

/**
 * The sidebar, in the order of FRONTEND_REFERENCE.md §4:
 * Home · Upload statement · Review queue · Tenancies · Vico export · Xero · CSV profiles · Users.
 * A screen is added here only when its feature ships, so navigation never offers somewhere that
 * does not exist yet. The Home page reads this list to show which workflow stages are available.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { label: 'Home', to: '/', icon: IconHome },
      { label: 'Upload statement', to: '/upload', icon: IconUpload },
      { label: 'Review queue', to: '/review', icon: IconListCheck },
      { label: 'Users', to: '/users', icon: IconUserCog, capability: 'manageUsers' },
    ],
  },
];

export function navItems(): NavItem[] {
  return NAV_SECTIONS.flatMap((s) => s.items);
}
