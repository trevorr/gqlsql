import gql from 'graphql-tag';

const query = gql`
  query ($skipId: Boolean, $includeCount: Boolean) {
    person(id: 5) {
      id @skip(if: $skipId)
      firstName
      lastName
      friends {
        edges {
          cursor
          node {
            ... @skip(if: $skipId) {
              id
            }
            ...name
            ... on Pet {
              name
              ...nodeId
              ... on Friend {
                friendId: id
              }
            }
            __typename
          }
        }
        count: totalCount @include(if: $includeCount)
      }
    }
    __schema {
      queryType {
        name
        __typename
      }
    }
    __type(name: "Query") {
      kind
    }
  }
  fragment name on Person {
    firstName
    lastName
  }
  fragment nodeId on Node {
    id
  }
`;

export default query;
