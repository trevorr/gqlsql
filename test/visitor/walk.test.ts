import chai, { expect } from 'chai';
import { execute, GraphQLResolveInfo } from 'graphql';
import gql from 'graphql-tag';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { FieldVisitorDefault, FieldVisitors, TypeVisitors, walk, walkSelections } from '../../src/visitor';
import query from './query';
import { getExecutableSchema } from './schema';

chai.use(sinonChai);

type Context = {};

describe('walk', () => {
  it('walks automatically with returned context', async () => {
    const root = {};
    const context: Context = {};
    const fieldVisitor = sinon.spy();
    const friendVisitors: FieldVisitors<Context> = {
      id(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      }
    };
    const personVisitors: FieldVisitors<Context> = {
      firstName(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      },
      lastName(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      },
      friends(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      }
    };
    const petVisitors: FieldVisitors<Context> = {
      name(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      }
    };
    const connectionVisitors: FieldVisitors<Context> = {
      edges(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      },
      nodes(ctx, info) {
        fieldVisitor(info.fieldName);
        return ctx;
      },
      pageInfo(ctx, info) {
        fieldVisitor(info.fieldName);
        return ctx;
      },
      totalCount(ctx, info) {
        expect(ctx).to.equal(context);
        expect(info.path.key).to.eql('count');
        fieldVisitor(info.fieldName);
        return ctx;
      }
    };
    const visitors: TypeVisitors<Context> = {
      Friend: friendVisitors,
      Person: personVisitors,
      Pet: petVisitors,
      FriendConnection: connectionVisitors
    };
    const resolvers = {
      Query: {
        person(parent: {}, args: { id: number }, context: Context, info: GraphQLResolveInfo) {
          expect(parent).to.equal(root);
          expect(args.id).to.equal(5);
          walk(context, info, visitors);
        }
      }
    };
    const result = await execute(getExecutableSchema(resolvers), query, root, context, {
      skipId: false,
      includeCount: true
    });
    expect(result.errors).to.be.undefined;

    expect(fieldVisitor).to.have.been.calledWith('id');
    expect(fieldVisitor).to.have.been.calledWith('firstName');
    expect(fieldVisitor).to.have.been.calledWith('lastName');
    expect(fieldVisitor).to.have.been.calledWith('name');
    expect(fieldVisitor).to.have.been.calledWith('friends');
    expect(fieldVisitor).to.have.been.calledWith('edges');
    expect(fieldVisitor).to.have.been.not.calledWith('nodes');
    expect(fieldVisitor).to.have.been.not.calledWith('pageInfo');
    expect(fieldVisitor).to.have.been.calledWith('totalCount');
    expect(fieldVisitor).to.have.callCount(9);
  });

  const dummyNodeResolvers = {
    Query: {
      node(_parent: unknown, _args: unknown, context: unknown, info: GraphQLResolveInfo) {
        walk(context, info, {});
      }
    }
  };

  it('throws on invalid field', async () => {
    const result = await execute(
      getExecutableSchema(dummyNodeResolvers),
      gql`
        {
          node(id: 1) {
            badField
          }
        }
      `
    );
    expect(result.errors).to.have.lengthOf(1);
    expect(result.errors![0].message).to.equal("Field 'badField' is not a member of 'Node'");
  });

  it('throws on invalid fragment spread type', async () => {
    const result = await execute(
      getExecutableSchema(dummyNodeResolvers),
      gql`
        query {
          node(id: 1) {
            ...stuff
          }
        }
        fragment stuff on BadType {
          id
        }
      `
    );
    expect(result.errors).to.have.lengthOf(1);
    expect(result.errors![0].message).to.equal("Cannot resolve fragment type 'BadType'");
  });

  it('throws on invalid inline fragment type', async () => {
    const result = await execute(
      getExecutableSchema(dummyNodeResolvers),
      gql`
        {
          node(id: 1) {
            ... on BadType {
              id
            }
          }
        }
      `
    );
    expect(result.errors).to.have.lengthOf(1);
    expect(result.errors![0].message).to.equal("Cannot resolve fragment type 'BadType'");
  });
});

