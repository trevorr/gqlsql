import { JsonObject } from './api';
import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';
import { FetchMap, ParentRowMap, SqlContainingQueryResolver } from './internal';
import { Row } from './TableSpec';

export class ContainingSqlQueryResolver extends DelegatingSqlQueryResolver implements SqlContainingQueryResolver {
  public buildResult(_row: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): JsonObject | null {
    const parentRow = parentRowMap.get(this.getBaseResolver()) || {};
    return super.buildResult(parentRow, parentRowMap, fetchMap);
  }
}
