import { PropertyDumper } from 'dumpable';
import { GraphQLResolveInfo } from 'graphql';
import Knex from 'knex';
import { snakeCase } from 'snake-case';
import { Memoize } from 'typescript-memoize';
import { GraphQLVisitorInfo, WalkOptions, walkSelections } from '../visitor';
import {
  FetchFilter,
  Json,
  JsonObject,
  ResolverArgs,
  SqlConnectionResolver,
  SqlQueryResolver,
  SqlResolverOptions,
  SqlTypeVisitors,
  TypeNameFunction,
  TypeNameOrFunction
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
import { getTableName, getTableQuery, isDerivedTable, Row, RowsQueryBuilder, TableLike } from './TableSpec';

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

interface UnionTableInfo {
  join: UnionJoinSpec;
  testColumn: string;
}

const DefaultTypeVisitors: SqlTypeVisitors = {
  object: {},
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
  private readonly args: ResolverArgs;
  private readonly typeNameOrFn?: TypeNameOrFunction;
  protected readonly options: SqlResolverOptions;
  public readonly data: Record<string, any>;
  public readonly visitors: SqlTypeVisitors;
  private readonly selects = new Map<string, Select>();
  private distinct = false;
  protected readonly orderByColumns = new Map<string, OrderByColumn>();
  private readonly cursorColumns: string[] = [];
  protected readonly reverseOrder: boolean;
  private readonly joinTables = new Map<string, JoinTable>();
  private readonly childResolvers: SqlChildQueryResolver[] = [];
  protected readonly fetchFilters: FetchFilter[] = [];
  protected needTotalCount = false;

  public constructor(
    resolverFactory: InternalSqlResolverFactory,
    knex: Knex,
    baseTable: TableLike,
    args: ResolverArgs = {},
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>,
    data?: Record<string, any>
  ) {
    super(getTableName(baseTable));
    this.resolverFactory = resolverFactory;
    this.knex = knex;
    this.args = args;
    this.typeNameOrFn = typeNameOrFn;
    this.options = Object.assign({}, DefaultResolverOptions, options);
    this.data = data || Object.assign({}, this.options.initialData);
    this.visitors = Object.assign({}, DefaultTypeVisitors, this.options.visitors);
    this.baseQuery = (this.options.transaction || knex)(getTableQuery(baseTable));
    this.reverseOrder = args.last != null && args.first == null;
  }

  public withData(data: Record<string, any>): this {
    Object.assign(this.data, data);
    return this;
  }

  public getKnex(): Knex {
    return this.knex;
  }

  public getBaseQuery(): RowsQueryBuilder {
    return this.baseQuery;
  }

  public getArguments(): ResolverArgs {
    return this.args;
  }

  public getTypeNameFromRow(row: Row): string | null {
    return getTypeNameFromRow(this.typeNameOrFn, row);
  }

  public setDistinct(): this {
    this.distinct = true;
    return this;
  }

  public addSelectColumn(column: string, table = this.defaultTable): string {
    return this.addSelectColumnFromAlias(column, this.getTableAlias(table));
  }

  public addSelectColumnFromAlias(column: string, tableAlias: string): string {
    this.checkTableAlias(tableAlias, column);
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

  public addCoalesceColumn(column: string, tables: string[]): string {
    return this.addCoalesceExpressionFromAliases(
      tables.map(table => [this.getTableAlias(table), column]),
      column
    );
  }

  public addCoalesceColumnFromAliases(column: string, tableAliases: string[]): string {
    return this.addCoalesceExpressionFromAliases(
      tableAliases.map(tableAlias => [tableAlias, column]),
      column
    );
  }

  public addCoalesceExpression(tableQualifiedColumns: [string, string][], columnAlias?: string): string {
    return this.addCoalesceExpressionFromAliases(
      tableQualifiedColumns.map(([table, column]) => [this.getTableAlias(table), column]),
      columnAlias
    );
  }

  public addCoalesceExpressionFromAliases(aliasQualifiedColumns: [string, string][], columnAlias?: string): string {
    if (aliasQualifiedColumns.length === 1) {
      const [table, column] = aliasQualifiedColumns[0];
      this.checkTableAlias(table, column);
      return this.addSelectAlias({ table, column }, columnAlias ?? column);
    }

    let sql = 'coalesce(';
    let nextParam = '??.??';
    const bindings = [];
    for (const [tableAlias, column] of aliasQualifiedColumns) {
      this.checkTableAlias(tableAlias, column);
      sql += nextParam;
      bindings.push(tableAlias, column);
      nextParam = ', ??.??';
    }
    sql += ')';
    return this.addSelectExpression(this.knex.raw(sql, bindings), columnAlias);
  }

  private checkTableAlias(tableAlias: string, column: string): void {
    if (tableAlias !== this.defaultTable) {
      const ext = this.joinTables.get(tableAlias);
      if (!ext) {
        throw new Error(`Table alias "${tableAlias}" not found for select of "${column}"`);
      }
      ext.referenced = true;
    }
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
    let table;
    if (isEquiJoin(join)) {
      if (join.forced) {
        table = this.applyJoin(this.baseQuery, join);
      } else {
        table = getTableName(join.toTable);
      }
    } else {
      table = join.toAlias;
    }
    this.addTableAlias(table, alias);
    return this;
  }

  public forceTable(table: string): this {
    this.forceTableAlias(this.getTableAlias(table));
    return this;
  }

  public forceTableAlias(tableAlias: string): this {
    if (tableAlias !== this.defaultTable) {
      const ext = this.joinTables.get(tableAlias);
      if (!ext) {
        throw new Error(`Join not found for table alias "${tableAlias}"`);
      }
      if (isEquiJoin(ext.join) && !ext.join.forced) {
        ext.join.forced = true;
        this.applyJoin(this.baseQuery, ext.join);
      }
      ext.referenced = true;
    }
    return this;
  }

  public addJoinAlias(join: JoinSpec, aliasPrefix: string | null): string {
    if (isEquiJoin(join)) {
      let baseAlias;
      const { toAlias, toTable } = join;
      if (isDerivedTable(toTable)) {
        baseAlias = getTableName(toTable);
      } else {
        baseAlias = toAlias || (aliasPrefix && aliasPrefix !== toTable ? `${aliasPrefix}_${toTable}` : toTable);
      }
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

  public createObjectResolver(
    outerResolver: TableResolver,
    join: JoinSpec | undefined,
    defaultTable: string,
    field: string,
    typeNameOrFn?: TypeNameOrFunction
  ): DelegatingSqlQueryResolver {
    let tableAlias, testColumn;
    if (join) {
      tableAlias = this.addJoinAlias(join, snakeCase(field));
      defaultTable = getTableName(getJoinTable(join));
      if (join.toColumns && join.toColumns.length) {
        testColumn = this.addSelectColumnFromAlias(join.toColumns[0], tableAlias);
      }
    }
    return new DelegatingSqlQueryResolver(this, outerResolver, typeNameOrFn, defaultTable, tableAlias, testColumn);
  }

  public addObjectField(field: string, join?: JoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver {
    const resolver = this.createObjectResolver(this, this.resolveJoin(join), this.defaultTable, field, typeNameOrFn);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public createUnionResolver(
    outerResolver: TableResolver,
    joins: UnionJoinSpec[],
    field: string
  ): DelegatingSqlQueryResolver {
    const tables: UnionTableInfo[] = [];

    const typeNameFn: TypeNameFunction = row => {
      let result = null;
      for (const table of tables) {
        if (row[table.testColumn] != null) {
          // returns the last column found, in case an earlier table representing a supertype is joined
          // to later tables representing subtypes and one of the subtypes does not have its own table
          // (and thus its type name is associated with the supertype table)
          result = table.join.typeName;
        }
      }
      return result;
    };

    const resolver = new DelegatingSqlQueryResolver(this, outerResolver, typeNameFn);
    resolver.addDerivedField('__typename', typeNameFn);

    const aliasPrefix = snakeCase(field);
    for (let join of joins) {
      // ensure fromTable and fromAlias are specified, based on aliases defined
      // in the union resolver, potentially including those added by prior joins
      join = resolver.resolveJoin(join);

      // determine toAlias and add it to the union resolver for use by subsequent joins or selects
      const tableAlias = this.addJoinAlias(join, aliasPrefix);
      if (tableAlias !== join.toAlias) {
        join = { ...join, toAlias: tableAlias };
      }
      resolver.addTableAlias(getTableName(join.toTable), tableAlias);

      const testColumn = this.addSelectColumnFromAlias(join.toColumns[0], tableAlias);
      tables.push({ join, testColumn });
    }

    return resolver;
  }

  public addUnionField(field: string, joins: UnionJoinSpec[]): SqlQueryResolver {
    const resolver = this.createUnionResolver(this, joins, field);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public createChildResolver(
    outerResolver: TableResolver & SqlQueryResolver,
    join: EquiJoinSpec,
    typeNameOrFn?: TypeNameOrFunction
  ): SqlChildQueryResolver {
    const options = { defaultLimit: Infinity, maxLimit: Infinity }; // don't limit plain lists
    const resolver = this.resolverFactory.createChildQuery(this, outerResolver, join, undefined, typeNameOrFn, options);
    this.childResolvers.push(resolver);
    return resolver;
  }

  public addColumnListField(
    field: string,
    join: EquiJoinSpec,
    column: string,
    func?: (value: any, row: Row) => Json
  ): SqlQueryResolver {
    const resolver = this.createChildResolver(this, this.resolveJoin(join));
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
    const resolver = this.createChildResolver(this, this.resolveJoin(join));
    const actualAlias = resolver.addSelectExpression(expr, alias);
    this.addField(field, (parentRow, _, fetchMap) =>
      resolver.buildJsonList(fetchMap, parentRow, row => row[actualAlias])
    );
    return resolver;
  }

  public addDerivedListField(field: string, join: EquiJoinSpec, func: (row: Row) => Json): SqlQueryResolver {
    const resolver = this.createChildResolver(this, this.resolveJoin(join));
    this.addField(field, (parentRow, _, fetchMap) => resolver.buildJsonList(fetchMap, parentRow, func));
    return resolver;
  }

  public addObjectListField(field: string, join: EquiJoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver {
    const resolver = this.createChildResolver(this, this.resolveJoin(join), typeNameOrFn);
    this.addField(field, (parentRow, parentRowMap, fetchMap) =>
      resolver.buildObjectList(fetchMap, parentRow, parentRowMap)
    );
    return resolver;
  }

  public createConnectionResolver(
    outerResolver: TableResolver & SqlQueryResolver,
    join: EquiJoinSpec,
    args: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction
  ): SqlConnectionChildResolver {
    const resolver = this.resolverFactory.createChildConnection(this, outerResolver, join, args, typeNameOrFn);
    this.childResolvers.push(resolver.getNodeResolver());
    return resolver;
  }

  public addConnectionField(
    field: string,
    join: EquiJoinSpec,
    args: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction
  ): SqlConnectionResolver {
    const resolver = this.createConnectionResolver(this, this.resolveJoin(join), args, typeNameOrFn);
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

  public addOrderByCoalesce(column: string, tables: string[], descending?: boolean): this {
    this.addOrderByAlias(this.addCoalesceColumn(column, tables), descending);
    return this;
  }

  public addOrderByAlias(columnAlias: string, descending = false): this {
    if (!this.orderByColumns.has(columnAlias)) {
      if (this.reverseOrder) {
        descending = !descending;
      }
      this.orderByColumns.set(columnAlias, { name: columnAlias, descending });
      this.cursorColumns.push(columnAlias);
    }
    return this;
  }

  public addCursorAlias(columnAlias: string): this {
    if (!this.cursorColumns.includes(columnAlias)) {
      this.cursorColumns.push(columnAlias);
    }
    return this;
  }

  public addFetchFilter(filter: FetchFilter): this {
    this.fetchFilters.push(filter);
    return this;
  }

  public getCursor(row: Row): string {
    return makeCursor(row, this.cursorColumns);
  }

  public addTotalCount(): void {
    this.needTotalCount = true;
  }

  protected async fetchChildren(parentRows: Row[], map: FetchMap): Promise<void> {
    await Promise.all(this.childResolvers.map(resolver => resolver.fetch(parentRows, map)));
  }

  public getDataQuery(): RowsQueryBuilder {
    return this.buildDataQuery(this.baseQuery.clone());
  }

  protected buildDataQuery(query: RowsQueryBuilder): RowsQueryBuilder {
    query = this.applyJoinTables(query);
    query = this.applySelect(query);
    query = this.applyOrderBy(query);
    query = this.applyPageRange(query);
    query = this.applyPageLimit(query);
    return query;
  }

  public getSearchQuery(): RowsQueryBuilder {
    return this.buildSearchQuery(this.baseQuery.clone());
  }

  protected buildSearchQuery(query: RowsQueryBuilder): RowsQueryBuilder {
    query = this.applyJoinTables(query);
    query = this.applySelect(query);
    return query;
  }

  protected applyJoinTables(query: RowsQueryBuilder): RowsQueryBuilder {
    for (const table of this.joinTables.values()) {
      if (table.referenced) {
        const { join } = table;
        if (isEquiJoin(join) && !join.forced) {
          this.applyJoin(query, join);
        }
      }
    }
    return query;
  }

  protected applyJoin(query: RowsQueryBuilder, join: EquiJoinSpec): string {
    const {
      toTable,
      toAlias = getTableName(toTable),
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
    return toAlias;
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
    const columns = Array.from(this.selects.values(), select =>
      isSelectColumn(select) ? getKnexSelectColumn(select) : getKnexSelectExpression(this.knex, select)
    );
    return this.distinct ? query.distinct(columns) : query.select(columns);
  }

  protected applyOrderBy(query: RowsQueryBuilder): RowsQueryBuilder {
    return query.orderBy(Array.from(this.orderByColumns.values()).map(getKnexOrderBy));
  }

  protected applyPageRange(query: RowsQueryBuilder): RowsQueryBuilder {
    const { args } = this;
    if (args.after || args.before) {
      const sortFields = this.cursorColumns;
      const whereFields = sortFields.map(f => {
        const select = this.selects.get(f);
        if (select && 'table' in select) {
          const { table, column } = select;
          return `${table}.${column}`;
        }
        return f;
      });
      if (args.after) {
        query = applyCursorFilter(query, args.after, '>', sortFields, whereFields);
      }
      if (args.before) {
        query = applyCursorFilter(query, args.before, '<', sortFields, whereFields);
      }
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

  protected filterFetch(rows: Row[]): Row[] {
    return this.fetchFilters.reduce((rows, filter) => filter(rows), rows);
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
    d.add('joinTables', this.joinTables);
    d.add('cursorColumns', this.cursorColumns);
  }
}

export function getTypeNameFromRow(typeNameOrFn: TypeNameOrFunction | undefined, row: Row): string | null {
  if (typeof typeNameOrFn === 'string') {
    return typeNameOrFn;
  }
  if (typeof typeNameOrFn === 'function') {
    return typeNameOrFn(row);
  }
  return null;
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

function getKnexJoinTable(join: EquiJoinSpec): Knex.TableDescriptor | Knex.AliasDict {
  const { toAlias, toTable } = join;
  if (isDerivedTable(toTable)) {
    return toTable.query; // should already be aliased with toTable.name
  }
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
