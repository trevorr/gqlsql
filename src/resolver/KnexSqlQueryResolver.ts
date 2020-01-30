import { PropertyDumper } from 'dumpable';
import { GraphQLResolveInfo } from 'graphql';
import Knex, { AliasDict } from 'knex';
import { snakeCase } from 'snake-case';
import { Memoize } from 'typescript-memoize';
import { GraphQLVisitorInfo, WalkOptions, walkSelections } from '../visitor';
import {
  ConnectionArgs,
  Json,
  JsonObject,
  Row,
  RowsQueryBuilder,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlResolverOptions,
  SqlTypeVisitors,
  SqlUnionQueryResolver
} from './api';
import { ColumnRestriction } from './ColumnRestriction';
import { applyCursorFilter, makeCursor } from './cursor';
import { getDefaultSqlExecutor } from './DefaultSqlExecutor';
import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';
import {
  BaseSqlQueryResolver,
  FetchMap,
  FetchResult,
  InternalSqlResolverFactory,
  SqlChildQueryResolver,
  SqlConnectionChildResolver
} from './internal';
import { EquiJoinSpec, getJoinTable, isEquiJoin, isSameJoin, JoinSpec, UnionJoinSpec } from './JoinSpec';
import { TableResolver } from './TableResolver';
import { UnionSqlQueryResolver } from './UnionSqlQueryResolver';

interface SelectColumn {
  table: string;
  column: string;
  alias?: string;
}

interface SelectExpression {
  expr: string | Knex.Raw;
  alias: string;
}

type Select = SelectColumn | SelectExpression;

interface OrderByColumn {
  name: string; // column or alias
  descending: boolean;
}

interface JoinTable {
  join: JoinSpec;
  referenced: boolean;
}

const DefaultTypeVisitors: SqlTypeVisitors = {
  object: {},
  union: {},
  connection: {},
  edge: {},
  pageInfo: {}
};

const DefaultResolverOptions: SqlResolverOptions = {
  defaultLimit: 20,
  maxLimit: 100,
  sqlExecutor: getDefaultSqlExecutor(),
  visitors: {},
  userInputError: Error
};

export abstract class KnexSqlQueryResolver extends TableResolver implements BaseSqlQueryResolver {
  protected readonly resolverFactory: InternalSqlResolverFactory;
  protected readonly knex: Knex;
  private readonly baseQuery: RowsQueryBuilder;
  private readonly args: ConnectionArgs;
  protected readonly options: SqlResolverOptions;
  public readonly visitors: SqlTypeVisitors;
  private readonly selects = new Map<string, Select>();
  protected readonly orderByColumns = new Map<string, OrderByColumn>();
  private readonly orderByColumnNames: string[] = [];
  protected readonly reverseOrder: boolean;
  private readonly joinTables = new Map<string, JoinTable>();
  private readonly childResolvers: SqlChildQueryResolver[] = [];
  protected needTotalCount = false;

  public constructor(
    resolverFactory: InternalSqlResolverFactory,
    knex: Knex,
    baseTable: string,
    args: ConnectionArgs = {},
    options?: Partial<SqlResolverOptions>
  ) {
    super(baseTable, baseTable);
    this.resolverFactory = resolverFactory;
    this.knex = knex;
    this.baseQuery = knex(baseTable);
    this.args = args;
    this.options = Object.assign({}, DefaultResolverOptions, options);
    this.visitors = Object.assign({}, DefaultTypeVisitors, options?.visitors);
    this.reverseOrder = args.last != null && args.first == null;
  }

  public getKnex(): Knex {
    return this.knex;
  }

  public getBaseQuery(): RowsQueryBuilder {
    return this.baseQuery;
  }

  public addSelectColumn(column: string, table = this.defaultTable): string {
    return this.addSelectColumnFromAlias(column, this.getTableAlias(table));
  }

