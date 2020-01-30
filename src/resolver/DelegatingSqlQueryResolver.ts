import { GraphQLResolveInfo } from 'graphql';
import Knex from 'knex';
import { GraphQLVisitorInfo, TypeVisitors, WalkOptions, walkSelections } from '../visitor';
import {
  ConnectionArgs,
  Json,
  JsonObject,
  RowsQueryBuilder,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlTypeVisitors,
  SqlUnionQueryResolver
} from './api';
import { BaseSqlQueryResolver } from './internal';
import { EquiJoinSpec, isEquiJoin, JoinSpec, UnionJoinSpec } from './JoinSpec';
import { TableResolver } from './TableResolver';

export class DelegatingSqlQueryResolver extends TableResolver implements SqlQueryResolver {
  protected readonly baseResolver: BaseSqlQueryResolver;

  public constructor(
    baseResolver: BaseSqlQueryResolver,
    outerResolver: TableResolver | undefined,
    defaultTable: string = (outerResolver || baseResolver).getDefaultTable(),
    tableAlias: string = (outerResolver || baseResolver).getTableAlias(defaultTable)
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

  public addTable(join: JoinSpec): this {
    const alias = this.baseResolver.addJoinAlias(this.resolveJoin(join), null);
    this.addTableAlias(isEquiJoin(join) ? join.toTable : join.toAlias, alias);
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

  public addColumnField(field: string, column: string, table?: string, func?: (value: any) => Json): this {
    const alias = this.addSelectColumn(column, table);
    this.addField(field, func ? row => func(row[alias]) : row => row[alias]);
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

  public addConnection(field: string, join: EquiJoinSpec, args: ConnectionArgs): SqlConnectionResolver {
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
