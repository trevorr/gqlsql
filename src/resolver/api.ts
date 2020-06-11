import { GraphQLResolveInfo } from 'graphql';
import Knex, { QueryBuilder } from 'knex';
import { ShallowTypeVisitors, TypeVisitors, WalkOptions } from '../visitor';
import { GraphQLVisitorInfo } from '../visitor/GraphQLVisitorInfo';
import { EquiJoinSpec, JoinSpec, UnionJoinSpec } from './JoinSpec';
import { Row, RowsQueryBuilder, TableLike } from './TableSpec';

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

export type FetchFilter = (rows: Row[]) => Row[];

export type TypeNameFunction = (row: Row) => string | null;
export type TypeNameOrFunction = string | null | TypeNameFunction;

export interface SqlTypeVisitors {
  readonly object: TypeVisitors<SqlQueryResolver>;
  readonly connection: ShallowTypeVisitors<SqlConnectionResolver, SqlQueryResolver>;
  readonly edge: ShallowTypeVisitors<SqlEdgeResolver, SqlQueryResolver>;
  readonly pageInfo: ShallowTypeVisitors<SqlPageInfoResolver, void>;
}

export interface SqlFieldResolver {
  readonly data: Record<string, any>;
  readonly visitors: SqlTypeVisitors;

  withData(data: Record<string, any>): this;

  addConstantField(field: string, value: Json): this;
  addColumnField(field: string, column: string, table?: string, func?: (value: any, row: Row) => Json): this;
  addCoalesceColumnField(field: string, column: string, tables: string[], func?: (value: any, row: Row) => Json): this;
  addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this;
  addDerivedField(field: string, func: (row: Row) => Json): this;
  addObjectField(field: string, join?: EquiJoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver;
  addUnionField(field: string, joins: UnionJoinSpec[]): SqlQueryResolver;

  addColumnListField(
    field: string,
    join: EquiJoinSpec,
    column: string,
    func?: (value: any, row: Row) => Json
  ): SqlQueryResolver;
  addExpressionListField(field: string, join: EquiJoinSpec, expr: string | Knex.Raw, alias?: string): SqlQueryResolver;
  addDerivedListField(field: string, join: EquiJoinSpec, func: (row: Row) => Json): SqlQueryResolver;
  addObjectListField(field: string, join: EquiJoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver;

  addConnectionField(
    field: string,
    join: EquiJoinSpec,
    args: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction
  ): SqlConnectionResolver;

  qualifyColumn(column: string, table?: string): string;
}

export type SqlQueryResolverConfig<T extends SqlQueryResolver = SqlQueryResolver> = (resolver: T) => void;

export interface SqlQueryResolver extends SqlFieldResolver {
  getKnex(): Knex;
  getBaseQuery(): RowsQueryBuilder;
  getArguments(): ResolverArgs;
  getTypeNameFromRow(row: Row): string | null;

  getDefaultTable(): string;
  hasTable(table: string): boolean;
  addTable(join: JoinSpec): this;
  forceTable(table: string): this;
  forceTableAlias(tableAlias: string): this;

  setDistinct(): this;
  addSelectColumn(column: string, table?: string): string;
  addSelectColumnFromAlias(column: string, tableAlias: string): string;
  addSelectExpression(expr: string | Knex.Raw, alias?: string): string;

  addCoalesceColumn(column: string, tables: string[]): string;
  addCoalesceColumnFromAliases(column: string, tableAliases: string[]): string;
  addCoalesceExpression(tableQualifiedColumns: [string, string][], columnAlias?: string): string;
  addCoalesceExpressionFromAliases(aliasQualifiedColumns: [string, string][], columnAlias?: string): string;

  addOrderBy(column: string, table?: string, descending?: boolean): this;
  addOrderByCoalesce(column: string, tables: string[], descending?: boolean): this;
  addOrderByAlias(columnAlias: string, descending?: boolean): this;

  addFetchFilter(filter: FetchFilter): this;

  walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    config?: SqlQueryResolverConfig<this>,
    options?: WalkOptions
  ): this;
}

export interface SqlQueryRootResolver extends SqlQueryResolver {
  execute(): Promise<JsonObject[]>;
  executeLookup(): Promise<JsonObject | null>;
}

export interface SqlConnectionResolver {
  readonly data: Record<string, any>;
  readonly visitors: SqlTypeVisitors;

  withData(data: Record<string, any>): this;

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

export interface UserInputErrorConstructor {
  new (message: string, properties?: Record<string, any>): any;
}

export interface SqlResolverOptions {
  defaultLimit: number;
  maxLimit: number;
  sqlExecutor: SqlExecutor;
  transaction?: Knex.Transaction;
  initialData?: Record<string, any>;
  visitors: Partial<SqlTypeVisitors>;
  userInputError: UserInputErrorConstructor;
}

export interface SqlResolverFactory {
  createQuery(
    table: TableLike,
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ): SqlQueryRootResolver;
  createConnection(
    table: TableLike,
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ): SqlConnectionRootResolver;
}
