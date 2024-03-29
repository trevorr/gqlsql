import { AbstractSqlConnectionResolver } from './AbstractSqlConnectionResolver';
import { Connection } from './api';
import { ChildSqlQueryResolver } from './ChildSqlQueryResolver';
import { FetchMap, ParentRowMap, SqlConnectionChildResolver } from './internal';
import { Row } from './TableSpec';

export class ChildSqlConnectionResolver
  extends AbstractSqlConnectionResolver<ChildSqlQueryResolver>
  implements SqlConnectionChildResolver
{
  public buildResultFor(parentRow: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): Partial<Connection> {
    const fetchLookup = fetchMap.get(this.nodeResolver);
    const data = fetchLookup!(parentRow);
    const obj = this.buildObject(data, parentRowMap, fetchMap);
    if (!data.rows.length) {
      obj.__emptyConnection = true;
    }
    return obj;
  }
}
