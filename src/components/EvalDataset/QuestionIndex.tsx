import {
  Box,
  Chip,
  InputAdornment,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { EvalQuestionSummary } from '../../services/backendApi';
import { formatCount, formatPercent } from './format';
import { explainKind } from './glossary';

interface QuestionIndexProps {
  questions: EvalQuestionSummary[];
  selectedId: string | null;
  query: string;
  kind: string;
  outcome: string;
  onQuery: (value: string) => void;
  onKind: (value: string) => void;
  onOutcome: (value: string) => void;
  onSelect: (id: string) => void;
}

export function QuestionIndex({
  questions,
  selectedId,
  query,
  kind,
  outcome,
  onQuery,
  onKind,
  onOutcome,
  onSelect,
}: QuestionIndexProps) {
  const kinds = [
    ...new Set(questions.map((item) => item.kind).filter(Boolean)),
  ] as string[];
  const hasScores = questions.some((item) => item.exactRate != null);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        backgroundColor: 'background.paper',
        overflow: 'hidden',
        position: { md: 'sticky' },
        top: 80,
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search questions or templates"
          size="small"
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {kinds.length > 1 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            <Chip
              label="All kinds"
              size="small"
              color={kind === 'all' ? 'primary' : 'default'}
              variant={kind === 'all' ? 'filled' : 'outlined'}
              onClick={() => onKind('all')}
            />
            {kinds.map((value) => (
              <Tooltip key={value} title={explainKind(value) ?? ''} arrow>
                <Chip
                  label={value}
                  size="small"
                  color={kind === value ? 'primary' : 'default'}
                  variant={kind === value ? 'filled' : 'outlined'}
                  onClick={() => onKind(value)}
                />
              </Tooltip>
            ))}
          </Box>
        )}
        {hasScores && (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={outcome}
            onChange={(_, value: string | null) => value && onOutcome(value)}
            sx={{ mt: 1 }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="exact">Exact</ToggleButton>
            <ToggleButton value="miss">Missed</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
      <Box
        role="list"
        sx={{
          overflow: 'auto',
          maxHeight: { xs: 320, md: 'calc(100vh - 380px)' },
        }}
      >
        {questions.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">
            No questions match this filter.
          </Typography>
        )}
        {questions.map((item) => {
          const selected = item.id === selectedId;
          const exact = item.exactRate === 1;
          return (
            <Box
              key={item.id}
              component="button"
              type="button"
              role="listitem"
              onClick={() => onSelect(item.id)}
              sx={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 0,
                borderBottom: '1px solid',
                borderColor: 'divider',
                borderLeft: '3px solid',
                borderLeftColor: selected ? 'primary.main' : 'transparent',
                backgroundColor: selected ? 'action.selected' : 'transparent',
                px: 1.5,
                py: 1.25,
                cursor: 'pointer',
                color: 'inherit',
                '&:hover': { backgroundColor: 'action.hover' },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -2,
                },
              }}
            >
              <Box
                sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}
              >
                {item.kind && (
                  <Tooltip title={explainKind(item.kind) ?? ''} arrow>
                    <Chip label={item.kind} size="small" variant="outlined" />
                  </Tooltip>
                )}
                {item.stress && item.stress !== item.kind && (
                  <Tooltip title={explainKind(item.stress) ?? ''} arrow>
                    <Chip label={item.stress} size="small" variant="outlined" />
                  </Tooltip>
                )}
                {item.exactRate != null && (
                  <Chip
                    label={exact ? 'Exact' : formatPercent(item.exactRate)}
                    size="small"
                    color={
                      exact
                        ? 'success'
                        : item.exactRate > 0
                          ? 'warning'
                          : 'default'
                    }
                  />
                )}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: selected ? 600 : 500,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.question}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.templateTitle || item.templateId || item.id}
                {' · '}
                {formatCount(item.answerRows)}{' '}
                {item.answerRows === 1 ? 'row' : 'rows'}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
