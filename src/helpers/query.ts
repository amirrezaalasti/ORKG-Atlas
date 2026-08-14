import { Query } from '../constants/queries_chart_info';

export const mergeQueryWithFirebase = (
  query: Query,
  firebaseQuery?: Record<string, unknown> | null
) => {
  if (!firebaseQuery) {
    return query;
  }

  const {
    id: firebaseId,
    dataProcessingFunction: _fn,
    dataProcessingFunction2: _fn2,
    ...rest
  } = firebaseQuery;

  return {
    ...query,
    ...rest,
    id: typeof firebaseId === 'number' ? firebaseId : query.id,
    uid: (typeof rest.uid === 'string' && rest.uid) || query.uid,
    dataProcessingFunction: query.dataProcessingFunction,
    dataProcessingFunction2: query.dataProcessingFunction2,
  };
};
