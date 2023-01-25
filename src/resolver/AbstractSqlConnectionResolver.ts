import { getNamedType, GraphQLResolveInfo } from 'graphql';
import { WalkOptions, walkSelections } from '../visitor';
import { GraphQLVisitorInfo } from '../visitor/GraphQLVisitorInfo';
import { SqlConnectionResolver, SqlEdgeResolver, SqlPageInfoResolver, SqlQueryResolver, SqlTypeVisitors } from './api';
import { ConnectionVisitors } from './ConnectionVisitors';
import { FieldResolver } from './FieldResolver';
import { FetchResult } from './internal';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { SqlEdgeResolverImpl } from './SqlEdgeResolverImpl';
import { SqlPageInfoResolverImpl } from './SqlPageInfoResolverImpl';

export class AbstractSqlConnectionResolver<TNR extends KnexSqlQueryResolver>
  extends FieldResolver<FetchResult>
  implements SqlConnectionResolver
{
  protected readonly nodeResolver: TNR;
  protected readonly edgeResolver: SqlEdgeResolverImpl;

  public constructor(nodeResolver: TNR) {
    super();
    this.nodeResolver = nodeResolver;
    this.edgeResolver = new SqlEdgeResolverImpl(nodeResolver, nodeResolver);
  }

  public get data(): Record<string, unknown> {
    return this.nodeResolver.data;
  }

  public get visitors(): SqlTypeVisitors {
    return this.nodeResolver.visitors;
  }

  public withData(data: Record<string, unknown>): this {
    this.nodeResolver.withData(data);
    return this;
  }

  public getNodeResolver(): TNR {
    return this.nodeResolver;
  }

  public getEdgesResolver(): SqlEdgeResolver {
    return this.edgeResolver;
  }

  public addEdges(field: string): SqlEdgeResolver {
    this.addField(field, (data, parentRowMap, fetchMap) =>
      data.rows.map((row) => {
        parentRowMap.set(this.nodeResolver, row);
        return this.edgeResolver.buildResult(row, parentRowMap, fetchMap);
      })
    );
    return this.edgeResolver;
  }

  public addNodes(field: string): SqlQueryResolver {
    this.addField(field, (data, parentRowMap, fetchMap) =>
      data.rows.map((row) => {
        parentRowMap.set(this.nodeResolver, row);
        return this.nodeResolver.buildResult(row, parentRowMap, fetchMap);
      })
    );
    return this.nodeResolver;
  }

  public addPageInfo(field: string): SqlPageInfoResolver {
    const resolver = new SqlPageInfoResolverImpl(this.nodeResolver);
    this.addField(field, resolver.buildResult.bind(resolver));
    return resolver;
  }

  public addTotalCount(field: string): void {
    this.nodeResolver.addTotalCount();
    this.addField(field, (data) => data.totalCount || 0);
  }

  public walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    config?: (nodeResolver: SqlQueryResolver) => void,
    options?: WalkOptions
  ): this {
    if (config) {
      config(this.nodeResolver);
    }
    const fieldVisitors = this.visitors.connection[getNamedType(info.returnType).name] || ConnectionVisitors;
    walkSelections(this, info, this.visitors.object, fieldVisitors, options);
    return this;
  }
}
