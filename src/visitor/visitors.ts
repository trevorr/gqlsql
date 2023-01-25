import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';

export const FieldVisitorDefault: unique symbol = Symbol('Fallback key for field visitors');

export type RecursiveVisitor<TContext = unknown> = (
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>
) => TContext | void;

export type ShallowVisitor<TContext = unknown, TNestedContext = unknown> = (
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>
) => TNestedContext | void;

export interface FieldVisitors<TContext = unknown> {
  readonly [key: string]: RecursiveVisitor<TContext> | undefined;
  readonly [FieldVisitorDefault]?: RecursiveVisitor<TContext>;
}

export interface ShallowFieldVisitors<TContext = unknown, TNestedContext = unknown> {
  readonly [key: string]: ShallowVisitor<TContext, TNestedContext> | undefined;
  readonly [FieldVisitorDefault]?: ShallowVisitor<TContext, TNestedContext>;
}

export interface TypeVisitors<TContext = unknown> {
  readonly [key: string]: FieldVisitors<TContext> | undefined;
}

export interface ShallowTypeVisitors<TContext = unknown, TNestedContext = unknown> {
  readonly [key: string]: ShallowFieldVisitors<TContext, TNestedContext> | undefined;
}
