import { PropertyDumper } from 'dumpable';
import { Knex } from 'knex';
import { isFromColumns } from '.';
import { ResolverArgs, SqlQueryResolver, SqlResolverOptions, TypeNameOrFunction } from './api';
import { qualifyColumnOrAliasRef } from './ColumnRef';
import { ContainingSqlQueryResolver } from './ContainingSqlQueryResolver';
import { FetchMap, FetchResult, InternalSqlResolverFactory, ParentRowMap, SqlChildQueryResolver } from './internal';
import { EquiJoinSpec, getConnectingKey, getFromKey, getToKey, isEquiJoin, isSameKey, JoinSpec } from './JoinSpec';
import { getKnexSelectColumn, KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { getTableName, Row, RowsQueryBuilder } from './TableSpec';
import { findMap } from './util';

type KeyValue = string | number;

const PartitionRowColumn = 'partition_row';
const WindowSubqueryAlias = 'windowed';

export class ChildSqlQueryResolver extends KnexSqlQueryResolver implements SqlChildQueryResolver {
  private readonly parentResolver: KnexSqlQueryResolver;
  private readonly primaryJoin: EquiJoinSpec;
  private readonly fromSelects: string[] = [];
  private readonly toSelects: string[] = [];

  public constructor(
    resolverFactory: InternalSqlResolverFactory,
    parentResolver: KnexSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    joins: EquiJoinSpec[],
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ) {
    super(
      resolverFactory,
      parentResolver.getKnex(),
      joins[0].toTable,
      getTableName(joins[joins.length - 1].toTable),
      args,
      typeNameOrFn,
      options,
      parentResolver.data
    );
    this.parentResolver = parentResolver;

    // add tables before columns in case of qualified columns referring to tables later in the join chain
    const join = (this.primaryJoin = joins[0]);
    const toTable = getTableName(join.toTable);
    this.addTableAlias(toTable, join.toAlias || toTable);
    if (joins.length > 1) {
      for (let i = 1; i < joins.length; ++i) {
        this.addTable(joins[i]);
      }
    }

    for (let i = 0; i < join.toColumns.length; ++i) {
      const fromSelect = isFromColumns(join)
        ? outerResolver.addSelectColumn(join.fromColumns[i], join.fromTable)
        : outerResolver.addSelectAlias(join.fromColumnAliases[i]);
      this.fromSelects.push(fromSelect);
      const toSelect = this.addSelectColumn(join.toColumns[i], toTable);
      this.toSelects.push(toSelect);
      this.addOrderByAlias(toSelect);
    }
  }

  public addObjectField(field: string, join?: JoinSpec, typeNameOrFn?: TypeNameOrFunction): SqlQueryResolver {
    // possibly joining back to one of the parent tables?
    if (
      join &&
      isEquiJoin(join) &&
      isSameKey(getFromKey((join = this.resolveJoin(join))), getToKey(this.primaryJoin))
    ) {
      const toKey = getToKey(join);
      let fromKey = getFromKey(this.primaryJoin);
      for (;;) {
        // did we connect joins to target table?
        if (isSameKey(fromKey, toKey)) {
          const resolver = new ContainingSqlQueryResolver(
            this.parentResolver,
            this.parentResolver,
            getTableName(join.toTable)
          );
          this.addField(field, resolver.buildResult.bind(resolver));
          return resolver;
        }

        // search parent for transitive joins
        const parentJoins = this.parentResolver.getJoins();
        const nextKey = findMap(parentJoins, (pj) => isEquiJoin(pj) && getConnectingKey(pj, fromKey));
        if (!nextKey) {
          break;
        }
        fromKey = nextKey;
      }
    }
    return super.addObjectField(field, join, typeNameOrFn);
  }

  protected applyPageLimit(query: RowsQueryBuilder): RowsQueryBuilder {
    /*
    SELECT * FROM
      (SELECT ..., ROW_NUMBER() OVER (PARTITION BY fkid ORDER BY ...) AS partition_row
        FROM ... WHERE fkid IN (...) ORDER BY fkid, ...) windowed
      WHERE partition_row <= ...;
    */
    const limit = this.getLimit();
    if (Number.isInteger(limit) && !this.fetchFilters.length) {
      const { toTable, toColumns } = this.primaryJoin;
      const toTableName = getTableName(toTable);
      let sql = 'row_number() over (';
      let nextParam = 'partition by ??';
      const bindings = [];
      for (const toColumn of toColumns) {
        sql += nextParam;
        bindings.push(getKnexSelectColumn({ table: toTableName, column: toColumn }));
        nextParam = ', ??';
      }

      nextParam = ' order by ??';
      const orderBys = this.orderByColumns.values();
      orderBys.next(); // skip join to-column
      for (const orderBy of orderBys) {
        sql += nextParam;
        bindings.push(orderBy.name);
        if (orderBy.descending) {
          sql += ' desc';
        }
        nextParam = ', ??';
      }

      sql += ') as ??';
      bindings.push(PartitionRowColumn);

      query = this.knex
        .select()
        .from(query.select(this.knex.raw(sql, bindings)).as(WindowSubqueryAlias))
        .where(PartitionRowColumn, '<=', limit + 1) as Knex.QueryBuilder as RowsQueryBuilder;
    }
    return query;
  }

  public async fetch(parentRows: Row[], fetchMap: FetchMap): Promise<void> {
    const parentKeys = getAllRowKeys(parentRows, this.fromSelects);
    const allRows = await this.fetchRows(parentKeys);
    const childrenPromise = this.fetchChildren(allRows, fetchMap);
    const dataByParentKey = allRows.reduce<Map<string, [KeyValue[], Row[]]>>((map, row) => {
      const keys = getRowKeys(row, this.toSelects);
      const keyString = makeKeyString(keys);
      let data = map.get(keyString);
      if (!data) {
        map.set(keyString, (data = [keys, []]));
      }
      data[1].push(row);
      return map;
    }, new Map<string, [KeyValue[], Row[]]>());
    const resultByParentKey = new Map<string, FetchResult>();
    const totalCountKeys = [];
    for (const [keyString, [keys, groupRows]] of dataByParentKey.entries()) {
      const filteredRows = this.filterFetch(groupRows);
      const result = this.buildFetchResult(filteredRows);
      if (this.needTotalCount) {
        if (result.hasNextPage) {
          totalCountKeys.push(keys);
        } else {
          result.totalCount = filteredRows.length;
        }
      }
      resultByParentKey.set(keyString, result);
    }
    if (totalCountKeys.length > 0) {
      const totalCounts = await this.fetchTotalCounts(totalCountKeys);
      for (const row of totalCounts) {
        const keys = getRowKeys(row, this.toSelects);
        const keyString = makeKeyString(keys);
        const result = resultByParentKey.get(keyString);
        if (result) {
          result.totalCount = Number(row.totalCount);
        }
      }
    }
    fetchMap.set(this, (parentRow) => {
      if (parentRow) {
        const keys = getRowKeys(parentRow, this.fromSelects);
        const keyString = makeKeyString(keys);
        const result = resultByParentKey.get(keyString);
        if (result) {
          return result;
        }
      }
      const result = this.buildFetchResult([]);
      result.totalCount = 0;
      return result;
    });
    return childrenPromise;
  }

  private async fetchRows(parentKeys: KeyValue[][]): Promise<Row[]> {
    if (!parentKeys.length) return [];
    const baseQuery = this.getBaseQuery().clone();
    const { toTable, toColumns, toRestrictions = [] } = this.primaryJoin;
    const toTableName = getTableName(toTable);
    const qualifiedColumns = toColumns.map((toColumn) => getKnexSelectColumn({ table: toTableName, column: toColumn }));
    baseQuery.whereIn(qualifiedColumns, parentKeys);
    for (const r of toRestrictions) {
      const c = qualifyColumnOrAliasRef(r, toTableName);
      if ('value' in r) {
        baseQuery.where(c, r.operator || '=', this.knex.raw('?', [r.value]));
      } else {
        baseQuery.whereIn(c, r.values);
      }
    }
    const dataQuery = this.buildDataQuery(baseQuery);
    return this.options.sqlExecutor.execute(dataQuery);
  }

  private fetchTotalCounts(parentKeys: KeyValue[][]): Promise<Row[]> {
    const baseQuery = this.getBaseQuery().clone();
    const { toTable, toColumns } = this.primaryJoin;
    const toTableName = getTableName(toTable);
    const qualifiedColumns = toColumns.map((toColumn) => getKnexSelectColumn({ table: toTableName, column: toColumn }));
    const countQuery = this.buildTotalCountQuery(
      baseQuery.select(qualifiedColumns).whereIn(qualifiedColumns, parentKeys).groupBy(qualifiedColumns)
    );
    return this.options.sqlExecutor.execute(countQuery);
  }

  public buildObjectList(fetchMap: FetchMap, parentRow: Row, parentRowMap: ParentRowMap): Record<string, unknown>[] {
    const fetchLookup = fetchMap.get(this);
    const data = fetchLookup!(parentRow);
    return data.rows.map((row) => this.buildObject(row, parentRowMap, fetchMap));
  }

  public buildJsonList(fetchMap: FetchMap, parentRow: Row, func: (row: Row) => unknown): unknown[] {
    const fetchLookup = fetchMap.get(this);
    const data = fetchLookup!(parentRow);
    return data.rows.map(func).filter((v) => v !== undefined);
  }

  public dumpProperties(d: PropertyDumper): void {
    super.dumpProperties(d);
    d.addRef('parentResolver', this.parentResolver);
    d.add('join', this.primaryJoin);
  }
}

function getAllRowKeys(rows: Row[], columns: string[]): KeyValue[][] {
  return rows.filter((row) => columns.every((column) => row[column] != null)).map((row) => getRowKeys(row, columns));
}

function getRowKeys(row: Row, columns: string[]): KeyValue[] {
  return columns.reduce((keys, column) => {
    keys.push(row[column] as KeyValue);
    return keys;
  }, [] as KeyValue[]);
}

function makeKeyString(keys: KeyValue[]): string {
  return keys.join('\t');
}
