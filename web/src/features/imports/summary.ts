import type { MatchSummary } from '../../data/imports';
import { formatCount } from '../../lib/format';

/** The sentence FRONTEND_REFERENCE.md §5.5 asks for after an upload. */
export function matchSummaryText(m: MatchSummary): string {
  return `${formatCount(m.autoMatched)} matched automatically, ${formatCount(m.needsReview)} for review, ${formatCount(
    m.yetToTake,
  )} yet to take, ${formatCount(m.excluded)} excluded`;
}