  public addSelectColumnFromAlias(column: string, tableAlias: string): string {
    if (tableAlias !== this.defaultTable) {
      const ext = this.joinTables.get(tableAlias);
      if (!ext) {
        throw new Error(`Table alias "${tableAlias}" not found for select of "${column}"`);
      }
      ext.referenced = true;
    }
    let name = column;
    const select = { column, table: tableAlias };
    const existing = this.selects.get(column);
    if (!existing) {
      this.selects.set(column, select);
    } else if (!isSameSelect(select, existing)) {
      name = this.addSelectAlias(select, `${tableAlias}_${column}`);
    }
    return name;
  }

  public addSelectExpression(expr: string | Knex.Raw, alias = 'expr'): string {
    return this.addSelectAlias({ expr, alias }, alias);
  }

  private addSelectAlias(select: Select, baseAlias: string): string {
    for (let index = 1, alias = baseAlias; ; ++index, alias = `${baseAlias}${index}`) {
      const existing = this.selects.get(alias);
      if (!existing) {
        this.selects.set(alias, { ...select, alias });
        return alias;
      } else if (isSameSelect(select, existing)) {
        return alias;
      }
    }
  }

  public addTable(join: JoinSpec): this {
    const alias = this.addJoinAlias(this.resolveJoin(join), null);
    this.addTableAlias(isEquiJoin(join) ? join.toTable : join.toAlias, alias);
    return this;
  }

  public addJoinAlias(join: JoinSpec, aliasPrefix: string | null): string {
    if (isEquiJoin(join)) {
      const { toAlias, toTable } = join;
      const baseAlias = toAlias || (aliasPrefix && aliasPrefix !== toTable ? `${aliasPrefix}_${toTable}` : toTable);
      return this.addEquiJoinAlias(join, baseAlias);
    } else {
      const { toAlias } = join;
      if (this.defaultTable !== toAlias) {
        const existing = this.joinTables.get(toAlias);
        if (!existing) {
          this.joinTables.set(toAlias, { join, referenced: false });
        } else if (!isSameJoin(join, existing.join)) {
          throw new Error(`Conflicting definition for provided join alias "${toAlias}"`);
        }
      }
      return toAlias;
    }
  }

  private addEquiJoinAlias(join: EquiJoinSpec, baseAlias: string): string {
    for (let alias = baseAlias, index = 1; ; ++index, alias = `${baseAlias}${index}`) {
      if (alias !== this.defaultTable) {
        const existing = this.joinTables.get(alias);
        if (!existing) {
          this.joinTables.set(alias, { join: { ...join, toAlias: alias }, referenced: !!join.forced });
          return alias;
        } else if (isSameJoin(join, existing.join)) {
          return alias;
        }
      }
    }
  }

