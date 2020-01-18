import gql from 'graphql-tag';
import { IResolvers, makeExecutableSchema } from 'graphql-tools';

const schema = gql`
  schema {
    query: Query
  }

  type Query {
    node(id: Int!): Node
    person(id: Int!): Person
    pet(id: Int!): Pet
  }

  interface Node {
    id: Int!
  }

  type Person implements Node {
    id: Int!
    firstName: String
    lastName: String
    friends: FriendConnection!
  }

  type Pet implements Node {
    id: Int!
    name: String
    owner: Person
  }

  union Friend = Person | Pet

  type FriendEdge {
    cursor: String!
    node: Friend!
  }

  type FriendConnection {
    edges: [FriendEdge!]!
    nodes: [Friend!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PageInfo {
    hasPreviousPage: Boolean!
    hasNextPage: Boolean!
    startCursor: String
    endCursor: String
  }
`;

export function getExecutableSchema<TContext = any>(
  resolvers: IResolvers<any, TContext> | Array<IResolvers<any, TContext>>
) {
  return makeExecutableSchema({
    typeDefs: schema,
    resolvers,
    resolverValidationOptions: { requireResolversForResolveType: false }
  });
}

export default schema;
