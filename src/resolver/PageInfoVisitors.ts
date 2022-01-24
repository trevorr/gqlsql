import { ShallowFieldVisitors } from '../visitor';
import { SqlPageInfoResolver } from './api';

export const PageInfoVisitors: ShallowFieldVisitors<SqlPageInfoResolver, void> = {
  hasPreviousPage(context, info): void {
    context.addHasPreviousPage(info.fieldName);
  },
  hasNextPage(context, info): void {
    context.addHasNextPage(info.fieldName);
  },
  startCursor(context, info): void {
    context.addStartCursor(info.fieldName);
  },
  endCursor(context, info): void {
    context.addEndCursor(info.fieldName);
  },
};
