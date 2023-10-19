import { GraphQLResolveInfo } from 'graphql';
import { Knex } from 'knex';
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

export type SqlValue = Json | Date | Buffer;

export interface PageInfo {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface Edge<T = Record<string, unknown>> {
  cursor: string;
  node: Partial<T>;
}

export interface Connection<T = Record<string, unknown>> {
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
  [key: string]: unknown;
}

export type FetchFilter = (rows: Row[]) => Row[];

export type SearchId = string;
export type SearchRowTransform = (row: Row, id: SearchId) => Row;

export type TypeNameFunction = (row: Row) => string | null;
export type TypeNameOrFunction = string | null | TypeNameFunction;

export interface SqlTypeVisitors {
  readonly object: TypeVisitors<SqlQueryResolver>;
  readonly connection: ShallowTypeVisitors<SqlConnectionResolver, SqlQueryResolver>;
  readonly edge: ShallowTypeVisitors<SqlEdgeResolver, SqlQueryResolver>;
  readonly pageInfo: ShallowTypeVisitors<SqlPageInfoResolver, void>;
}

// Defined as an interface for augmentation
export interface SqlResolverData {
  [key: string]: unknown;
}

export interface SqlFieldResolver {
  readonly data: SqlResolverData;
  readonly options: SqlResolverOptions;
  readonly visitors: SqlTypeVisitors;

  withData(data: SqlResolverData): this;

  addAliasField(field: string, columnAlias: string): this;
  addConstantField(field: string, value: unknown): this;
  addColumnField(field: string, column: string, table?: string, func?: (value: SqlValue, row: Row) => unknown): this;
  addCoalesceColumnField(
    field: string,
    column: string,
    tables: string[],
    func?: (value: SqlValue, row: Row) => unknown
  ): this;
  addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this;
  addDerivedField(field: string, func: (row: Row) => unknown): this;
  addObjectField(field: string, join?: EquiJoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver;
  addUnionField(field: string, joins: UnionJoinSpec[]): SqlQueryResolver;

  addColumnListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    column: string,
    func?: (value: SqlValue, row: Row) => unknown
  ): SqlQueryResolver;
  addExpressionListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    expr: string | Knex.Raw,
    alias?: string
  ): SqlQueryResolver;
  addDerivedListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    func: (row: Row) => unknown
  ): SqlQueryResolver;
  addObjectListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    typeNameOrFn?: TypeNameOrFunction
  ): SqlQueryResolver;

  addConnectionField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
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
  hasSelectAlias(columnAlias: string): boolean;
  addSelectAlias(columnAlias: string): string;
  addSelectColumn(column: string, table?: string, columnAlias?: string): string;
  addSelectColumnFromAlias(column: string, tableAlias: string, columnAlias?: string): string;
  addSelectExpression(expr: string | Knex.Raw | RowsQueryBuilder, alias?: string): string;

  addCoalesceColumn(column: string, tables: string[], columnAlias?: string): string;
  addCoalesceColumnFromAliases(column: string, tableAliases: string[], columnAlias?: string): string;
  addCoalesceExpression(tableQualifiedColumns: [string, string][], columnAlias?: string): string;
  addCoalesceExpressionFromAliases(aliasQualifiedColumns: [string, string][], columnAlias?: string): string;

  addOrderBy(column: string, table?: string, descending?: boolean): this;
  addOrderByCoalesce(column: string, tables: string[], descending?: boolean): this;
  addOrderByAlias(columnAlias: string, descending?: boolean): this;
  addCursorAlias(columnAlias: string): this;

  addFetchFilter(filter: FetchFilter): this;

  walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    config?: SqlQueryResolverConfig<this>,
    options?: WalkOptions
  ): this;
}

export interface SqlQueryRootResolver extends SqlQueryResolver {
  getDataQuery(): RowsQueryBuilder;
  execute(): Promise<Record<string, unknown>[]>;
  executeLookup(): Promise<Record<string, unknown> | null>;
}

export interface SqlConnectionResolver {
  readonly data: SqlResolverData;
  readonly visitors: SqlTypeVisitors;

  withData(data: SqlResolverData): this;

  getNodeResolver(): SqlQueryResolver;
  getEdgesResolver(): SqlEdgeResolver;

  addEdges(field: string): SqlEdgeResolver;
  addNodes(field: string): SqlQueryResolver;
  addPageInfo(field: string): SqlPageInfoResolver;
  addTotalCount(field: string): void;

  walk(info: GraphQLVisitorInfo | GraphQLResolveInfo, config?: SqlQueryResolverConfig, options?: WalkOptions): this;
}

export interface SqlConnectionRootResolver extends SqlConnectionResolver {
  execute(): Promise<Partial<Connection>>;
  executeFromSearch(
    idColumn: string,
    idValues: SearchId[],
    totalCount: number,
    rowTransform?: SearchRowTransform
  ): Promise<Partial<Connection>>;
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
  execute<TResult, TRecord extends Row = Row>(query: Knex.QueryBuilder<TRecord, TResult>): Promise<TResult>;
}

export interface UserInputErrorConstructor {
  new (message: string, properties?: Record<string, unknown>): unknown;
}

export interface SqlResolverOptions {
  defaultLimit: number;
  maxLimit: number;
  sqlExecutor: SqlExecutor;
  transaction?: Knex.Transaction;
  initialData?: Record<string, unknown>;
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
