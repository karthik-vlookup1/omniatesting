import {
  IconBuilding,
  IconBuildingBank,
  IconCalculator,
  IconCreditCard,
  IconFileExport,
  IconFileImport,
  IconFileSpreadsheet,
  IconHome,
  IconHome2,
  IconKey,
  IconLayoutDashboard,
  IconListCheck,
  IconReceipt,
  IconReceipt2,
  IconSend,
  IconSettings,
  IconUpload,
  IconUserCog,
  IconUserStar,
  IconUsers,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';
import type { Capability } from '../data/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /** Hidden from roles without this capability (the route is guarded separately). */
  capability?: Capability;
  /** Match child paths too (e.g. /tenancies/1234 or /rent/1234). */
  matchPrefix?: boolean;
}

export type ModuleKey = 'dashboard' | 'lettings' | 'accounts' | 'office';

/** A LetMC-style top-bar module and the pages it groups (plans/recon-601.md "Modules"). */
export interface NavModule {
  key: ModuleKey;
  label: string;
  icon: Icon;
  items: NavItem[];
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

/**
 * The four top-bar modules, in LetMC order. LetMC's Diary, Inbox, Leads, Sales and Maintenance
 * have no Recon backend, so they are deliberately absent (plans/recon-601.md D5).
 * A screen is added here only when its feature ships, so navigation never offers somewhere that
 * does not exist yet. The Home page reads this list to show which workflow stages are available.
 */
export const MODULES: NavModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: IconLayoutDashboard,
    items: [
      { label: 'Home', to: '/', icon: IconHome },
      { label: 'Dashboard', to: '/dashboard', icon: IconLayoutDashboard },
    ],
  },
  {
    key: 'lettings',
    label: 'Lettings',
    icon: IconKey,
    items: [
      { label: 'Tenancies', to: '/tenancies', icon: IconUsers, matchPrefix: true },
      { label: 'Rent', to: '/rent', icon: IconReceipt2, matchPrefix: true },
      { label: 'Properties', to: '/properties', icon: IconHome2 },
      { label: 'Landlords', to: '/landlords', icon: IconUserStar },
      { label: 'Payer accounts', to: '/payer-accounts', icon: IconWallet },
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: IconCalculator,
    items: [
      { label: 'Upload statement', to: '/upload', icon: IconUpload },
      { label: 'Review queue', to: '/review', icon: IconListCheck },
      { label: 'Receipts', to: '/receipts', icon: IconReceipt, capability: 'finance' },
      { label: 'agentOS receipts', to: '/agentos', icon: IconFileImport, matchPrefix: true },
      { label: 'Vico export', to: '/vico', icon: IconFileExport, capability: 'finance' },
      { label: 'Xero', to: '/xero', icon: IconSend, capability: 'finance' },
      { label: 'Statement download', to: '/export/statement', icon: IconFileSpreadsheet, capability: 'write' },
    ],
  },
  {
    key: 'office',
    label: 'Office',
    icon: IconSettings,
    items: [
      { label: 'Users', to: '/users', icon: IconUserCog, capability: 'manageUsers' },
      { label: 'Branches', to: '/branches', icon: IconBuilding },
      { label: 'Bank accounts', to: '/bank-accounts', icon: IconCreditCard },
      { label: 'CSV profiles', to: '/csv-profiles', icon: IconBuildingBank },
      { label: 'LetMC import', to: '/letmc-import', icon: IconFileImport, capability: 'finance' },
    ],
  },
];

/** The left "Sections" menu: one group per module (every link stays reachable from any page). */
export const NAV_SECTIONS: NavSection[] = MODULES.map((m) => ({ label: m.label, items: m.items }));

export function navItems(): NavItem[] {
  return MODULES.flatMap((m) => m.items);
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return item.matchPrefix ? pathname === item.to || pathname.startsWith(`${item.to}/`) : pathname === item.to;
}

/** The module the current page belongs to (highlighted in the top bar), or null for e.g. 404. */
export function moduleForPath(pathname: string): NavModule | null {
  return MODULES.find((m) => m.items.some((i) => isItemActive(i, pathname))) ?? null;
}

/** Tenant record pages show the record's own left menu instead of the Sections menu. */
export function isRecordPath(pathname: string): boolean {
  return /^\/tenancies\/[^/]+/.test(pathname);
}
