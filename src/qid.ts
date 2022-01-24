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

export function splitQrid(qrid: string): [string, string?] {
  const parts = qrid.split('_', 2);
  return parts.length > 1 ? [parts[1], parts[0]] : [parts[0]];
}

export function splitQwkid(qwkid: string): [string, string?] {
  const parts = qwkid.split(':', 2);
  return parts.length > 1 ? [parts[1], parts[0]] : [parts[0]];
}

export function getRidFromQrid(qid: string, meta?: TableMetadata): string {
  const [externalId, tableId] = splitQrid(qid);
  if (tableId && meta && meta.tableId && tableId !== meta.tableId) {
    throw new Error(`Unexpected prefix for ${meta.typeName} ID "${qid}"`);
  }
  return externalId;
}

export function getWkidFromQwkid(qid: string, meta?: TableMetadata): string {
  const [externalId, tableId] = splitQwkid(qid);
  if (tableId && meta && meta.tableId && tableId !== meta.tableId) {
    throw new Error(`Unexpected prefix for ${meta.typeName} ID "${qid}"`);
  }
  return externalId;
}

export function getXidFromQid(qid: string, meta: TypeMetadata): string {
  return resolveQid(qid, meta)[0];
}

export function resolveQid(qid: string, meta: TypeMetadata): [string, TableMetadata] {
  if (isTableMetadata(meta)) {
    let externalId = qid;
    let tableId: string | undefined;
    if (meta.tableId) {
      if (meta.randomIdColumn) {
        [externalId, tableId] = splitQrid(qid);
      } else if (meta.wellKnownIdColumn) {
        [externalId, tableId] = splitQwkid(qid);
      }
      if (tableId && tableId !== meta.tableId) {
        throw new Error(`Unexpected prefix "${tableId}" for ${meta.typeName} ID "${qid}"`);
      }
    }
    return [externalId, meta];
  }

  let assumedTableId: string | undefined;

  const tableMetas = Object.values(meta.tableIds);

  if (tableMetas.some((m) => m.tableId && m.randomIdColumn)) {
    const [externalId, tableId] = splitQrid(qid);
    if (tableId) {
      assumedTableId = tableId;
      const tableMeta = meta.tableIds[tableId];
      if (tableMeta) {
        return [externalId, tableMeta];
      }
    }
  }

  if (tableMetas.some((m) => m.tableId && m.wellKnownIdColumn)) {
    const [externalId, tableId] = splitQwkid(qid);
    if (tableId) {
      assumedTableId = tableId;
      const tableMeta = meta.tableIds[tableId];
      if (tableMeta) {
        return [externalId, tableMeta];
      }
    }
  }

  if (!assumedTableId) {
    throw new Error(`Type prefix expected in ${meta.typeName} ID "${qid}"`);
  } else {
    throw new Error(`Unknown prefix "${assumedTableId}" in ${meta.typeName} ID "${qid}"`);
  }
}

export function addQidField<T extends SqlFieldResolver>(resolver: T, field: string, meta: TableMetadata): T;
export function addQidField<T extends SqlQueryResolver>(resolver: T, field: string, meta: TypeMetadata): T;
export function addQidField<T extends SqlFieldResolver>(resolver: T, field: string, meta: TypeMetadata): T {
  if (isTableMetadata(meta)) {
    if (meta.randomIdColumn) {
      resolver.addColumnField(field, meta.randomIdColumn, meta.tableName, (rid) => joinQrid(rid, meta.tableId));
    } else if (meta.wellKnownIdColumn) {
      resolver.addColumnField(field, meta.wellKnownIdColumn, meta.tableName, (wkid) => joinQwkid(wkid, meta.tableId));
    } else {
      throw new Error(`No external ID defined for ${meta.typeName}`);
    }
  } else {
    const queryResolver = resolver as SqlFieldResolver as SqlQueryResolver;
    const metas = Object.values(meta.tableIds).filter((meta) => queryResolver.hasTable(meta.tableName));
    const noRidMeta = metas.find((meta) => !meta.randomIdColumn && !meta.wellKnownIdColumn);
    if (noRidMeta) {
      throw new Error(`No external ID defined for ${noRidMeta.typeName}`);
    }
    const xidColumn = queryResolver.addCoalesceExpression(
      metas.map((meta) => [meta.tableName, meta.randomIdColumn || meta.wellKnownIdColumn!]),
      'xid'
    );
    resolver.addDerivedField(field, (row) => {
      const xid = row[xidColumn];
      const typeName = queryResolver.getTypeNameFromRow(row);
      const actualMeta = (meta.objectTypes || metas).find((meta) => meta.typeName === typeName);
      return actualMeta ? qualifyXid(xid, actualMeta) : xid;
    });
  }
  return resolver;
}
