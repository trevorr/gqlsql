export interface BaseTypeMetadata {
  typeName: string;
  objectTypes?: TableMetadata[]; // for interfaces and unions
  interfaceNames?: string[]; // union of interfaces implemented by all possible object types
}

export interface TableMetadata extends BaseTypeMetadata {
  tableId?: string;
  tableName: string;
  idColumns: string[];
  randomIdColumn?: string;
  wellKnownIdColumn?: string;
  softDeleteColumn?: string;
}

export interface UnionMetadata extends BaseTypeMetadata {
  tableIds: Record<string, TableMetadata>;
}

export type TypeMetadata = TableMetadata | UnionMetadata;

export type TypeMetadataMap = Record<string, TypeMetadata>;

export function isTableMetadata(meta: TypeMetadata): meta is TableMetadata {
  return 'tableName' in meta;
}

export function getTableNames(meta: TypeMetadata): string[] {
  return isTableMetadata(meta) ? [meta.tableName] : Object.values(meta.tableIds).map((m) => m.tableName);
}
