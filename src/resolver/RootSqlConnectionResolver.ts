import { AbstractSqlConnectionResolver } from './AbstractSqlConnectionResolver';
import { Connection, SearchId, SearchRowTransform, SqlConnectionRootResolver } from './api';
import { FetchMap } from './internal';
import { RootSqlQueryResolver } from './RootSqlQueryResolver';

export class RootSqlConnectionResolver
  extends AbstractSqlConnectionResolver<RootSqlQueryResolver>
  implements SqlConnectionRootResolver
{
  public async execute(): Promise<Partial<Connection>> {
    return this.fetchMapToObject(await this.nodeResolver.fetch());
  }

  public async executeFromSearch(
    idColumn: string,
    idValues: SearchId[],
    totalCount: number,
    rowTransform?: SearchRowTransform
  ): Promise<Partial<Connection>> {
    return this.fetchMapToObject(await this.nodeResolver.fetchFromSearch(idColumn, idValues, totalCount, rowTransform));
  }

  private fetchMapToObject(fetchMap: FetchMap): Partial<Connection> {
    const fetchLookup = fetchMap.get(this.nodeResolver);
    const result = fetchLookup!();
    const parentRowMap = new Map();
    return this.buildObject(result, parentRowMap, fetchMap);
  }
}
