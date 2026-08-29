/** Toplu silme yardımcıları (client tarafı). */

export interface DeleteResult {
  requested: number;
  found: number;
  deleted: number;
  failed: number;
  removedPhotos: number;
}

const CHUNK = 1000;

type DeleteFn = (args: { data: { partIds?: string[]; batchId?: string } }) => Promise<DeleteResult>;

/** Büyük seçimleri 1000'lik parçalar halinde siler ve ilerlemeyi bildirir. */
export async function deleteInChunks(
  fn: DeleteFn,
  ids: string[],
  onProgress?: (processed: number, total: number) => void,
): Promise<DeleteResult> {
  const total = ids.length;
  const acc: DeleteResult = { requested: 0, found: 0, deleted: 0, failed: 0, removedPhotos: 0 };
  for (let i = 0; i < total; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const r = await fn({ data: { partIds: slice } });
    acc.requested += r.requested;
    acc.found += r.found;
    acc.deleted += r.deleted;
    acc.failed += r.failed;
    acc.removedPhotos += r.removedPhotos;
    onProgress?.(Math.min(i + slice.length, total), total);
  }
  return acc;
}

export function formatDeleteResult(r: DeleteResult): string {
  return `${r.found.toLocaleString("tr-TR")} ürün bulundu • ${r.deleted.toLocaleString("tr-TR")} silindi • ${r.failed.toLocaleString("tr-TR")} silinemedi${r.removedPhotos ? ` • ${r.removedPhotos} görsel temizlendi` : ""}`;
}
