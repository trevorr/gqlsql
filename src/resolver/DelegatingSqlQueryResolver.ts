import { GraphQLResolveInfo } from 'graphql';
import Knex from 'knex';
import { GraphQLVisitorInfo, WalkOptions, walkSelections } from '../visitor';
import {
  FetchFilter,
  Json,
  JsonObject,
  ResolverArgs,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlTypeVisitors,
  TypeNameOrFunction
} from './api';
import { BaseSqlQueryResolver, FetchMap, ParentRowMap } from './internal';
import { EquiJoinSpec, isEquiJoin, JoinSpec, UnionJoinSpec } from './JoinSpec';
import { getTypeNameFromRow } from './KnexSqlQueryResolver';
import { TableResolver } from './TableResolver';
import { getTableName, Row, RowsQueryBuilder } from './TableSpec';

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

  public get visitors(): SqlTypeVisitors {
    return this.baseResolver.visitors;
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

  public setDistinct(): this {
    this.baseResolver.setDistinct();
    return this;
  }

  public addSelectColumn(column: string, table = this.defaultTable): string {
    return this.baseResolver.addSelectColumnFromAlias(column, this.getTableAlias(table));
  }

  public addSelectColumnFromAlias(column: string, tableAlias: string): string {
    return this.baseResolver.addSelectColumnFromAlias(column, tableAlias);
  }

  public addSelectExpression(expr: string | Knex.Raw, alias?: string): string {
    return this.baseResolver.addSelectExpression(expr, alias);
  }

  public addCoalesceColumn(column: string, tables: string[]): string {
    return this.baseResolver.addCoalesceExpressionFromAliases(
      tables.map(table => [this.getTableAlias(table), column]),
      column
    );
  }

  public addCoalesceColumnFromAliases(column: string, tableAliases: string[]): string {
    return this.baseResolver.addCoalesceColumnFromAliases(column, tableAliases);
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

  public addColumnField(field: string, column: string, table?: string, func?: (value: any, row: Row) => Json): this {
    const alias = this.addSelectColumn(column, table);
    this.addField(field, func ? row => func(row[alias], row) : row => row[alias]);
    return this;
  }

  public addCoalesceColumnField(
    field: string,
    column: string,
    tables: string[],
    func?: (value: any, row: Row) => Json
  ): this {
    const alias = this.addCoalesceColumn(column, tables);
    this.addField(field, func ? row => func(row[alias], row) : row => row[alias]);
    return this;
  }

  public addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this {
    const actualAlias = this.addSelectExpression(expr, alias);
    this.addField(field, row => row[actualAlias]);
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
    const resolver = this.baseResolver.createUnionResolver(this, this.resolveJoins(joins), field);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public addColumnListField(
    field: string,
    join: EquiJoinSpec,
    column: string,
    func?: (value: any, row: Row) => Json
  ): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolveJoin(join));
    const alias = resolver.addSelectColumn(column);
    this.addField(field, (parentRow, _, fetchMap) =>
      resolver.buildJsonList(fetchMap, parentRow, func ? row => func(row[alias], row) : row => row[alias])
    );
    return resolver;
  }

  public addExpressionListField(
    field: string,
    join: EquiJoinSpec,
    expr: string | Knex.Raw,
    alias?: string
  ): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolveJoin(join));
    const actualAlias = resolver.addSelectExpression(expr, alias);
    this.addField(field, (parentRow, _, fetchMap) =>
      resolver.buildJsonList(fetchMap, parentRow, row => row[actualAlias])
    );
    return resolver;
  }

  public addDerivedListField(field: string, join: EquiJoinSpec, func: (row: Row) => Json): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolveJoin(join));
    this.addField(field, (parentRow, _, fetchMap) => resolver.buildJsonList(fetchMap, parentRow, func));
    return resolver;
  }

  public addObjectListField(field: string, join: EquiJoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolveJoin(join), typeNameOrFn);
    this.addField(field, (parentRow, parentRowMap, fetchMap) =>
      resolver.buildObjectList(fetchMap, parentRow, parentRowMap)
    );
    return resolver;
  }

  public addConnectionField(
    field: string,
    join: EquiJoinSpec,
    args: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction
  ): SqlConnectionResolver {
    const resolver = this.baseResolver.createConnectionResolver(this, this.resolveJoin(join), args, typeNameOrFn);
    this.addField(
      field,
      (row, parentRowMap, fetchMap) => resolver.buildResultFor(row, parentRowMap, fetchMap) as JsonObject
    );
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

  public addFetchFilter(filter: FetchFilter): this {
    this.baseResolver.addFetchFilter(filter);
    return this;
  }

  public buildResult(data: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): JsonObject | null {
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
