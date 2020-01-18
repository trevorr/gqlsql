import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';

export type RecursiveVisitor<TContext = any> = (
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>
) => TContext | void;

export type ShallowVisitor<TContext = any, TNestedContext = any> = (
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>
) => void;

export interface FieldVisitors<TContext = any> {
  [key: string]: RecursiveVisitor<TContext> | undefined;
}

export interface ShallowFieldVisitors<TContext = any, TNestedContext = any> {
  [key: string]: ShallowVisitor<TContext, TNestedContext> | undefined;
}

export interface TypeVisitors<TContext = any> {
  [key: string]: FieldVisitors<TContext> | undefined;
}
