import { describe, expect, it, vi } from 'vitest';
import reducer, { fetchQuestionsFromFirebase } from './questionSlice';

vi.mock('../../firestore/CRUDQuestions', () => ({
  default: { getQuestions: vi.fn() },
}));
vi.mock('../../helpers/fetch_query', () => ({ default: vi.fn() }));

const empiricalQuestion = { id: 1, uid: 'query_1', title: 'Empirical Q1' };

const withEmpiricalLoaded = () =>
  reducer(
    undefined,
    fetchQuestionsFromFirebase.fulfilled(
      { firebaseQuestions: [empiricalQuestion], templateId: 'R186491' },
      'req-1',
      'R186491'
    )
  );

describe('questionSlice template switching', () => {
  it('clears the previous template questions when a new fetch starts', () => {
    const state = reducer(
      withEmpiricalLoaded(),
      fetchQuestionsFromFirebase.pending('req-2', 'R999999')
    );
    expect(state.firebaseQuestions).toEqual({});
    expect(state.questions).toEqual([]);
  });

  it('does not fall back to empirical queries for a template without questions', () => {
    let state = reducer(
      withEmpiricalLoaded(),
      fetchQuestionsFromFirebase.pending('req-2', 'R999999')
    );
    state = reducer(
      state,
      fetchQuestionsFromFirebase.fulfilled(
        { firebaseQuestions: [], templateId: 'R999999' },
        'req-2',
        'R999999'
      )
    );
    expect(state.firebaseQuestions).toEqual({});
    expect(state.questions).toEqual([]);
  });

  it('ignores a stale response from an earlier template', () => {
    let state = reducer(
      undefined,
      fetchQuestionsFromFirebase.pending('req-1', 'R186491')
    );
    state = reducer(
      state,
      fetchQuestionsFromFirebase.pending('req-2', 'R999999')
    );
    state = reducer(
      state,
      fetchQuestionsFromFirebase.fulfilled(
        { firebaseQuestions: [empiricalQuestion], templateId: 'R186491' },
        'req-1',
        'R186491'
      )
    );
    expect(state.firebaseQuestions).toEqual({});
    expect(state.loading.questions).toBe(true);
  });
});
