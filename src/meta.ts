export interface BaseTypeMetadata {
  typeName: string;
  objectTypes?: TableMetadata[]; // for interfaces and unions
}

export interface TableMetadata extends BaseTypeMetadata {
  tableId?: string;
  tableName: string;
  idColumns?: string[];
  randomIdColumn?: string;
  stringIdColumn?: string;
}

export interface UnionMetadata extends BaseTypeMetadata {
  tableIds: Record<string, TableMetadata>;
}

export type TypeMetadata = TableMetadata | UnionMetadata;

export type TypeMetadataMap = Record<string, TypeMetadata>;
