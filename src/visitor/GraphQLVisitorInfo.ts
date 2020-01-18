import { FieldNode, GraphQLCompositeType, GraphQLOutputType } from 'graphql';
import { Path } from 'graphql/jsutils/Path';
import { GraphQLQueryInfo } from './GraphQLQueryInfo';

// mirrors GraphQLResolveInfo with two key differences due to the concrete object type not being known:
// 1. contains a single FieldNode instead of an array,
//    since collecting same-named fields from fragments does not occur
// 2. parentType is GraphQLCompositeType instead of GraphQLObjectType
export interface GraphQLVisitorInfo extends GraphQLQueryInfo {
  readonly fieldName: string;
  readonly fieldNode: FieldNode;
  readonly returnType: GraphQLOutputType;
  readonly parentType: GraphQLCompositeType;
  readonly path: Path;
}
