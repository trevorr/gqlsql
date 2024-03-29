import { GraphQLResolveInfo } from 'graphql';
import { Knex } from 'knex';
import { GraphQLVisitorInfo, WalkOptions, walkSelections } from '../visitor';
import { EquiJoinSpec, JoinSpec, UnionJoinSpec, isEquiJoin } from './JoinSpec';
import { getTypeNameFromRow } from './KnexSqlQueryResolver';
import { TableResolver } from './TableResolver';
import { Row, RowsQueryBuilder, getTableName } from './TableSpec';
import {
  FetchFilter,
  ResolverArgs,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlResolverOptions,
  SqlTypeVisitors,
  SqlValue,
  TypeNameOrFunction,
} from './api';
import { BaseSqlQueryResolver, FetchMap, ParentRowMap } from './internal';

export class DelegatingSqlQueryResolver extends TableResolver implements SqlQueryResolver {
  protected readonly baseResolver: BaseSqlQueryResolver;

  public constructor(
    baseResolver: BaseSqlQueryResolver,
    outerResolver: TableResolver | undefined,
    private readonly typeNameOrFn?: TypeNameOrFunction,
    defaultTable: string = (outerResolver || baseResolver).getDefaultTable(),
    tableAlias: string = (outerResolver || baseResolver).getTableAlias(defaultTable),
    private readonly testColumn?: string
  ) {
    super(defaultTable, tableAlias, outerResolver);
    this.baseResolver = baseResolver;
  }

  public get data(): Record<string, unknown> {
    return this.baseResolver.data;
  }

  public get options(): SqlResolverOptions {
    return this.baseResolver.options;
  }

  public get visitors(): SqlTypeVisitors {
    return this.baseResolver.visitors;
  }

  public withData(data: Record<string, unknown>): this {
    this.baseResolver.withData(data);
    return this;
  }

  public getBaseResolver(): BaseSqlQueryResolver {
    return this.baseResolver;
  }

  public getKnex(): Knex {
    return this.baseResolver.getKnex();
  }

  public getBaseQuery(): RowsQueryBuilder {
    return this.baseResolver.getBaseQuery();
  }

  public getTypeNameFromRow(row: Row): string | null {
    return getTypeNameFromRow(this.typeNameOrFn, row);
  }

  public getArguments(): ResolverArgs {
    return this.baseResolver.getArguments();
  }

  public addTable(join: JoinSpec): this {
    const alias = this.baseResolver.addJoinAlias(this.resolveJoin(join), null);
    this.addTableAlias(isEquiJoin(join) ? getTableName(join.toTable) : join.toAlias, alias);
    return this;
  }

  public forceTable(table: string): this {
    this.baseResolver.forceTableAlias(this.getTableAlias(table));
    return this;
  }

  public forceTableAlias(tableAlias: string): this {
    this.baseResolver.forceTableAlias(tableAlias);
    return this;
  }

  public setDistinct(): this {
    this.baseResolver.setDistinct();
    return this;
  }

  public hasSelectAlias(columnAlias: string): boolean {
    return this.baseResolver.hasSelectAlias(columnAlias);
  }

  public addSelectAlias(columnAlias: string): string {
    return this.baseResolver.addSelectAlias(columnAlias);
  }

  public addSelectColumn(column: string, table = this.defaultTable, columnAlias?: string): string {
    return this.baseResolver.addSelectColumnFromAlias(column, this.getTableAlias(table), columnAlias);
  }

  public addSelectColumnFromAlias(column: string, tableAlias: string, columnAlias?: string): string {
    return this.baseResolver.addSelectColumnFromAlias(column, tableAlias, columnAlias);
  }

  public addSelectExpression(expr: string | Knex.Raw | RowsQueryBuilder, alias?: string): string {
    return this.baseResolver.addSelectExpression(expr, alias);
  }

  public addCoalesceColumn(column: string, tables: string[], columnAlias = column): string {
    return this.baseResolver.addCoalesceExpressionFromAliases(
      tables.map((table) => [this.getTableAlias(table), column]),
      columnAlias
    );
  }

  public addCoalesceColumnFromAliases(column: string, tableAliases: string[], columnAlias = column): string {
    return this.baseResolver.addCoalesceColumnFromAliases(column, tableAliases, columnAlias);
  }

  public addCoalesceExpression(tableQualifiedColumns: [string, string][], columnAlias?: string): string {
    return this.baseResolver.addCoalesceExpressionFromAliases(
      tableQualifiedColumns.map(([table, column]) => [this.getTableAlias(table), column]),
      columnAlias
    );
  }

