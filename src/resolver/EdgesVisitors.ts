import { ShallowFieldVisitors, walkSelections } from '../visitor';
import { SqlEdgesResolver, SqlQueryResolver } from './api';

export const EdgesVisitors: ShallowFieldVisitors<SqlEdgesResolver, SqlQueryResolver> = {
  cursor(context, info): void {
    context.addCursor(info.fieldName);
  },
  node(context, info, visitors): void {
    walkSelections(context.addNode(info.fieldName), info, visitors);
  }
};
