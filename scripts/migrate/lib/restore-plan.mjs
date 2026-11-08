// 복원 대상 고르기 (scripts/migrate/stage2-restore.mjs)
// - 범위를 정하지 않은 복원을 막는다. --ids나 --all이 있어야 한다.
// - 기본은 지금 없는 문서만 쓴다. 지금 있는 문서는 --overwrite일 때만 덮는다.

/**
 * @param {{ dumpIds: string[], existingIds: string[], ids: string[] | null, all: boolean, overwrite: boolean }} input
 * @returns {{ write: string[], skippedExisting: string[], notInDump: string[] }}
 */
export function selectRestoreDocs({ dumpIds, existingIds, ids, all, overwrite }) {
  if (!all && (!ids || ids.length === 0)) {
    throw new Error('복원 범위가 없습니다. --ids <id1,id2> 또는 --all을 주세요.');
  }
  const existing = new Set(existingIds);
  const inDump = new Set(dumpIds);
  const candidates = ids && ids.length > 0 ? ids.filter((id) => inDump.has(id)) : [...dumpIds];
  const notInDump = ids && ids.length > 0 ? ids.filter((id) => !inDump.has(id)) : [];
  const write = candidates.filter((id) => overwrite || !existing.has(id));
  const skippedExisting = candidates.filter((id) => !overwrite && existing.has(id));
  return { write, skippedExisting, notInDump };
}
