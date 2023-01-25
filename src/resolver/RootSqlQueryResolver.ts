import { Knex } from 'knex';
import {
  ResolverArgs,
  SearchId,
  SearchRowTransform,
  SqlQueryResolver,
  SqlQueryRootResolver,
  SqlResolverOptions,
  TypeNameOrFunction,
} from './api';
import { FetchLookup, FetchMap, InternalSqlResolverFactory } from './internal';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { Row, RowsQueryBuilder, TableLike } from './TableSpec';
import { notNull } from './util';

export class RootSqlQueryResolver extends KnexSqlQueryResolver implements SqlQueryRootResolver {
  private lookup = false;

  public constructor(
    resolverFactory: InternalSqlResolverFactory,
    knex: Knex,
    baseTable: TableLike,
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ) {
    super(resolverFactory, knex, baseTable, undefined, args, typeNameOrFn, options);
  }

  protected applyPageLimit(query: RowsQueryBuilder): RowsQueryBuilder {
    if (this.lookup) {
      query.limit(1);
    } else if (!this.fetchFilters.length) {
      const limit = this.getLimit();
      if (Number.isInteger(limit)) {
        query.limit(limit + 1);
      }
    }
    return query;
  }

  public async fetch(): Promise<FetchMap> {
    const rows = this.filterFetch(await this.fetchRows());
    const result = this.buildFetchResult(rows);

    if (this.needTotalCount) {
      if (result.hasNextPage) {
        result.totalCount = await this.fetchTotalCount();
      } else {
        result.totalCount = rows.length;
      }
    }

    const map = new Map<SqlQueryResolver, FetchLookup>();
    map.set(this, () => result);
    await this.fetchChildren(rows, map);
    return map;
  }

  private fetchRows(): Promise<Row[]> {
    return this.options.sqlExecutor.execute(this.getDataQuery());
  }

  private async fetchTotalCount(): Promise<number> {
    const query = this.buildTotalCountQuery(this.getBaseQuery().clone());
    const rows = await this.options.sqlExecutor.execute(query);
    return Number(rows[0].totalCount);
  }

  public async fetchFromSearch(
    idColumn: string,
    idValues: SearchId[],
    totalCount: number,
    rowTransform?: SearchRowTransform
  ): Promise<FetchMap> {
    const idAlias = this.addSelectColumn(idColumn);
    const query = this.getSearchQuery().whereIn(this.qualifyColumn(idColumn), idValues);
    const rawRows = await this.options.sqlExecutor.execute(query);
    const rowsById = rawRows.reduce<Map<string, Row>>((map, row) => {
      map.set(String(row[idAlias]), row);
      return map;
    }, new Map<string, Row>());
    let rows = idValues.map((id) => rowsById.get(String(id))).filter(notNull);
    if (rowTransform) {
      rows = rows.map((row) => rowTransform(row, String(row[idAlias])));
    }
    rows = this.filterFetch(rows);
    const result = this.buildFetchResult(rows, idValues.length);

    if (this.needTotalCount) {
      result.totalCount = totalCount;
    }

    const map = new Map<SqlQueryResolver, FetchLookup>();
    map.set(this, () => result);
    await this.fetchChildren(rows, map);
    return map;
  }

  public async execute(): Promise<Record<string, unknown>[]> {
    const fetchMap = await this.fetch();
    const fetchLookup = fetchMap.get(this);
    const result = fetchLookup!();
    const parentRowMap = new Map();
    return result.rows.map((row) => {
      parentRowMap.set(this, row);
      return this.buildObject(row, parentRowMap, fetchMap);
    });
  }

  public async executeLookup(): Promise<Record<string, unknown> | null> {
    this.lookup = true;
    const rows = await this.execute();
    return rows.length > 0 ? rows[0] : null;
  }
}
