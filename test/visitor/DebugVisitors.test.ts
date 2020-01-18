import { expect } from 'chai';
import { execute, GraphQLResolveInfo } from 'graphql';
import { DebugVisitors, walk } from '../../src/visitor';
import query from './query';
import { getExecutableSchema } from './schema';

describe('DebugVisitors', () => {
  it('writes query nodes to the console', async () => {
    const resolvers = {
      Query: {
        person(_parent: unknown, _args: unknown, context: unknown, info: GraphQLResolveInfo) {
          walk(context, info, DebugVisitors);
        }
      }
    };
    await execute(getExecutableSchema(resolvers), query, null, 0);
  });

  it('has infinite methods', () => {
    expect('randomTypeName' in DebugVisitors).to.be.true;
    expect('randomFieldName' in DebugVisitors['randomTypeName']!).to.be.true;
  });
});
