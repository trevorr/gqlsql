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
