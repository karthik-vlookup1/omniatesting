import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyLineUpdate, type BankLine } from '../transactions';
import { confirmLine, excludeLine, includeLine, rejectSuggestion, type ConfirmInput } from './api';

/** Every action returns the updated line: put it in every cache, then refresh lists and summaries. */
function useLineMutation<V>(fn: (vars: V) => Promise<BankLine>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (line) => {
      applyLineUpdate(qc, line);
      // Per-import match summaries (upload page) change too.
      void qc.invalidateQueries({ queryKey: ['matching', 'imports'] });
    },
  });
}

export function useConfirmLine() {
  return useLineMutation(({ lineId, input }: { lineId: string; input: ConfirmInput }) => confirmLine(lineId, input));
}

export function useRejectSuggestion() {
  return useLineMutation(({ lineId, suggestionId }: { lineId: string; suggestionId: string }) => rejectSuggestion(lineId, suggestionId));
}

export function useExcludeLine() {
  return useLineMutation(({ lineId, reason }: { lineId: string; reason: string }) => excludeLine(lineId, reason));
}

export function useIncludeLine() {
  return useLineMutation(({ lineId }: { lineId: string }) => includeLine(lineId));
}
