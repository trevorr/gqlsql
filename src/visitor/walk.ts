import {
  assertCompositeType,
  FieldNode,
  getNamedType,
  GraphQLCompositeType,
  GraphQLNamedType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  Kind,
  SelectionSetNode,
  TypeNameMetaFieldDef,
} from 'graphql';
import { GraphQLVisitorInfo } from './GraphQLVisitorInfo';
import { isTrueValue } from './values';
import { FieldVisitorDefault, FieldVisitors, ShallowFieldVisitors, TypeVisitors } from './visitors';

export interface WalkOptions {
  fragmentPredicate?(type: GraphQLNamedType): boolean;
}

export function walk<TContext>(
  context: TContext,
  info: GraphQLResolveInfo | GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>,
  options?: WalkOptions
): TContext {
  const fieldVisitors = visitors[info.parentType.name];
  if ('fieldNode' in info) {
    walkField(context, info, visitors, fieldVisitors, options);
  } else {
    const { fieldNodes, ...rest } = info;
    for (const fieldNode of fieldNodes) {
      walkField(context, { ...rest, fieldNode }, visitors, fieldVisitors, options);
    }
  }
  return context;
}

function walkField<TContext, TNestedContext>(
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors: ShallowFieldVisitors<TContext, TNestedContext>,
  options?: WalkOptions
): TContext;

function walkField<TContext>(
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TContext>,
  fieldVisitors?: FieldVisitors<TContext>,
  options?: WalkOptions
): TContext;

function walkField<TContext, TNestedContext>(
  context: TContext,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors?: ShallowFieldVisitors<TContext, TNestedContext>,
  options?: WalkOptions
): TContext {
  if (fieldVisitors) {
    const beforeVisitor = fieldVisitors[info.fieldName] || fieldVisitors[FieldVisitorDefault];
    if (beforeVisitor) {
      const result = beforeVisitor(context, info, visitors);
      if (result !== undefined) {
        walkSelections(result, info, visitors, undefined, options);
      }
    }

    const afterVisitor = fieldVisitors[info.fieldName + 'After'];
    if (afterVisitor) {
      afterVisitor(context, info, visitors);
    }
  } else {
    walkSelections(context, info, visitors as unknown as TypeVisitors<TContext>, undefined, options);
  }
  return context;
}

export function walkSelections<TContext, TNestedContext>(
  context: TContext,
  info: GraphQLVisitorInfo | GraphQLResolveInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors: ShallowFieldVisitors<TContext, TNestedContext>,
  options?: WalkOptions
): void;

export function walkSelections<TContext>(
  context: TContext,
  info: GraphQLVisitorInfo | GraphQLResolveInfo,
  visitors: TypeVisitors<TContext>,
  fieldVisitors?: FieldVisitors<TContext>,
  options?: WalkOptions
): void;

export function walkSelections<TContext, TNestedContext>(
  context: TContext,
  info: GraphQLVisitorInfo | GraphQLResolveInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors?: ShallowFieldVisitors<TContext, TNestedContext>,
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
        fieldVisitors!,
        options
      );
    }
  } else {
    const { fieldNodes, ...rest } = info;
    for (const fieldNode of fieldNodes) {
      walkSelections(context, { fieldNode, ...rest }, visitors, fieldVisitors!, options);
    }
  }
}

function walkSelectionSet<TContext, TNestedContext>(
  context: TContext,
  parentType: GraphQLCompositeType,
  selectionSet: SelectionSetNode,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors: ShallowFieldVisitors<TContext, TNestedContext>,
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
): void;

function walkSelectionSet<TContext, TNestedContext>(
  context: TContext,
  parentType: GraphQLCompositeType,
  selectionSet: SelectionSetNode,
  info: GraphQLVisitorInfo,
  visitors: TypeVisitors<TNestedContext>,
  fieldVisitors?: ShallowFieldVisitors<TContext, TNestedContext>,
  options?: WalkOptions
): void {
  for (const selection of selectionSet.selections) {
    const { directives } = selection;
    /* istanbul ignore else: typed as optional but always appears set even if empty */
    if (directives) {
      const skip = directives.find((d) => d.name.value === 'skip');
      if (skip && skip.arguments && isTrueValue(skip.arguments[0].value, info.variableValues)) {
        continue;
      }
      const include = directives.find((d) => d.name.value === 'include');
      if (include && (!include.arguments || !isTrueValue(include.arguments[0].value, info.variableValues))) {
        continue;
      }
    }
    switch (selection.kind) {
      case Kind.FRAGMENT_SPREAD: {
        const fragmentName = selection.name.value;
        const fragment = info.fragments[fragmentName];
        const typeName = fragment.typeCondition.name.value;
        let fragmentType = info.schema.getType(typeName);
        if (!fragmentType || !isCompositeType(fragmentType)) {
          throw new Error(`Cannot resolve fragment type '${typeName}'`);
        }
        if (isSupertypeOf(fragmentType, parentType)) {
          fragmentType = parentType;
        }
        if (!options || !options.fragmentPredicate || options.fragmentPredicate(fragmentType)) {
          walkSelectionSet(context, fragmentType, fragment.selectionSet, info, visitors, fieldVisitors!, options);
        }
        break;
      }
      case Kind.INLINE_FRAGMENT: {
        let fragmentType;
        if (selection.typeCondition) {
          const typeName = selection.typeCondition.name.value;
          fragmentType = info.schema.getType(typeName);
          if (!fragmentType || !isCompositeType(fragmentType)) {
            throw new Error(`Cannot resolve fragment type '${typeName}'`);
          }
          if (isSupertypeOf(fragmentType, parentType)) {
            fragmentType = parentType;
          }
        } else {
          fragmentType = parentType;
        }
        if (!options || !options.fragmentPredicate || options.fragmentPredicate(fragmentType)) {
          walkSelectionSet(context, fragmentType, selection.selectionSet, info, visitors, fieldVisitors!, options);
        }
        break;
      }
      default: {
        const returnType = getFieldType(parentType, selection.name.value);
        const fieldInfo: GraphQLVisitorInfo = {
          ...info,
          fieldName: selection.name.value,
          fieldNode: selection,
          returnType,
          parentType,
          path: {
            prev: info.path,
            key: getResponseKey(selection),
            typename: getNamedType(returnType).name,
          },
        };
        if (fieldVisitors) {
          walkField(context, fieldInfo, visitors, fieldVisitors);
        } else {
          const v = visitors as unknown as TypeVisitors<TContext>;
          walkField(context, fieldInfo, v, v[parentType.name]);
        }
      }
    }
  }
}

function isSupertypeOf(superType: GraphQLCompositeType, subType: GraphQLCompositeType): boolean {
  return (
    isObjectType(subType) &&
    ((isInterfaceType(superType) && subType.getInterfaces().includes(superType)) ||
      (isUnionType(superType) && superType.getTypes().includes(subType)))
  );
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