  public addCoalesceExpressionFromAliases(aliasQualifiedColumns: [string, string][], columnAlias?: string): string {
    return this.baseResolver.addCoalesceExpressionFromAliases(aliasQualifiedColumns, columnAlias);
  }

  public addAliasField(field: string, columnAlias: string): this {
    this.addSelectAlias(columnAlias);
    this.addField(field, (row) => row[columnAlias]);
    return this;
  }

  public addColumnField(
    field: string,
    column: string,
    table?: string,
    func?: (value: SqlValue, row: Row) => unknown
  ): this {
    const alias = this.addSelectColumn(column, table);
    this.addField(field, func ? (row) => func(row[alias], row) : (row) => row[alias]);
    return this;
  }

  public addCoalesceColumnField(
    field: string,
    column: string,
    tables: string[],
    func?: (value: SqlValue, row: Row) => unknown
  ): this {
    const alias = this.addCoalesceColumn(column, tables);
    this.addField(field, func ? (row) => func(row[alias], row) : (row) => row[alias]);
    return this;
  }

  public addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this {
    const actualAlias = this.addSelectExpression(expr, alias);
    this.addField(field, (row) => row[actualAlias]);
    return this;
  }

  public addObjectField(field: string, join?: EquiJoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver {
    const resolver = this.baseResolver.createObjectResolver(
      this,
      this.resolveJoin(join),
      this.defaultTable,
      field,
      typeNameOrFn
    );
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public addUnionField(field: string, joins: UnionJoinSpec[]): SqlQueryResolver {
    const resolver = this.baseResolver.createUnionResolver(this, joins, field);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public addColumnListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    column: string,
    func?: (value: SqlValue, row: Row) => unknown
  ): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolvePrimaryJoin(join));
    const alias = resolver.addSelectColumn(column);
    this.addField(field, (parentRow, _, fetchMap) =>
      resolver.buildJsonList(fetchMap, parentRow, func ? (row) => func(row[alias], row) : (row) => row[alias])
    );
    return resolver;
  }

  public addExpressionListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    expr: string | Knex.Raw,
    alias?: string
  ): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolvePrimaryJoin(join));
    const actualAlias = resolver.addSelectExpression(expr, alias);
    this.addField(field, (parentRow, _, fetchMap) =>
      resolver.buildJsonList(fetchMap, parentRow, (row) => row[actualAlias])
    );
    return resolver;
  }

  public addDerivedListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    func: (row: Row) => SqlValue
  ): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolvePrimaryJoin(join));
    this.addField(field, (parentRow, _, fetchMap) => resolver.buildJsonList(fetchMap, parentRow, func));
    return resolver;
  }

  public addObjectListField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    typeNameOrFn?: TypeNameOrFunction
  ): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolvePrimaryJoin(join), typeNameOrFn);
    this.addField(field, (parentRow, parentRowMap, fetchMap) =>
      resolver.buildObjectList(fetchMap, parentRow, parentRowMap)
    );
    return resolver;
  }

  public addConnectionField(
    field: string,
    join: EquiJoinSpec | EquiJoinSpec[],
    args: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction
  ): SqlConnectionResolver {
    const resolver = this.baseResolver.createConnectionResolver(
      this,
      this.resolvePrimaryJoin(join),
      args,
      typeNameOrFn
    );
    this.addField(field, (row, parentRowMap, fetchMap) => resolver.buildResultFor(row, parentRowMap, fetchMap) as Row);
    return resolver;
  }

  public addOrderBy(column: string, table = this.defaultTable, descending?: boolean): this {
    this.baseResolver.addOrderBy(column, table, descending);
    return this;
  }

  public addOrderByCoalesce(column: string, tables: string[], descending?: boolean): this {
    this.baseResolver.addOrderByCoalesce(column, tables, descending);
    return this;
  }

  public addOrderByAlias(columnAlias: string, descending?: boolean): this {
    this.baseResolver.addOrderByAlias(columnAlias, descending);
    return this;
  }

  public addCursorAlias(columnAlias: string): this {
    this.baseResolver.addCursorAlias(columnAlias);
    return this;
  }

  public addFetchFilter(filter: FetchFilter): this {
    this.baseResolver.addFetchFilter(filter);
    return this;
  }

  public buildResult(data: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): Record<string, unknown> | null {
    if (this.testColumn && data[this.testColumn] == null) {
      return null;
    }
    return super.buildResult(data, parentRowMap, fetchMap);
  }

  public walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    config?: (resolver: this) => void,
    options?: WalkOptions
  ): this {
    if (config) {
      config(this);
    }
    walkSelections(this, info, this.visitors.object, undefined, options);
    return this;
  }
}
