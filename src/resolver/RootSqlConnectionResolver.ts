import { AbstractSqlConnectionResolver } from './AbstractSqlConnectionResolver';
import { Connection, JsonObject, SqlConnectionRootResolver } from './api';
import { RootSqlQueryResolver } from './RootSqlQueryResolver';

export class RootSqlConnectionResolver extends AbstractSqlConnectionResolver<RootSqlQueryResolver>
  implements SqlConnectionRootResolver {
  public async execute(): Promise<Partial<Connection<JsonObject>>> {
    const fetchMap = await this.nodeResolver.fetch();
    const fetchLookup = fetchMap.get(this.nodeResolver);
    const result = fetchLookup!();
    const parentRowMap = new Map();
    return this.buildObject(result, parentRowMap, fetchMap);
  }
}
