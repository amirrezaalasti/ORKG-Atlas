/**
 * When an executed query may be sent back to the model.
 * An executable empty result is not a repair trigger: on ORKG, nobody having
 * curated a property is often the right answer, and revising it tends to
 * invent rows.
 */

export type RepairSignal =
  | 'execution_error'
  | 'no_query'
  | 'validator'
  | 'empty'
  | 'unbound_columns'
  | 'ok';

export const EMPTY_RESULT_FEEDBACK =
  'The query executed and returned no rows. On ORKG an empty result is often correct, because the requested statements have not been curated. Do not revise the query only to force rows. Keep this result.';

export const shouldRepair = (signal: RepairSignal): boolean =>
  signal === 'execution_error' ||
  signal === 'no_query' ||
  signal === 'validator' ||
  signal === 'unbound_columns';
