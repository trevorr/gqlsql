import { ShallowFieldVisitors, walkSelections } from '../visitor';
import { SqlConnectionResolver, SqlQueryResolver, SqlEdgesResolver } from './api';
import { EdgesVisitors } from './EdgesVisitors';
import { PageInfoVisitors } from './PageInfoVisitors';
import { getNamedType } from 'graphql';

export const ConnectionVisitors: ShallowFieldVisitors<SqlConnectionResolver, SqlQueryResolver> = {
  edges(context, info, visitors): void {
    const fieldVisitors = visitors[getNamedType(info.returnType).name] as ShallowFieldVisitors<
      SqlEdgesResolver,
      SqlQueryResolver
    >;
    walkSelections(context.addEdges(info.fieldName), info, visitors, fieldVisitors || EdgesVisitors);
  },
  nodes(context, info, visitors): void {
    walkSelections(context.addNodes(info.fieldName), info, visitors);
  },
  pageInfo(context, info): void {
    walkSelections(context.addPageInfo(info.fieldName), info, {}, PageInfoVisitors);
  },
  totalCount(context, info): void {
    context.addTotalCount(info.fieldName);
  }
};
