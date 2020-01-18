import { GraphQLResolveInfo } from 'graphql';
import { TypeVisitors, WalkOptions, walkSelections } from '../visitor';
import { GraphQLVisitorInfo } from '../visitor/GraphQLVisitorInfo';
import { SqlConnectionResolver, SqlEdgesResolver, SqlPageInfoResolver, SqlQueryResolver } from './api';
import { ConnectionVisitors } from './ConnectionVisitors';
import { FieldResolver } from './FieldResolver';
import { FetchResult } from './internal';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { SqlEdgesResolverImpl } from './SqlEdgesResolverImpl';
import { SqlPageInfoResolverImpl } from './SqlPageInfoResolverImpl';

export class AbstractSqlConnectionResolver<TNR extends KnexSqlQueryResolver> extends FieldResolver<FetchResult>
  implements SqlConnectionResolver {
  protected readonly nodeResolver: TNR;
  protected readonly edgesResolver: SqlEdgesResolverImpl;

  public constructor(nodeResolver: TNR) {
    super();
    this.nodeResolver = nodeResolver;
    this.edgesResolver = new SqlEdgesResolverImpl(nodeResolver, nodeResolver);
  }

  public getNodeResolver(): TNR {
    return this.nodeResolver;
  }

  public getEdgesResolver(): SqlEdgesResolver {
    return this.edgesResolver;
  }

  public addEdges(field: string): SqlEdgesResolver {
    this.addField(field, (data, parentRowMap, fetchMap) =>
      data.rows.map(row => {
        parentRowMap.set(this.nodeResolver, row);
        return this.edgesResolver.buildResult(row, parentRowMap, fetchMap);
      })
    );
    return this.edgesResolver;
  }

  public addNodes(field: string): SqlQueryResolver {
    this.addField(field, (data, parentRowMap, fetchMap) =>
      data.rows.map(row => {
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
    this.addField(field, data => data.totalCount || 0);
  }

  public walk(
    info: GraphQLVisitorInfo | GraphQLResolveInfo,
    visitors: TypeVisitors<SqlQueryResolver>,
    config?: (nodeResolver: SqlQueryResolver) => void,
    options?: WalkOptions
  ): this {
    if (config) {
      config(this.nodeResolver);
    }
    walkSelections(this, info, visitors, ConnectionVisitors, options);
    return this;
  }
}
