import Debug from 'debug';
import {
  Connection,
  Json,
  JsonObject,
  ResolverArgs,
  Row,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlResolverFactory,
  SqlResolverOptions,
  SqlUnionQueryResolver
} from './api';
import { EquiJoinSpec, JoinSpec, UnionJoinSpec } from './JoinSpec';
import { TableResolver } from './TableResolver';

export const debug = Debug('gqlsql');

export interface FetchResult {
  rows: Row[];
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  afterCursor?: string;
  beforeCursor?: string;
  totalCount?: number;
}

export type FetchLookup = (parentRow?: Row) => FetchResult;

export type FetchMap = Map<SqlQueryResolver, FetchLookup>;

export type ParentRowMap = Map<SqlQueryResolver, Row>;

export interface ResultBuilder<T = Row> {
  buildResult(data: T, parentRowMap: ParentRowMap, fetchMap: FetchMap): JsonObject | null;
}

export interface SqlChildQueryResolver extends SqlQueryResolver {
  fetch(parentRows: Row[], fetchMap: FetchMap): Promise<void>;
  buildObjectList(fetchMap: FetchMap, parentRow: Row, parentRowMap: ParentRowMap): JsonObject[];
  buildJsonList(fetchMap: FetchMap, parentRow: Row, func: (row: Row) => Json): Json[];
}

export interface SqlConnectionChildResolver extends SqlConnectionResolver {
  getNodeResolver(): SqlChildQueryResolver;
  buildResultFor(parentRow: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): Partial<Connection<JsonObject>>;
}

export interface SqlContainingQueryResolver extends SqlQueryResolver, ResultBuilder<Row> {
  getBaseResolver(): BaseSqlQueryResolver;
}

export interface SqlQueryResolverRBR extends SqlQueryResolver, ResultBuilder<Row> {}

export interface SqlUnionQueryResolverRBR extends SqlUnionQueryResolver, ResultBuilder<Row> {}

export interface BaseSqlQueryResolver extends SqlQueryResolver, ResultBuilder<Row> {
  findTableAlias(table: string): string | undefined;
  getTableAlias(table: string): string;
  getCursor(row: Row): string;
  addJoinAlias(join: JoinSpec, aliasPrefix: string | null): string;
  createChildResolver(outerResolver: TableResolver & SqlQueryResolver, join: EquiJoinSpec): SqlChildQueryResolver;
  createConnectionResolver(
    outerResolver: TableResolver & SqlQueryResolver,
    join: EquiJoinSpec,
    args: ResolverArgs
  ): SqlConnectionChildResolver;
  createObjectResolver(
    outerResolver: TableResolver,
    join: JoinSpec | undefined,
    defaultTable: string,
    field: string
  ): SqlQueryResolverRBR;
  createUnionResolver(outerResolver: TableResolver, joins: UnionJoinSpec[], field: string): SqlUnionQueryResolverRBR;
}

export interface InternalSqlResolverFactory extends SqlResolverFactory {
  createChildQuery(
    parentResolver: BaseSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    join: EquiJoinSpec,
    args?: ResolverArgs,
    options?: Partial<SqlResolverOptions>
  ): SqlChildQueryResolver;
  createChildConnection(
    parentResolver: BaseSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    join: EquiJoinSpec,
    args: ResolverArgs,
    options?: Partial<SqlResolverOptions>
  ): SqlConnectionChildResolver;
}
