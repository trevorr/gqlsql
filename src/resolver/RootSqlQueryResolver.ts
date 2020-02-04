import Knex from 'knex';
import {
  JsonObject,
  ResolverArgs,
  Row,
  RowsQueryBuilder,
  SqlQueryResolver,
  SqlQueryRootResolver,
  SqlResolverOptions
} from './api';
import { FetchLookup, FetchMap, InternalSqlResolverFactory } from './internal';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';

export class RootSqlQueryResolver extends KnexSqlQueryResolver implements SqlQueryRootResolver {
  private lookup = false;

  public constructor(
    resolverFactory: InternalSqlResolverFactory,
    knex: Knex,
    baseTable: string,
    args?: ResolverArgs,
    options?: Partial<SqlResolverOptions>
  ) {
    super(resolverFactory, knex, baseTable, args, options);
  }

  protected applyPageLimit(query: RowsQueryBuilder): RowsQueryBuilder {
    if (this.lookup) {
      query.limit(1);
    } else {
      const limit = this.getLimit();
      if (Number.isInteger(limit)) {
        query.limit(limit + 1);
      }
    }
    return query;
  }

  public async fetch(): Promise<FetchMap> {
    const map = new Map<SqlQueryResolver, FetchLookup>();
    const rows = await this.fetchRows();
    const result = this.buildFetchResult(rows);
    if (this.needTotalCount) {
      if (result.hasNextPage) {
        result.totalCount = await this.fetchTotalCount();
      } else {
        result.totalCount = rows.length;
      }
    }
    map.set(this, () => result);
    await this.fetchChildren(rows, map);
    return map;
  }

  private fetchRows(): Promise<Row[]> {
    const query = this.buildDataQuery(this.getBaseQuery().clone());
    return this.options.sqlExecutor.execute(query);
  }

  private async fetchTotalCount(): Promise<number> {
    const query = this.buildTotalCountQuery(this.getBaseQuery().clone());
    const rows = await this.options.sqlExecutor.execute(query);
    return parseInt(rows[0].totalCount);
  }

  public async execute(): Promise<JsonObject[]> {
    const fetchMap = await this.fetch();
    const fetchLookup = fetchMap.get(this);
    const result = fetchLookup!();
    const parentRowMap = new Map();
    return result.rows.map(row => {
      parentRowMap.set(this, row);
      return this.buildResult(row, parentRowMap, fetchMap);
    });
  }

  public async executeLookup(): Promise<JsonObject | null> {
    this.lookup = true;
    const rows = await this.execute();
    return rows.length > 0 ? rows[0] : null;
  }
}
