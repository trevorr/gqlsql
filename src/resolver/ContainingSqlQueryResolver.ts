import { DelegatingSqlQueryResolver } from './DelegatingSqlQueryResolver';
import { FetchMap, ParentRowMap, SqlContainingQueryResolver } from './internal';
import { Row } from './TableSpec';

export class ContainingSqlQueryResolver extends DelegatingSqlQueryResolver implements SqlContainingQueryResolver {
  public buildResult(_row: Row, parentRowMap: ParentRowMap, fetchMap: FetchMap): Record<string, unknown> | null {
    const parentRow = parentRowMap.get(this.getBaseResolver()) || {};
    return super.buildResult(parentRow, parentRowMap, fetchMap);
  }
}
