import { AbstractSqlConnectionResolver } from './AbstractSqlConnectionResolver';
import { Connection, JsonObject, Row } from './api';
import { ChildSqlQueryResolver } from './ChildSqlQueryResolver';
import { FetchMap, ParentRowMap, SqlConnectionChildResolver } from './internal';

export class ChildSqlConnectionResolver extends AbstractSqlConnectionResolver<ChildSqlQueryResolver>
  implements SqlConnectionChildResolver {
  public buildResultFor(
    parentRow: Row,
    parentRowMap: ParentRowMap,
    fetchMap: FetchMap
  ): Partial<Connection<JsonObject>> {
    const fetchLookup = fetchMap.get(this.nodeResolver);
    const data = fetchLookup!(parentRow);
    return this.buildObject(data, parentRowMap, fetchMap);
  }
}
