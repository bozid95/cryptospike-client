import type { AppLogItem } from "../../lib/logger";

export type ExecutionStatus = "EXECUTED" | "SKIPPED" | "FAILED";

export interface ExecutionOutcome {
  status: ExecutionStatus;
  reason?: string;
}

const MAX_REASON = 300;
const ENTRY_SUCCESS = /^Entry Order Succeeded/;

/**
 * Hasil eksekusi satu sinyal dari log yang terbit selama eksekusi:
 *  - EXECUTED : order entry terisi (reason = error pertama sesudahnya, mis. SL/TP gagal, jika ada)
 *  - FAILED   : ada ERROR tanpa entry terisi
 *  - SKIPPED  : tidak ada order; reason = peringatan terakhir (filter, guard harga, posisi penuh, dll.)
 */
export function deriveExecutionOutcome(logs: AppLogItem[]): ExecutionOutcome {
  const clip = (s?: string) => (s ? s.slice(0, MAX_REASON) : undefined);
  const firstError = logs.find((l) => l.level === "ERROR");
  if (logs.some((l) => ENTRY_SUCCESS.test(l.message))) {
    const reason = clip(firstError?.message);
    return reason ? { status: "EXECUTED", reason } : { status: "EXECUTED" };
  }
  if (firstError) return { status: "FAILED", reason: clip(firstError.message)! };
  const lastWarn = [...logs].reverse().find((l) => l.level === "WARN");
  return { status: "SKIPPED", reason: clip(lastWarn?.message) ?? "No order placed" };
}
