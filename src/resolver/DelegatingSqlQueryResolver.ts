import { GraphQLResolveInfo } from 'graphql';
import Knex from 'knex';
import { GraphQLVisitorInfo, WalkOptions, walkSelections } from '../visitor';
import {
  FetchFilter,
  Json,
  JsonObject,
  ResolverArgs,
  Row,
  RowsQueryBuilder,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlTypeVisitors,
  SqlUnionQueryResolver
} from './api';
import { BaseSqlQueryResolver, FetchMap, ParentRowMap } from './internal';
import { EquiJoinSpec, isEquiJoin, JoinSpec, UnionJoinSpec } from './JoinSpec';
import { TableResolver } from './TableResolver';

export class DelegatingSqlQueryResolver extends TableResolver implements SqlQueryResolver {
  protected readonly baseResolver: BaseSqlQueryResolver;

  public constructor(
    baseResolver: BaseSqlQueryResolver,
    outerResolver: TableResolver | undefined,
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

  public getArguments(): ResolverArgs {
    return this.baseResolver.getArguments();
  }

  public addTable(join: JoinSpec): this {
    const alias = this.baseResolver.addJoinAlias(this.resolveJoin(join), null);
    this.addTableAlias(isEquiJoin(join) ? join.toTable : join.toAlias, alias);
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

  public addColumnField(field: string, column: string, table?: string, func?: (value: any, row: Row) => Json): this {
    const alias = this.addSelectColumn(column, table);
    this.addField(field, func ? row => func(row[alias], row) : row => row[alias]);
    return this;
  }

  public addExpressionField(field: string, expr: string | Knex.Raw, alias?: string): this {
    const actualAlias = this.addSelectExpression(expr, alias);
    this.addField(field, row => row[actualAlias]);
    return this;
  }

  public addObjectField(field: string, join?: JoinSpec): SqlQueryResolver {
    const resolver = this.baseResolver.createObjectResolver(this, this.resolveJoin(join), this.defaultTable, field);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public addUnionField(field: string, joins: UnionJoinSpec[]): SqlUnionQueryResolver {
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

  public addObjectListField(field: string, join: EquiJoinSpec): SqlQueryResolver {
    const resolver = this.baseResolver.createChildResolver(this, this.resolveJoin(join));
    this.addField(field, (parentRow, parentRowMap, fetchMap) =>
      resolver.buildObjectList(fetchMap, parentRow, parentRowMap)
    );
    return resolver;
  }

  public addConnectionField(field: string, join: EquiJoinSpec, args: ResolverArgs): SqlConnectionResolver {
    const resolver = this.baseResolver.createConnectionResolver(this, this.resolveJoin(join), args);
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
