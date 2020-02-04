import { GraphQLResolveInfo } from 'graphql';
import Knex, { QueryBuilder } from 'knex';
import { ShallowTypeVisitors, TypeVisitors, WalkOptions } from '../visitor';
import { GraphQLVisitorInfo } from '../visitor/GraphQLVisitorInfo';
import { EquiJoinSpec, JoinSpec, UnionJoinSpec } from './JoinSpec';

export type JsonScalar = string | number | boolean | null;

export type Json = JsonScalar | JsonArray | JsonObject;

export interface JsonArray extends Array<Json> {}

export interface JsonObject {
  [property: string]: Json;
}

export interface PageInfo {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface Edge<T> {
  cursor: string;
  node: Partial<T>;
}

export interface Connection<T> {
  edges: Edge<Partial<T>>[];
  nodes: Partial<T>[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface ConnectionArgs {
  first?: number | null;
  after?: string | null;
  last?: number | null;
  before?: string | null;
}

export interface ResolverArgs extends ConnectionArgs {
  [key: string]: any;
}

export type Row = Record<string, any>;

export type RowsQueryBuilder = QueryBuilder<any, Row[]>;

export interface SqlTypeVisitors {
  readonly object: TypeVisitors<SqlQueryResolver>;
  readonly union: ShallowTypeVisitors<SqlUnionQueryResolver, SqlQueryResolver>;
  readonly connection: ShallowTypeVisitors<SqlConnectionResolver, SqlQueryResolver>;
  readonly edge: ShallowTypeVisitors<SqlEdgeResolver, SqlQueryResolver>;
  readonly pageInfo: ShallowTypeVisitors<SqlPageInfoResolver, void>;
}

export interface SqlFieldResolver {
  readonly visitors: SqlTypeVisitors;
  addConstantField(field: string, value: Json): this;
  addColumnField(field: string, column: string, table?: string, func?: (value: any, row: Row) => Json): this;
  addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this;
  addDerivedField(field: string, func: (row: Row) => Json): this;
  addObjectField(field: string, join?: JoinSpec): SqlQueryResolver;
  addUnionField(field: string, joins: UnionJoinSpec[]): SqlUnionQueryResolver;
  addConnection(field: string, join: EquiJoinSpec, args: ResolverArgs): SqlConnectionResolver;
  qualifyColumn(column: string, table?: string): string;
}

export type SqlQueryResolverConfig<T extends SqlQueryResolver = SqlQueryResolver> = (resolver: T) => void;

export interface SqlQueryResolver extends SqlFieldResolver {
  getKnex(): Knex;
  getBaseQuery(): RowsQueryBuilder;
  getArguments(): ResolverArgs;
  hasTable(table: string): boolean;
  addTable(join: JoinSpec): this;
  addSelectColumn(column: string, table?: string): string;
  addSelectColumnFromAlias(column: string, tableAlias: string): string;
  addSelectExpression(expr: string | Knex.Raw, alias?: string): string;
  addOrderBy(column: string, table?: string, descending?: boolean): this;
  addOrderByAlias(columnAlias: string, descending?: boolean): void;
  walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    config?: SqlQueryResolverConfig<this>,
    options?: WalkOptions
  ): this;
}

export interface SqlUnionQueryResolver extends SqlQueryResolver {
  getTypeNameFromRow(row: Row): string | null;
  addColumnField(
    field: string,
    column: string,
    tables?: string | string[],
    func?: (value: any, row: Row) => Json
  ): this;
  addSelectColumn(column: string, tables?: string | string[]): string;
  addSelectColumnFromAlias(column: string, tableAliases: string | string[]): string;
  addSelectCoalesce(tableQualifiedColumns: [string, string][], columnAlias?: string): string;
  addSelectCoalesceFromAlias(aliasQualifiedColumns: [string, string][], columnAlias?: string): string;
}

export interface SqlQueryRootResolver extends SqlQueryResolver {
  execute(): Promise<JsonObject[]>;
  executeLookup(): Promise<JsonObject | null>;
}

export interface SqlConnectionResolver {
  readonly visitors: SqlTypeVisitors;
  getNodeResolver(): SqlQueryResolver;
  getEdgesResolver(): SqlEdgeResolver;
  addEdges(field: string): SqlEdgeResolver;
  addNodes(field: string): SqlQueryResolver;
  addPageInfo(field: string): SqlPageInfoResolver;
  addTotalCount(field: string): void;
  walk(info: GraphQLVisitorInfo | GraphQLResolveInfo, config?: SqlQueryResolverConfig, options?: WalkOptions): this;
}

export interface SqlConnectionRootResolver extends SqlConnectionResolver {
  execute(): Promise<Partial<Connection<JsonObject>>>;
}

export interface SqlEdgeResolver extends SqlFieldResolver {
  addCursor(field: string): void;
  addNode(field: string): SqlQueryResolver;
}

export interface SqlPageInfoResolver {
  addHasPreviousPage(field: string): void;
  addHasNextPage(field: string): void;
  addStartCursor(field: string): void;
  addEndCursor(field: string): void;
}

export interface SqlExecutor {
  execute<T>(query: QueryBuilder<any, T>): Promise<T>;
}

export interface SqlResolverOptions {
  defaultLimit: number;
  maxLimit: number;
  sqlExecutor: SqlExecutor;
  visitors: Partial<SqlTypeVisitors>;
  userInputError: { new (message: string): any };
}

export interface SqlResolverFactory {
  createQuery(table: string, args?: ResolverArgs, options?: Partial<SqlResolverOptions>): SqlQueryRootResolver;
  createConnection(
    table: string,
    args?: ResolverArgs,
    options?: Partial<SqlResolverOptions>
  ): SqlConnectionRootResolver;
}
