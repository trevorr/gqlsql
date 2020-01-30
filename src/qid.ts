import { TypeMetadata, TableMetadata } from './meta';

export function joinQid(objectId: string, tableId: string | undefined): string {
  return tableId ? `${tableId}_${objectId}` : objectId;
}

export function splitQid(qid: string): [string, string?] {
  const parts = qid.split('_', 2);
  return parts.length > 1 ? [parts[1], parts[0]] : [parts[0]];
}

export function getQidTable(qid: string, meta: TypeMetadata): [string, TableMetadata] {
  const [objectId, tableId] = splitQid(qid);
  let tableMeta;
  if ('tableName' in meta) {
    tableMeta = meta;
  } else if (!tableId) {
    throw new Error(`Prefix expected in ${meta.typeName} ID "${qid}"`);
  } else {
    tableMeta = meta.tableIds[tableId];
    if (!tableMeta) {
      throw new Error(`Unknown prefix in ${meta.typeName} ID "${qid}"`);
    }
  }
  return [objectId, tableMeta];
}
