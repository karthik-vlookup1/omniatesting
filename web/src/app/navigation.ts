import {
  IconBuilding,
  IconBuildingBank,
  IconCreditCard,
  IconFileExport,
  IconFileImport,
  IconFileSpreadsheet,
  IconHome,
  IconHome2,
  IconLayoutDashboard,
  IconListCheck,
  IconReceipt,
  IconReceipt2,
  IconSend,
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
      { label: 'Dashboard', to: '/dashboard', icon: IconLayoutDashboard },
      { label: 'Upload statement', to: '/upload', icon: IconUpload },
      { label: 'Review queue', to: '/review', icon: IconListCheck },
      { label: 'Receipts', to: '/receipts', icon: IconReceipt, capability: 'finance' },
      { label: 'Tenancies', to: '/tenancies', icon: IconUsers },
      { label: 'Rent', to: '/rent', icon: IconReceipt2 },
      { label: 'Properties', to: '/properties', icon: IconHome2 },
      { label: 'Landlords', to: '/landlords', icon: IconUserStar },
      { label: 'Branches', to: '/branches', icon: IconBuilding },
      { label: 'Bank accounts', to: '/bank-accounts', icon: IconCreditCard },
      { label: 'Payer accounts', to: '/payer-accounts', icon: IconWallet },
      { label: 'Vico export', to: '/vico', icon: IconFileExport, capability: 'finance' },
      { label: 'Statement download', to: '/export/statement', icon: IconFileSpreadsheet, capability: 'write' },
      { label: 'agentOS receipts', to: '/agentos', icon: IconFileImport, matchPrefix: true },
      { label: 'Xero', to: '/xero', icon: IconSend, capability: 'finance' },
      { label: 'CSV profiles', to: '/csv-profiles', icon: IconBuildingBank },
      { label: 'LetMC import', to: '/letmc-import', icon: IconFileImport, capability: 'finance' },
      { label: 'Users', to: '/users', icon: IconUserCog, capability: 'manageUsers' },
    ],
  },
];

export function navItems(): NavItem[] {
  return NAV_SECTIONS.flatMap((s) => s.items);
}
