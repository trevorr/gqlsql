import {
  assertCompositeType,
  FieldNode,
  getNamedType,
  GraphQLCompositeType,
  GraphQLNamedType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  isCompositeType,
  isUnionType,
  SelectionSetNode,
  TypeNameMetaFieldDef
} from 'graphql';
import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';
import { isTrueValue } from './values';
import { FieldVisitors, ShallowFieldVisitors, TypeVisitors } from './visitors';

export interface WalkOptions {
  fragmentPredicate?(type: GraphQLNamedType): boolean;
}

export function walk<TContext>(
  context: TContext,
  info: GraphQLResolveInfo,
  visitors: TypeVisitors<TContext>,
  options?: WalkOptions
): TContext {
  const { fieldNodes, ...rest } = info;
  const fieldVisitors = visitors[info.parentType.name];
  for (const fieldNode of fieldNodes) {
    walkField(context, { ...rest, fieldNode }, visitors, fieldVisitors, options);
  }
  return context;
}

function walkField<TContext>(
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>,
  fieldVisitors?: FieldVisitors<TContext>,
  options?: WalkOptions
): TContext {
  let skipChildren = false;
  let childContext = context;

  if (fieldVisitors) {
    const beforeVisitor = fieldVisitors[info.fieldName];
    if (beforeVisitor) {
      const result = beforeVisitor(context, info, visitors);
      if (result === undefined) {
        skipChildren = true;
      } else {
        childContext = result;
      }
    }
  }

  if (!skipChildren) {
    walkSelections(childContext, info, visitors, undefined, options);
  }

  if (fieldVisitors) {
    const afterVisitor = fieldVisitors[info.fieldName + 'After'];
    if (afterVisitor) {
      afterVisitor(context, info, visitors);
    }
  }
  return context;
}

export function walkSelections<TContext, TNestedContext>(
  context: TContext,
  info: GraphQLVisitorInfo | GraphQLResolveInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors?: ShallowFieldVisitors<TContext, TNestedContext>,
  options?: WalkOptions
): void;

export function walkSelections<TContext>(
  context: TContext,
  info: GraphQLVisitorInfo | GraphQLResolveInfo,
  visitors: TypeVisitors<TContext>,
  fieldVisitors?: FieldVisitors<TContext>,
  options?: WalkOptions
): void {
  if ('fieldNode' in info) {
    const { selectionSet } = info.fieldNode;
    if (selectionSet) {
      walkSelectionSet(
        context,
        assertCompositeType(getNamedType(info.returnType)),
        selectionSet,
        info,
        visitors,
        fieldVisitors,
        options
      );
    }
  } else {
    const { fieldNodes, ...rest } = info;
    for (const fieldNode of fieldNodes) {
      walkSelections(context, { fieldNode, ...rest }, visitors, fieldVisitors, options);
    }
  }
}

function walkSelectionSet<TContext, TNestedContext>(
  context: TContext,
  parentType: GraphQLCompositeType,
  selectionSet: SelectionSetNode,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors?: ShallowFieldVisitors<TContext, TNestedContext>,
  options?: WalkOptions
): void;

function walkSelectionSet<TContext>(
  context: TContext,
  parentType: GraphQLCompositeType,
  selectionSet: SelectionSetNode,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>,
  fieldVisitors?: FieldVisitors<TContext>,
  options?: WalkOptions
): void {
  for (const selection of selectionSet.selections) {
    const { directives } = selection;
    /* istanbul ignore else: typed as optional but always appears set even if empty */
    if (directives) {
      const skip = directives.find(d => d.name.value === 'skip');
      if (skip && skip.arguments && isTrueValue(skip.arguments[0].value, info.variableValues)) {
        continue;
      }
      const include = directives.find(d => d.name.value === 'include');
      if (include && (!include.arguments || !isTrueValue(include.arguments[0].value, info.variableValues))) {
        continue;
      }
    }
    switch (selection.kind) {
      case 'FragmentSpread': {
        const fragmentName = selection.name.value;
        const fragment = info.fragments[fragmentName];
        const typeName = fragment.typeCondition.name.value;
        const fragmentType = info.schema.getType(typeName);
        if (!fragmentType || !isCompositeType(fragmentType)) {
          throw new Error(`Cannot resolve fragment type '${typeName}'`);
        }
        if (!options || !options.fragmentPredicate || options.fragmentPredicate(fragmentType)) {
          walkSelectionSet(context, fragmentType, fragment.selectionSet, info, visitors, fieldVisitors, options);
        }
        break;
      }
      case 'InlineFragment': {
        let fragmentType;
        if (selection.typeCondition) {
          const typeName = selection.typeCondition.name.value;
          fragmentType = info.schema.getType(typeName);
          if (!fragmentType || !isCompositeType(fragmentType)) {
            throw new Error(`Cannot resolve fragment type '${typeName}'`);
          }
        } else {
          fragmentType = parentType;
        }
        if (!options || !options.fragmentPredicate || options.fragmentPredicate(fragmentType)) {
          walkSelectionSet(context, fragmentType, selection.selectionSet, info, visitors, fieldVisitors, options);
        }
        break;
      }
      default: {
        const fieldInfo = {
          ...info,
          fieldName: selection.name.value,
          fieldNode: selection,
          returnType: getFieldType(parentType, selection.name.value),
          parentType,
          path: {
            prev: info.path,
            key: getResponseKey(selection)
          }
        };
        walkField(context, fieldInfo, visitors, fieldVisitors || visitors[parentType.name]);
      }
    }
  }
}

function getFieldType(containingType: GraphQLCompositeType, fieldName: string): GraphQLOutputType {
  // __typename can be referenced at any point; __schema and _type are only valid at the query root
  if (fieldName === TypeNameMetaFieldDef.name) {
    return TypeNameMetaFieldDef.type;
  }
  // a field referenced within a union type should be present in all alternatives
  const searchType = isUnionType(containingType) ? containingType.getTypes()[0] : containingType;
  const field = searchType.getFields()[fieldName];
  if (!field) {
    throw new Error(`Field '${fieldName}' is not a member of '${containingType.toString()}'`);
  }
  return field.type;
}

export function getResponseKey(field: FieldNode): string {
  return field.alias ? field.alias.value : field.name.value;
}
