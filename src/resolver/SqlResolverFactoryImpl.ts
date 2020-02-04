import Knex from 'knex';
import { ResolverArgs, SqlQueryResolver, SqlResolverFactory, SqlResolverOptions } from './api';
import { ChildSqlConnectionResolver } from './ChildSqlConnectionResolver';
import { ChildSqlQueryResolver } from './ChildSqlQueryResolver';
import { BaseSqlQueryResolver, InternalSqlResolverFactory, SqlConnectionChildResolver } from './internal';
import { EquiJoinSpec } from './JoinSpec';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { RootSqlConnectionResolver } from './RootSqlConnectionResolver';
import { RootSqlQueryResolver } from './RootSqlQueryResolver';

class SqlResolverFactoryImpl implements InternalSqlResolverFactory {
  public constructor(private readonly knex: Knex, private readonly defaultOptions?: Partial<SqlResolverOptions>) {}

  public createQuery(table: string, args?: ResolverArgs, options?: Partial<SqlResolverOptions>): RootSqlQueryResolver {
    return new RootSqlQueryResolver(this, this.knex, table, args, Object.assign({}, this.defaultOptions, options));
  }

  public createConnection(
    table: string,
    args?: ResolverArgs,
    options?: Partial<SqlResolverOptions>
  ): RootSqlConnectionResolver {
    return new RootSqlConnectionResolver(this.createQuery(table, args, options));
  }

  public createChildConnection(
    parentResolver: BaseSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    join: EquiJoinSpec,
    args: ResolverArgs,
    options?: Partial<SqlResolverOptions>
  ): SqlConnectionChildResolver {
    return new ChildSqlConnectionResolver(
      new ChildSqlQueryResolver(
        this,
        parentResolver as KnexSqlQueryResolver,
        outerResolver,
        join,
        args,
        Object.assign({}, this.defaultOptions, options)
      )
    );
  }
}

export function createFactory(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverFactory {
  return new SqlResolverFactoryImpl(knex, defaultOptions);
}
