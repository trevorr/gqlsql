export interface BaseTypeMetadata {
  typeName: string;
  objectTypes?: TableMetadata[];
}

export interface TableMetadata extends BaseTypeMetadata {
  tableId?: string;
  tableName: string;
}

export interface UnionMetadata extends BaseTypeMetadata {
  tableIds: Record<string, TableMetadata>;
}

export type TypeMetadata = TableMetadata | UnionMetadata;

export type TypeMetadataMap = Record<string, TypeMetadata>;

export function joinXid(objectId: string, tableId: string | undefined): string {
  return tableId ? `${tableId}_${objectId}` : objectId;
}

export function splitXid(xid: string): [string, string?] {
  const parts = xid.split('_', 2);
  return parts.length > 1 ? [parts[1], parts[0]] : [parts[0]];
}

export function getXidTable(xid: string, meta: TypeMetadata): [string, string] {
  const [objectId, tableId] = splitXid(xid);
  let tableName;
  if ('tableName' in meta) {
    tableName = meta.tableName;
  } else if (!tableId) {
    throw new Error(`Prefix expected in ${meta.typeName} ID "${xid}"`);
  } else {
    const tableMeta = meta.tableIds[tableId];
    if (!tableMeta) {
      throw new Error(`Unknown prefix in ${meta.typeName} ID "${xid}"`);
    }
    tableName = tableMeta.tableName;
  }
  return [objectId, tableName];
}
