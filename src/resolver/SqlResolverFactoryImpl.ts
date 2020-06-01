import Knex from 'knex';
import { ResolverArgs, SqlQueryResolver, SqlResolverFactory, SqlResolverOptions, TypeNameOrFunction } from './api';
import { ChildSqlConnectionResolver } from './ChildSqlConnectionResolver';
import { ChildSqlQueryResolver } from './ChildSqlQueryResolver';
import { BaseSqlQueryResolver, InternalSqlResolverFactory } from './internal';
import { EquiJoinSpec } from './JoinSpec';
import { KnexSqlQueryResolver } from './KnexSqlQueryResolver';
import { RootSqlConnectionResolver } from './RootSqlConnectionResolver';
import { RootSqlQueryResolver } from './RootSqlQueryResolver';

class SqlResolverFactoryImpl implements InternalSqlResolverFactory {
  public constructor(private readonly knex: Knex, private readonly defaultOptions?: Partial<SqlResolverOptions>) {}

  public createQuery(
    table: string,
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ): RootSqlQueryResolver {
    return new RootSqlQueryResolver(
      this,
      this.knex,
      table,
      args,
      typeNameOrFn ?? null,
      Object.assign({}, this.defaultOptions, options)
    );
  }

  public createConnection(
    table: string,
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ): RootSqlConnectionResolver {
    return new RootSqlConnectionResolver(this.createQuery(table, args, typeNameOrFn, options));
  }

  public createChildQuery(
    parentResolver: BaseSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    join: EquiJoinSpec,
    args?: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ): ChildSqlQueryResolver {
    return new ChildSqlQueryResolver(
      this,
      parentResolver as KnexSqlQueryResolver,
      outerResolver,
      join,
      args,
      typeNameOrFn,
      Object.assign({}, this.defaultOptions, options)
    );
  }

  public createChildConnection(
    parentResolver: BaseSqlQueryResolver,
    outerResolver: SqlQueryResolver,
    join: EquiJoinSpec,
    args: ResolverArgs,
    typeNameOrFn?: TypeNameOrFunction,
    options?: Partial<SqlResolverOptions>
  ): ChildSqlConnectionResolver {
    return new ChildSqlConnectionResolver(
      this.createChildQuery(parentResolver, outerResolver, join, args, typeNameOrFn, options)
    );
  }
}

export function createFactory(knex: Knex, defaultOptions?: Partial<SqlResolverOptions>): SqlResolverFactory {
  return new SqlResolverFactoryImpl(knex, defaultOptions);
}
