import { JsonObject, Row } from './api';
import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';
import { FetchMap, ParentRowMap, SqlContainingQueryResolver } from './internal';

export class ContainingSqlQueryResolver extends DelegatingSqlQueryResolver implements SqlContainingQueryResolver {
  public buildResult(_row: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): JsonObject {
    const parentRow = parentRowMap.get(this.getBaseResolver()) || {};
    return super.buildResult(parentRow, parentRowMap, fetchMap);
  }
}
