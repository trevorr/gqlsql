import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';

export const FieldVisitorDefault: unique symbol = Symbol('Fallback key for field visitors');

export type RecursiveVisitor<TContext = any> = (
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>
) => TContext | void;

export type ShallowVisitor<TContext = any, TNestedContext = any> = (
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>
) => TNestedContext | void;

export interface FieldVisitors<TContext = any> {
  readonly [key: string]: RecursiveVisitor<TContext> | undefined;
  readonly [FieldVisitorDefault]?: RecursiveVisitor<TContext>;
}

export interface ShallowFieldVisitors<TContext = any, TNestedContext = any> {
  readonly [key: string]: ShallowVisitor<TContext, TNestedContext> | undefined;
  readonly [FieldVisitorDefault]?: ShallowVisitor<TContext, TNestedContext>;
}

export interface TypeVisitors<TContext = any> {
  readonly [key: string]: FieldVisitors<TContext> | undefined;
}

export interface ShallowTypeVisitors<TContext = any, TNestedContext = any> {
  readonly [key: string]: ShallowFieldVisitors<TContext, TNestedContext> | undefined;
}
