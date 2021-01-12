import { isTableMetadata, TableMetadata, TypeMetadata } from './meta';
import { SqlFieldResolver, SqlQueryResolver } from './resolver';

export function joinQrid(rid: string, tableId: string | undefined): string {
  return tableId ? `${tableId}_${rid}` : rid;
}

export function joinQwkid(wkid: string, tableId: string | undefined): string {
  return tableId ? `${tableId}:${wkid}` : wkid;
}

export function qualifyXid(xid: string, meta: TableMetadata): string {
  if (meta.randomIdColumn) {
    return joinQrid(xid, meta.tableId);
  }
  if (meta.wellKnownIdColumn) {
    return joinQwkid(xid, meta.tableId);
  }
  throw new Error(`No external ID defined for ${meta.typeName}`);
}

export function splitQid(qid: string): [string, string?] {
  const parts = qid.split(/_|:/, 2);
  return parts.length > 1 ? [parts[1], parts[0]] : [parts[0]];
}

export function getXidFromQid(qid: string, meta?: TableMetadata): string {
  const [externalId, tableId] = splitQid(qid);
  if (tableId && meta && meta.tableId && tableId !== meta.tableId) {
    throw new Error(`Unexpected prefix for ${meta.typeName} ID "${qid}"`);
  }
  return externalId;
}

export function resolveQid(qid: string, meta: TypeMetadata): [string, TableMetadata] {
  const [externalId, tableId] = splitQid(qid);
  let tableMeta;
  if (isTableMetadata(meta)) {
    if (tableId && meta.tableId && tableId !== meta.tableId) {
      throw new Error(`Unexpected prefix "${tableId}" for ${meta.typeName} ID "${qid}"`);
    }
    tableMeta = meta;
  } else if (!tableId) {
    throw new Error(`Prefix expected in ${meta.typeName} ID "${qid}"`);
  } else {
    tableMeta = meta.tableIds[tableId];
    if (!tableMeta) {
      throw new Error(`Unknown prefix "${tableId}" in ${meta.typeName} ID "${qid}"`);
    }
  }
  return [externalId, tableMeta];
}

export function addQidField<T extends SqlFieldResolver>(resolver: T, field: string, meta: TableMetadata): T;
export function addQidField<T extends SqlQueryResolver>(resolver: T, field: string, meta: TypeMetadata): T;
export function addQidField<T extends SqlFieldResolver>(resolver: T, field: string, meta: TypeMetadata): T {
  if (isTableMetadata(meta)) {
    if (meta.randomIdColumn) {
      resolver.addColumnField(field, meta.randomIdColumn, meta.tableName, rid => joinQrid(rid, meta.tableId));
    } else if (meta.wellKnownIdColumn) {
      resolver.addColumnField(field, meta.wellKnownIdColumn, meta.tableName, wkid => joinQwkid(wkid, meta.tableId));
    } else {
      throw new Error(`No external ID defined for ${meta.typeName}`);
    }
  } else {
    const queryResolver = (resolver as SqlFieldResolver) as SqlQueryResolver;
    const metas = Object.values(meta.tableIds).filter(meta => queryResolver.hasTable(meta.tableName));
    const noRidMeta = metas.find(meta => !meta.randomIdColumn && !meta.wellKnownIdColumn);
    if (noRidMeta) {
      throw new Error(`No external ID defined for ${noRidMeta.typeName}`);
    }
    const xidColumn = queryResolver.addCoalesceExpression(
      metas.map(meta => [meta.tableName, meta.randomIdColumn || meta.wellKnownIdColumn!]),
      'xid'
    );
    resolver.addDerivedField(field, row => {
      const xid = row[xidColumn];
      const typeName = queryResolver.getTypeNameFromRow(row);
      const actualMeta = (meta.objectTypes || metas).find(meta => meta.typeName === typeName);
      return actualMeta ? qualifyXid(xid, actualMeta) : xid;
    });
  }
  return resolver;
}