describe('walkSelections', () => {
  it('walks with explicit nested walking', async () => {
    const root = {};
    const context: Context = {};
    const fieldVisitor = sinon.spy();
    const connectionVisitors: FieldVisitors<Context> = {
      edges(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        return ctx;
      },
      nodes(ctx, info) {
        fieldVisitor(info.fieldName);
        return ctx;
      },
      pageInfo(ctx, info) {
        fieldVisitor(info.fieldName);
        return ctx;
      },
      totalCount(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
      }
    };
    const personVisitors: FieldVisitors<Context> = {
      firstName(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
      },
      lastName(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
      },
      friends(ctx, info, visitors) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
        walkSelections(ctx, info, visitors, connectionVisitors);
      }
    };
    const visitors: TypeVisitors<Context> = {
      Person: personVisitors
    };
    const resolvers = {
      Query: {
        person(parent: {}, args: { id: number }, context: Context, info: GraphQLResolveInfo) {
          expect(parent).to.equal(root);
          expect(args.id).to.equal(5);
          walkSelections(context, info, visitors);
        }
      }
    };
    const result = await execute(getExecutableSchema(resolvers), query, root, context, {
      skipId: true,
      includeCount: false
    });
    expect(result.errors).to.be.undefined;

    expect(fieldVisitor).to.have.been.calledWith('firstName');
    expect(fieldVisitor).to.have.been.calledWith('lastName');
    expect(fieldVisitor).to.have.been.calledWith('friends');
    expect(fieldVisitor).to.have.been.calledWith('edges');
    expect(fieldVisitor).to.have.been.not.calledWith('nodes');
    expect(fieldVisitor).to.have.been.not.calledWith('pageInfo');
    expect(fieldVisitor).to.have.been.not.calledWith('totalCount');
    expect(fieldVisitor).to.have.callCount(6);
  });

  it('supports a fragment predicate', async () => {
    const fieldVisitor = sinon.spy();
    const visitors: TypeVisitors<Context> = {
      Person: {
        firstName(_, info) {
          fieldVisitor(info.fieldName);
        },
        lastName(_, info) {
          fieldVisitor(info.fieldName);
        }
      },
      Pet: {
        name(_, info) {
          fieldVisitor(info.fieldName);
        },
        owner(ctx, info) {
          fieldVisitor(info.fieldName);
          return ctx;
        }
      }
    };
    const resolvers = {
      Query: {
        node(_parent: unknown, _args: unknown, context: Context, info: GraphQLResolveInfo) {
          walkSelections(context, info, visitors, undefined, {
            fragmentPredicate(type) {
              return type.name === 'Person';
            }
          });
        }
      }
    };
    const result = await execute(
      getExecutableSchema(resolvers),
      gql`
        query {
          node(id: 1) {
            ... on Person {
              firstName
            }
            ... on Pet {
              name
            }
            ...personName
            ...ownerName
          }
        }
        fragment personName on Person {
          firstName
          lastName
        }
        fragment ownerName on Pet {
          owner {
            ...personName
          }
        }
      `
    );
    expect(result.errors).to.be.undefined;

    expect(fieldVisitor).to.have.been.calledWith('firstName');
    expect(fieldVisitor).to.have.been.calledWith('lastName');
    expect(fieldVisitor).to.have.been.not.calledWith('name');
    expect(fieldVisitor).to.have.been.not.calledWith('owner');
  });

  it('walks with default field', async () => {
    const root = {};
    const context: Context = {};
    const fieldVisitor = sinon.spy();
    const defaultFieldVisitor = sinon.spy();
    const personVisitors: FieldVisitors<Context> = {
      firstName(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
      },
      lastName(ctx, info) {
        expect(ctx).to.equal(context);
        fieldVisitor(info.fieldName);
      },
      [FieldVisitorDefault](ctx, info, visitors) {
        expect(ctx).to.equal(context);
        defaultFieldVisitor(info.fieldName);
        walkSelections(context, info, visitors);
      }
    };
    const visitors: TypeVisitors<Context> = {
      Person: personVisitors
    };
    const resolvers = {
      Query: {
        person(parent: {}, args: { id: number }, context: Context, info: GraphQLResolveInfo) {
          expect(parent).to.equal(root);
          expect(args.id).to.equal(5);
          walkSelections(context, info, visitors);
        }
      }
    };
    const result = await execute(getExecutableSchema(resolvers), query, root, context, {
      skipId: true,
      includeCount: false
    });
    expect(result.errors).to.be.undefined;

    expect(fieldVisitor).to.have.been.calledWith('firstName');
    expect(fieldVisitor).to.have.been.calledWith('lastName');
    expect(fieldVisitor).to.have.callCount(4);
    expect(defaultFieldVisitor).to.have.been.calledWith('friends');
    expect(defaultFieldVisitor).to.have.callCount(1);
  });
});
