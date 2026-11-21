import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { AnswerSheet } from '../components/EvalDataset/AnswerSheet';
import { QuestionIndex } from '../components/EvalDataset/QuestionIndex';
import { ScoreBoard } from '../components/EvalDataset/ScoreBoard';
import { SetExplainer } from '../components/EvalDataset/SetExplainer';
import { formatFrozen, formatPercent } from '../components/EvalDataset/format';
import {
  useEvalCatalog,
  useEvalDataset,
  useEvalItem,
} from '../hooks/useEvalDataset';
import type { EvalQuestionSummary } from '../services/backendApi';

const matches = (item: EvalQuestionSummary, query: string): boolean => {
  const haystack = [
    item.question,
    item.title,
    item.templateTitle,
    item.id,
    item.field,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
};

const EvalDatasetPage = () => {
  const [params, setParams] = useSearchParams();
  const setId = params.get('set') || 'sampled';
  const modelParam = params.get('model') || '';
  const selectedParam = params.get('id') || '';
  const view = params.get('view') === 'scores' ? 'scores' : 'questions';

  const catalog = useEvalCatalog();
  const dataset = useEvalDataset(setId, modelParam);
  const viewData = dataset.data?.id === setId ? dataset.data : null;
  const activeModel = modelParam || viewData?.model || '';

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [queryIndex, setQueryIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);

  const filtered = useMemo(() => {
    return (viewData?.questions ?? []).filter((item) => {
      if (kind !== 'all' && item.kind !== kind && item.stress !== kind)
        return false;
      if (outcome === 'exact' && item.exactRate !== 1) return false;
      if (
        outcome === 'miss' &&
        (item.exactRate == null || item.exactRate === 1)
      ) {
        return false;
      }
      return matches(item, query);
    });
  }, [viewData, kind, outcome, query]);

  const selectedId = filtered.some((item) => item.id === selectedParam)
    ? selectedParam
    : (filtered[0]?.id ?? null);
  const pageKey = `${setId}:${selectedId ?? ''}`;
  const [trackedPage, setTrackedPage] = useState(pageKey);

  const detail = useEvalItem(
    setId,
    view === 'questions' ? selectedId : null,
    activeModel,
    queryIndex,
    offset,
    limit
  );

  if (trackedPage !== pageKey) {
    setTrackedPage(pageKey);
    setQueryIndex(0);
    setOffset(0);
  }

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const changeSet = (nextSet: string) => {
    setQuery('');
    setKind('all');
    setOutcome('all');
    const next = new URLSearchParams(params);
    next.set('set', nextSet);
    next.delete('id');
    next.delete('model');
    setParams(next, { replace: true });
  };

  const tags = useMemo(() => {
    const values = new Set<string>();
    for (const item of viewData?.questions ?? []) {
      if (item.kind) values.add(item.kind);
      if (item.stress && item.stress !== item.kind) values.add(item.stress);
    }
    return [...values];
  }, [viewData]);
  const frozen = formatFrozen(viewData?.frozenAt ?? null);
  const card = catalog.datasets?.find((item) => item.id === setId);

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 }, width: '100%' }}>
      <Typography
        variant="h4"
        sx={{ fontWeight: 700, letterSpacing: '-0.03em' }}
      >
        Evaluation set
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 720, mt: 0.5 }}>
        The questions Atlas is scored on, the gold answer from ORKG, and the
        result of each run.
      </Typography>

      {catalog.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {catalog.error}. Start the backend to read the evaluation files.
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mt: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={
            catalog.datasets?.some((item) => item.id === setId) ? setId : false
          }
          onChange={(_, value: string) => changeSet(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {(catalog.datasets ?? []).map((item) => (
            <Tab
              key={item.id}
              value={item.id}
              label={`${item.label} · ${item.questionCount}`}
            />
          ))}
        </Tabs>
        <TextField
          select
          size="small"
          label="Model"
          value={activeModel}
          disabled={!viewData}
          onChange={(event) => setParam('model', event.target.value)}
          sx={{ minWidth: 220, mb: 1 }}
        >
          {(viewData?.models ?? []).map((model) => (
            <MenuItem key={model} value={model}>
              {model}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mt: 2,
        }}
      >
        <Box>
          <SetExplainer
            setId={setId}
            fallback={viewData?.blurb || card?.blurb}
            tags={tags}
          />
          <Typography variant="caption" color="text.secondary">
            {frozen ? `Gold answers frozen ${frozen}` : 'Gold answers'}
            {viewData?.endpoint ? ` · ${viewData.endpoint}` : ''}
            {card?.headlineExact != null
              ? ` · full exact ${formatPercent(card.headlineExact)}`
              : ''}
          </Typography>
        </Box>
        <Tabs
          value={view}
          onChange={(_, value: string) =>
            setParam('view', value === 'scores' ? 'scores' : null)
          }
        >
          <Tab value="questions" label="Questions and answers" />
          <Tab value="scores" label="Score table" />
        </Tabs>
      </Box>

      {dataset.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {dataset.error}
        </Alert>
      )}

      {dataset.loading && !viewData && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {viewData && view === 'scores' && (
        <Box sx={{ mt: 2 }}>
          <ScoreBoard rows={viewData.results} model={activeModel} />
        </Box>
      )}

      {viewData && view === 'questions' && (
        <Box
          sx={{
            mt: 2,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <QuestionIndex
            questions={filtered}
            selectedId={selectedId}
            query={query}
            kind={kind}
            outcome={outcome}
            onQuery={setQuery}
            onKind={setKind}
            onOutcome={setOutcome}
            onSelect={(id) => setParam('id', id)}
          />
          <Box>
            {detail.error && <Alert severity="error">{detail.error}</Alert>}
            {detail.loading && detail.item?.id !== selectedId && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} />
              </Box>
            )}
            {detail.item && detail.item.id === selectedId && (
              <AnswerSheet
                item={detail.item}
                onQuery={(index) => {
                  setQueryIndex(index);
                  setOffset(0);
                }}
                onOffset={setOffset}
                onLimit={(next) => {
                  setLimit(next);
                  setOffset(0);
                }}
              />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default EvalDatasetPage;
