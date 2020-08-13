import { isTableMetadata, TableMetadata, TypeMetadata } from './meta';
import { SqlFieldResolver, SqlQueryResolver } from './resolver';

export function joinQid(randomId: string, tableId: string | undefined): string {
  return tableId ? `${tableId}_${randomId}` : randomId;
}

export function splitQid(qid: string): [string, string?] {
  const parts = qid.split('_', 2);
  return parts.length > 1 ? [parts[1], parts[0]] : [parts[0]];
}

export function getRidFromQid(qid: string, meta?: TableMetadata): string {
  const [randomId, tableId] = splitQid(qid);
  if (tableId && meta && meta.tableId && tableId !== meta.tableId) {
    throw new Error(`Unexpected prefix for ${meta.typeName} ID "${qid}"`);
  }
  return randomId;
}

export function resolveQid(qid: string, meta: TypeMetadata): [string, TableMetadata] {
  const [randomId, tableId] = splitQid(qid);
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
  return [randomId, tableMeta];
}

export function addQidField<T extends SqlFieldResolver>(resolver: T, field: string, meta: TableMetadata): T;
export function addQidField<T extends SqlQueryResolver>(resolver: T, field: string, meta: TypeMetadata): T;
export function addQidField<T extends SqlFieldResolver>(resolver: T, field: string, meta: TypeMetadata): T {
  if (isTableMetadata(meta)) {
    if (!meta.randomIdColumn) {
      throw new Error(`No random ID defined for ${meta.typeName}`);
    }
    resolver.addColumnField(field, meta.randomIdColumn, meta.tableName, rid => joinQid(rid, meta.tableId));
  } else {
    const queryResolver = (resolver as SqlFieldResolver) as SqlQueryResolver;
    const metas = Object.values(meta.tableIds).filter(meta => queryResolver.hasTable(meta.tableName));
    const noRidMeta = metas.find(meta => !meta.randomIdColumn);
    if (noRidMeta) {
      throw new Error(`No random ID defined for ${noRidMeta.typeName}`);
    }
    const ridColumn = queryResolver.addCoalesceExpression(
      metas.map(meta => [meta.tableName, meta.randomIdColumn!]),
      'rid'
    );
    resolver.addDerivedField(field, row => {
      const typeName = queryResolver.getTypeNameFromRow(row);
      const actualMeta = (meta.objectTypes || metas).find(meta => meta.typeName === typeName);
      return joinQid(row[ridColumn], actualMeta?.tableId);
    });
  }
  return resolver;
}
