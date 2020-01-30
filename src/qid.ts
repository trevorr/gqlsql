import { isTableMetadata, TableMetadata, TypeMetadata } from './meta';
import { SqlFieldResolver, SqlUnionQueryResolver } from './resolver';

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
  if (isTableMetadata(meta)) {
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

export function addQidField<T extends SqlFieldResolver>(context: T, field: string, meta: TableMetadata): T;
export function addQidField<T extends SqlUnionQueryResolver>(context: T, field: string, meta: TypeMetadata): T;
export function addQidField<T extends SqlFieldResolver>(context: T, field: string, meta: TypeMetadata): T {
  if (isTableMetadata(meta)) {
    if (!meta.randomIdColumn) {
      throw new Error(`No random ID defined for ${meta.typeName}`);
    }
    context.addColumnField(field, meta.randomIdColumn, meta.tableName, rid => joinQid(rid, meta.tableId));
  } else {
    const unionContext = (context as SqlFieldResolver) as SqlUnionQueryResolver;
    const metas = Object.values(meta.tableIds);
    const noRidMeta = metas.find(meta => !meta.randomIdColumn);
    if (noRidMeta) {
      throw new Error(`No random ID defined for ${noRidMeta.typeName}`);
    }
    const ridColumn = unionContext.addSelectCoalesce(
      metas.map(meta => [meta.tableName, meta.randomIdColumn!]),
      'rid'
    );
    context.addDerivedField(field, row => {
      const typeName = unionContext.getTypeNameFromRow(row);
      const actualMeta = (meta.objectTypes || metas).find(meta => meta.typeName === typeName);
      return joinQid(row[ridColumn], actualMeta?.tableId);
    });
  }
  return context;
}
