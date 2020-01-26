import { QueryBuilder } from 'knex';
import { ConnectionArgs, Row, RowsQueryBuilder, SqlQueryResolver, SqlResolverOptions } from './api';
import { ContainingSqlQueryResolver } from './ContainingSqlQueryResolver';
import { FetchMap, FetchResult, InternalSqlResolverFactory, SqlChildQueryResolver } from './internal';
import { EquiJoinSpec, getConnectingKey, getFromKey, getToKey, isEquiJoin, isSameKey, JoinSpec } from './JoinSpec';
import { getKnexSelectColumn, KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { findMap } from './util';
import { PropertyDumper } from 'dumpable';

type KeyValue = string | number;

const PartitionRowColumn = 'partition_row';
const WindowSubqueryAlias = 'windowed';

export class ChildSqlQueryResolver extends KnexSqlQueryResolver implements SqlChildQueryResolver {
  private readonly parentResolver: KnexSqlQueryResolver;
  private readonly join: EquiJoinSpec;

  public constructor(
    resolverFactory: InternalSqlResolverFactory,
    parentResolver: KnexSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    join: EquiJoinSpec,
    args?: ConnectionArgs,
    options?: Partial<SqlResolverOptions>
  ) {
    super(resolverFactory, parentResolver.getKnex(), join.toTable, args, options);
    this.parentResolver = parentResolver;
    this.join = join;
    for (let i = 0; i < join.toColumns.length; ++i) {
      outerResolver.addSelectColumn(join.fromColumns[i], join.fromTable);
      this.addOrderBy(join.toColumns[i], join.toTable);
    }
  }

  public addObjectField(field: string, join?: JoinSpec): SqlQueryResolver {
    // possibly joining back to one of the parent tables?
    if (join && isEquiJoin(join) && isSameKey(getFromKey((join = this.resolveJoin(join))), getToKey(this.join))) {
      const toKey = getToKey(join);
      let fromKey = getFromKey(this.join);
      for (;;) {
        // did we connect joins to target table?
        if (isSameKey(fromKey, toKey)) {
          const resolver = new ContainingSqlQueryResolver(this.parentResolver, this.parentResolver, join.toTable);
          this.addField(field, resolver.buildResult.bind(resolver));
          return resolver;
        }

        // search parent for transitive joins
        const parentJoins = this.parentResolver.getJoins();
        const nextKey = findMap(parentJoins, pj => isEquiJoin(pj) && getConnectingKey(pj, fromKey));
        if (!nextKey) {
          break;
        }
        fromKey = nextKey;
      }
    }
    return super.addObjectField(field, join);
  }

  protected applyPageLimit(query: RowsQueryBuilder): RowsQueryBuilder {
    /*
    SELECT * FROM
      (SELECT ..., ROW_NUMBER() OVER (PARTITION BY fkid ORDER BY ...) AS partition_row
        FROM ... WHERE fkid IN (...) ORDER BY fkid, ...) windowed
      WHERE partition_row <= ...;
    */
    const limit = this.getLimit();
    if (Number.isInteger(limit)) {
      const { toTable, toColumns } = this.join;
      let sql = 'row_number() over (';
      let nextParam = 'partition by ??';
      const bindings = [];
      for (const toColumn of toColumns) {
        sql += nextParam;
        bindings.push(getKnexSelectColumn({ table: toTable, column: toColumn }));
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

      query = (this.knex
        .select()
        .from(query.select(this.knex.raw(sql, bindings)).as(WindowSubqueryAlias))
        .where(PartitionRowColumn, '<=', limit + 1) as QueryBuilder) as RowsQueryBuilder;
    }
    return query;
  }

  public async fetch(parentRows: Row[], fetchMap: FetchMap): Promise<void> {
    const { fromColumns, toColumns } = this.join;
    const parentKeys = getAllRowKeys(parentRows, fromColumns);
    const rows = await this.fetchRows(parentKeys);
    const childrenPromise = this.fetchChildren(rows, fetchMap);
    const dataByParentKey = rows.reduce<Map<string, [KeyValue[], Row[]]>>((map, row) => {
      const keys = getRowKeys(row, toColumns);
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
    for (const [keyString, [keys, rows]] of dataByParentKey.entries()) {
      const result = this.buildFetchResult(rows);
      if (this.needTotalCount) {
        if (result.hasNextPage) {
          totalCountKeys.push(keys);
        } else {
          result.totalCount = rows.length;
        }
      }
      resultByParentKey.set(keyString, result);
    }
    if (totalCountKeys.length > 0) {
      const totalCounts = await this.fetchTotalCounts(totalCountKeys);
      for (const row of totalCounts) {
        const keys = getRowKeys(row, toColumns);
        const keyString = makeKeyString(keys);
        const result = resultByParentKey.get(keyString);
        if (result) {
          result.totalCount = parseInt(row.totalCount);
        }
      }
    }
    fetchMap.set(this, parentRow => {
      if (parentRow) {
        const keys = getRowKeys(parentRow, fromColumns);
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

  private fetchRows(parentKeys: KeyValue[][]): Promise<Row[]> {
    const baseQuery = this.getBaseQuery().clone();
    const { toTable, toColumns, toRestrictions = [] } = this.join;
    const qualifiedColumns = toColumns.map(toColumn => getKnexSelectColumn({ table: toTable, column: toColumn }));
    baseQuery.whereIn(qualifiedColumns, parentKeys);
    for (const r of toRestrictions) {
      if ('value' in r) {
        baseQuery.where(`${toTable}.${r.column}`, r.operator || '=', this.knex.raw('?', [r.value]));
      } else {
        baseQuery.whereIn(`${toTable}.${r.column}`, r.values);
      }
    }
    const dataQuery = this.buildDataQuery(baseQuery);
    return this.options.sqlExecutor.execute(dataQuery);
  }

  private fetchTotalCounts(parentKeys: KeyValue[][]): Promise<Row[]> {
    const baseQuery = this.getBaseQuery().clone();
    const { toTable, toColumns } = this.join;
    const qualifiedColumns = toColumns.map(toColumn => getKnexSelectColumn({ table: toTable, column: toColumn }));
    const countQuery = this.buildTotalCountQuery(
      baseQuery
        .select(qualifiedColumns)
        .whereIn(qualifiedColumns, parentKeys)
        .groupBy(qualifiedColumns)
    );
    return this.options.sqlExecutor.execute(countQuery);
  }

  public dumpProperties(d: PropertyDumper): void {
    super.dumpProperties(d);
    d.addRef('parentResolver', this.parentResolver);
    d.add('join', this.join);
  }
}

function getAllRowKeys(rows: Row[], columns: string[]): KeyValue[][] {
  return rows.map(row => getRowKeys(row, columns));
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
