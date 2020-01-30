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
  [key: string]: RecursiveVisitor<TContext> | undefined;
  [FieldVisitorDefault]?: RecursiveVisitor<TContext>;
}

export interface ShallowFieldVisitors<TContext = any, TNestedContext = any> {
  [key: string]: ShallowVisitor<TContext, TNestedContext> | undefined;
  [FieldVisitorDefault]?: ShallowVisitor<TContext, TNestedContext>;
}

export interface TypeVisitors<TContext = any> {
  [key: string]: FieldVisitors<TContext> | undefined;
}