  public getJoins(): readonly JoinSpec[] {
    return Array.from(this.joinTables.values(), jt => jt.join);
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

  public createObjectResolver(
    outerResolver: TableResolver,
    join: JoinSpec | undefined,
    defaultTable: string,
    field: string
  ): DelegatingSqlQueryResolver {
    let tableAlias;
    if (join) {
      tableAlias = this.addJoinAlias(join, snakeCase(field));
      defaultTable = getJoinTable(join);
    }
    return new DelegatingSqlQueryResolver(this, outerResolver, defaultTable, tableAlias);
  }

  public addObjectField(field: string, join?: JoinSpec): SqlQueryResolver {
    const resolver = this.createObjectResolver(this, this.resolveJoin(join), this.defaultTable, field);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public createUnionResolver(
    outerResolver: TableResolver,
    joins: UnionJoinSpec[],
    field: string
  ): UnionSqlQueryResolver {
    const tables = [];
    const aliasPrefix = snakeCase(field);
    for (let join of joins) {
      const tableAlias = this.addJoinAlias(join, aliasPrefix);
      if (tableAlias !== join.toAlias) {
        join = { ...join, toAlias: tableAlias };
      }
      const testColumn = this.addSelectColumnFromAlias(join.toColumns[0], tableAlias);
      tables.push({ join, testColumn });
    }
    return new UnionSqlQueryResolver(this, outerResolver, tables);
  }

  public addUnionField(field: string, joins: UnionJoinSpec[]): SqlUnionQueryResolver {
    const resolver = this.createUnionResolver(this, this.resolveJoins(joins), field);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public createConnectionResolver(
    outerResolver: TableResolver & SqlQueryResolver,
    join: EquiJoinSpec,
    args: ConnectionArgs
  ): SqlConnectionChildResolver {
    const resolver = this.resolverFactory.createChildConnection(this, outerResolver, join, args);
    this.childResolvers.push(resolver.getNodeResolver());
    return resolver;
  }

  public addConnection(field: string, join: EquiJoinSpec, args: ConnectionArgs): SqlConnectionResolver {
    const resolver = this.createConnectionResolver(this, this.resolveJoin(join), args);
    this.addField(
      field,
      (row, parentRowMap, fetchMap) => resolver.buildResultFor(row, parentRowMap, fetchMap) as JsonObject
    );
    return resolver;
  }

  public addOrderBy(column: string, table?: string, descending = false): this {
    let name;
    if (!table) {
      const select = this.selects.get(column);
      if (!select) {
        name = this.addSelectColumn(column);
      } else {
        name = column;
      }
    } else {
      name = this.addSelectColumn(column, table);
    }
    return this.addOrderByAlias(name, descending);
  }

  public addOrderByAlias(columnAlias: string, descending = false): this {
    if (!this.orderByColumns.has(columnAlias)) {
      if (this.reverseOrder) {
        descending = !descending;
      }
      this.orderByColumns.set(columnAlias, { name: columnAlias, descending });
      this.orderByColumnNames.push(columnAlias);
    }
    return this;
  }

  public getCursor(row: Row): string {
    return makeCursor(row, this.orderByColumnNames);
  }

  public addTotalCount(): void {
    this.needTotalCount = true;
  }

  protected async fetchChildren(parentRows: Row[], map: FetchMap): Promise<void> {
    await Promise.all(this.childResolvers.map(resolver => resolver.fetch(parentRows, map)));
  }

  protected buildDataQuery(query: RowsQueryBuilder): RowsQueryBuilder {
    query = this.applyJoinTables(query);
    query = this.applySelect(query);
    query = this.applyOrderBy(query);
    query = this.applyPageRange(query);
    query = this.applyPageLimit(query);
    return query;
  }

  protected applyJoinTables(query: RowsQueryBuilder): RowsQueryBuilder {
    for (const ext of this.joinTables.values()) {
      const { join } = ext;
      if (isEquiJoin(join) && (join.forced || ext.referenced)) {
        const {
          toTable,
          toAlias = toTable,
          fromTable = this.defaultTable,
          fromAlias = fromTable,
          toRestrictions = [],
          fromRestrictions = []
        } = join;
        query.leftJoin(getKnexJoinTable(join), clause => {
          for (let i = 0; i < join.toColumns.length; ++i) {
            clause.on(`${toAlias}.${join.toColumns[i]}`, `${fromAlias}.${join.fromColumns[i]}`);
          }
          this.addJoinRestrictions(clause, toAlias, toRestrictions);
          this.addJoinRestrictions(clause, fromAlias, fromRestrictions);
        });
      }
    }
    return query;
  }

  private addJoinRestrictions(clause: Knex.JoinClause, table: string, restrictions: ColumnRestriction[]): void {
    for (const r of restrictions) {
      if ('value' in r) {
        clause.on(`${table}.${r.column}`, r.operator || '=', this.knex.raw('?', [r.value]));
      } else {
        clause.onIn(`${table}.${r.column}`, r.values);
      }
    }
  }

  protected applySelect(query: RowsQueryBuilder): RowsQueryBuilder {
    return query.select(
      Array.from(this.selects.values()).map(select =>
        isSelectColumn(select) ? getKnexSelectColumn(select) : getKnexSelectExpression(this.knex, select)
      )
    );
  }

  protected applyOrderBy(query: RowsQueryBuilder): RowsQueryBuilder {
    return query.orderBy(Array.from(this.orderByColumns.values()).map(getKnexOrderBy));
  }

  protected applyPageRange(query: RowsQueryBuilder): RowsQueryBuilder {
    const { args, orderByColumnNames } = this;
    if (args.after) {
      query = applyCursorFilter(query, args.after, '>', orderByColumnNames);
    }
    if (args.before) {
      query = applyCursorFilter(query, args.before, '<', orderByColumnNames);
    }
    return query;
  }

  protected abstract applyPageLimit(query: RowsQueryBuilder): RowsQueryBuilder;

  @Memoize()
  protected getLimit(): number {
    const { args, options } = this;
    const { defaultLimit, maxLimit } = options;
    let limit = defaultLimit;
    const { first, last } = args;
    if (first != null) {
      if (first < 0) {
        throw new options.userInputError('first argument cannot be less than zero');
      }
      limit = Math.floor(first);
    }
    if (last != null) {
      if (last < 0) {
        throw new options.userInputError('last argument cannot be less than zero');
      }
      if (first == null) {
        limit = Math.floor(last);
      }
    }
    if (limit > maxLimit) {
      limit = maxLimit;
    }
    return limit;
  }

  protected buildFetchResult(rows: Row[]): FetchResult {
    let hasPreviousPage = false;
    let hasNextPage = false;
    const { args } = this;
    const limit = this.getLimit();
    if (!this.reverseOrder) {
      if (args.after) {
        hasPreviousPage = true;
      }
      if (rows.length > limit) {
        hasNextPage = true;
        rows.splice(limit);
      }
      if (args.last && rows.length > args.last) {
        hasPreviousPage = true;
        rows.splice(0, rows.length - args.last);
      }
    } else {
      if (args.before) {
        hasNextPage = true;
      }
      if (rows.length > limit) {
        hasPreviousPage = true;
        rows.splice(limit);
      }
      rows.reverse();
    }
    return {
      rows,
      hasPreviousPage,
      hasNextPage,
      afterCursor: args.after || undefined,
      beforeCursor: args.before || undefined
    };
  }

  protected buildTotalCountQuery(query: RowsQueryBuilder): RowsQueryBuilder {
    return query.count({ totalCount: '*' });
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

  public dumpProperties(d: PropertyDumper): void {
    super.dumpProperties(d);
    d.add('selects', this.selects.keys());
    d.add('orderBys', this.orderByColumnNames);
    d.add('joinTables', this.joinTables);
  }
}

export function getKnexSelectColumn(select: SelectColumn): string {
  const { table, column, alias } = select;
  let expr = `${table}.${column}`;
  if (alias) {
    expr += ` as ${alias}`;
  }
  return expr;
}

export function getKnexSelectExpression(knex: Knex, select: SelectExpression): Knex.Raw {
  const { expr, alias } = select;
  return typeof expr === 'string' ? knex.raw(`${expr} as ??`, [alias]) : knex.raw('? as ??', [expr, alias]);
}

function getKnexJoinTable(join: EquiJoinSpec): string | AliasDict {
  const { toAlias, toTable } = join;
  return toAlias && toAlias !== toTable ? { [toAlias]: toTable } : toTable;
}

function getKnexOrderBy(orderBy: OrderByColumn): { column: string; order: 'asc' | 'desc' } {
  const column = orderBy.name;
  const order = orderBy.descending ? 'desc' : 'asc';
  return { column, order };
}

function isSelectColumn(select: Select): select is SelectColumn {
  return 'column' in select;
}

function isSameSelect(a: Select, b: Select): boolean {
  if (isSelectColumn(a)) {
    return isSelectColumn(b) && a.column === b.column && a.table === b.table;
  } else {
    return !isSelectColumn(b) && a.expr === b.expr;
  }
}
