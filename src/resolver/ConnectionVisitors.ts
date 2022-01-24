import { getNamedType } from 'graphql';
import { ShallowFieldVisitors, walkSelections } from '../visitor';
import { SqlConnectionResolver, SqlQueryResolver } from './api';
import { EdgeVisitors } from './EdgeVisitors';
import { PageInfoVisitors } from './PageInfoVisitors';

export const ConnectionVisitors: ShallowFieldVisitors<SqlConnectionResolver, SqlQueryResolver> = {
  edges(context, info, visitors): void {
    const fieldVisitors = context.visitors.edge[getNamedType(info.returnType).name] || EdgeVisitors;
    walkSelections(context.addEdges(info.fieldName), info, visitors, fieldVisitors);
  },
  nodes(context, info, visitors): void {
    walkSelections(context.addNodes(info.fieldName), info, visitors);
  },
  pageInfo(context, info): void {
    const fieldVisitors = context.visitors.pageInfo[getNamedType(info.returnType).name] || PageInfoVisitors;
    walkSelections(context.addPageInfo(info.fieldName), info, {}, fieldVisitors);
  },
  totalCount(context, info): void {
    context.addTotalCount(info.fieldName);
  },
};
