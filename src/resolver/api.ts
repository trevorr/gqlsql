import { GraphQLResolveInfo } from 'graphql';
import Knex, { QueryBuilder } from 'knex';
import { TypeVisitors, WalkOptions } from '../visitor';
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

export interface LimitArgs {
  first?: number | null;
  last?: number | null;
}

export interface ConnectionArgs extends LimitArgs {
  after?: string | null;
  before?: string | null;
}

export type Row = Record<string, any>;

export type RowsQueryBuilder = QueryBuilder<any, Row[]>;

export interface SqlFieldResolver {
  addConstantField(field: string, value: Json): this;
  addColumnField(field: string, column: string, table?: string, func?: (value: any) => Json): this;
  addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this;
  addDerivedField(field: string, func: (row: Row) => Json): this;
  addObjectField(field: string, join?: JoinSpec): SqlQueryResolver;
  addUnionField(field: string, joins: UnionJoinSpec[]): SqlUnionQueryResolver;
  addConnection(field: string, join: EquiJoinSpec, args: ConnectionArgs): SqlConnectionResolver;
}

export interface SqlQueryResolver extends SqlFieldResolver {
  getBaseQuery(): RowsQueryBuilder;
  addTable(join: JoinSpec): this;
  addSelectColumn(column: string, table?: string): string;
  addSelectColumnFromAlias(column: string, tableAlias: string): string;
  addSelectExpression(expr: string | Knex.Raw, alias?: string): string;
  addOrderBy(column: string, table?: string, descending?: boolean): this;
  addOrderByAlias(columnAlias: string, descending?: boolean): void;
  walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    visitors: TypeVisitors<SqlQueryResolver>,
    config?: (resolver: this) => void,
    options?: WalkOptions
  ): this;
}

export interface SqlUnionQueryResolver extends SqlQueryResolver {
  addColumnField(field: string, column: string, tables?: string | string[], func?: (value: any) => Json): this;
  addSelectColumn(column: string, tables?: string | string[]): string;
  addSelectColumnFromAlias(column: string, tableAliases: string | string[]): string;
}

export interface SqlQueryRootResolver extends SqlQueryResolver {
  execute(): Promise<JsonObject[]>;
  executeLookup(): Promise<JsonObject | null>;
}

export interface SqlConnectionResolver {
  getNodeResolver(): SqlQueryResolver;
  getEdgesResolver(): SqlEdgesResolver;
  addEdges(field: string): SqlEdgesResolver;
  addNodes(field: string): SqlQueryResolver;
  addPageInfo(field: string): SqlPageInfoResolver;
  addTotalCount(field: string): void;
  walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    visitors: TypeVisitors<SqlQueryResolver>,
    config?: (nodeResolver: SqlQueryResolver) => void,
    options?: WalkOptions
  ): this;
}

export interface SqlConnectionRootResolver extends SqlConnectionResolver {
  execute(): Promise<Partial<Connection<JsonObject>>>;
}

export interface SqlEdgesResolver extends SqlFieldResolver {
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
  userInputError: { new (message: string): any };
}

export interface SqlResolverFactory {
  createQuery(table: string, args?: ConnectionArgs, options?: Partial<SqlResolverOptions>): SqlQueryRootResolver;
  createConnection(
    table: string,
    args?: ConnectionArgs,
    options?: Partial<SqlResolverOptions>
  ): SqlConnectionRootResolver;
}
