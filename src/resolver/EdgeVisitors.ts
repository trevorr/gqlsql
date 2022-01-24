import { ShallowFieldVisitors, walkSelections } from '../visitor';
import { SqlEdgeResolver, SqlQueryResolver } from './api';

export const EdgeVisitors: ShallowFieldVisitors<SqlEdgeResolver, SqlQueryResolver> = {
  cursor(context, info): void {
    context.addCursor(info.fieldName);
  },
  node(context, info, visitors): void {
    walkSelections(context.addNode(info.fieldName), info, visitors);
  },
};
