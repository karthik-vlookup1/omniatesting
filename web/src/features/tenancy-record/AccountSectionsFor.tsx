import type { UseQueryResult } from '@tanstack/react-query';
import type { PayerAccount } from '../payer-accounts/api';
import type { RentAccount } from '../rent-terms/api';
import { AdjustmentsSection, PayerAccountsSection, ReceiptsSection, RentAccountSection } from './AccountSections';
import type { RecordView } from './recordModel';

interface Props {
  view: RecordView;
  tid: string;
  rent: UseQueryResult<RentAccount>;
  payers: UseQueryResult<PayerAccount[]>;
  canWrite: boolean;
  canFinance: boolean;
  onNewAdjustment: () => void;
}

/** Picks the account view (ledger, receipts, adjustments, payer accounts) for the record page. */
export function AccountSectionsFor({ view, tid, rent, payers, canWrite, canFinance, onNewAdjustment }: Props) {
  switch (view) {
    case 'account':
      return <RentAccountSection rent={rent} />;
    case 'receipts':
      return <ReceiptsSection tid={tid} canOpenReceipts={canFinance} />;
    case 'adjustments':
      return <AdjustmentsSection tid={tid} canAdjust={canFinance} onNew={onNewAdjustment} />;
    case 'payers':
      return <PayerAccountsSection payers={payers} canWrite={canWrite} />;
    default:
      return null;
  }
}
