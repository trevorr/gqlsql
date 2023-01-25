import { FragmentDefinitionNode, GraphQLSchema, OperationDefinitionNode } from 'graphql';

// global, non-field-specific members of GraphQLResolveInfo
export interface GraphQLQueryInfo {
  readonly schema: GraphQLSchema;
  readonly fragments: { [key: string]: FragmentDefinitionNode };
  readonly rootValue: unknown;
  readonly operation: OperationDefinitionNode;
  readonly variableValues: { [variableName: string]: unknown };
}
