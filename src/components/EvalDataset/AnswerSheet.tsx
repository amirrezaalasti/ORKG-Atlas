import { useState } from 'react';
import {
  Box,
  Chip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import type { EvalItemView } from '../../services/backendApi';
import { displayCell, formatCount, formatF1, formatPercent } from './format';
import { explainConfig, explainKind } from './glossary';

interface AnswerSheetProps {
  item: EvalItemView;
  onQuery: (index: number) => void;
  onOffset: (offset: number) => void;
  onLimit: (limit: number) => void;
}

export function AnswerSheet({
  item,
  onQuery,
  onOffset,
  onLimit,
}: AnswerSheetProps) {
  const [showQuery, setShowQuery] = useState(false);
  const query = item.queries[item.queryIndex];
  const columns = query?.columns ?? item.answerColumns;
  const rowCount = query?.rowCount ?? 0;
  const sparql = item.goldQueries[item.queryIndex] ?? item.goldQueries[0];

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        backgroundColor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
          {item.kind && (
            <Tooltip title={explainKind(item.kind) ?? ''} arrow>
              <Chip size="small" label={item.kind} variant="outlined" />
            </Tooltip>
          )}
          {item.stress && item.stress !== item.kind && (
            <Tooltip title={explainKind(item.stress) ?? ''} arrow>
              <Chip size="small" label={item.stress} variant="outlined" />
            </Tooltip>
          )}
          {item.templateId && (
            <Chip
              size="small"
              label={item.templateTitle || item.templateId}
              component="a"
              href={`https://orkg.org/template/${item.templateId}`}
              target="_blank"
              rel="noreferrer"
              clickable
            />
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ alignSelf: 'center' }}
          >
            {item.id}
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
          {item.question}
        </Typography>
        {item.field && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {item.field}
          </Typography>
        )}
        {item.scores.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              gap: 1,
              mt: 2,
            }}
          >
            {item.scores.map((score) => (
              <Tooltip
                key={score.config}
                title={explainConfig(score.config)}
                arrow
              >
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor:
                      score.config === 'full' ? 'primary.main' : 'divider',
                    borderRadius: 1.5,
                    px: 1.25,
                    py: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {score.config}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatPercent(score.exactRate)} exact
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    F1 {formatF1(score.meanF1)} · {score.runs}{' '}
                    {score.runs === 1 ? 'run' : 'runs'}
                  </Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Typography variant="subtitle2">Gold answer</Typography>
        <Typography variant="caption" color="text.secondary">
          {formatCount(rowCount)} {rowCount === 1 ? 'row' : 'rows'}
          {columns.length > 0 ? ` · ${columns.join(', ')}` : ''}
        </Typography>
      </Box>

      {item.queries.length > 1 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', px: 2, pb: 1 }}>
          {item.queries.map((entry) => (
            <Chip
              key={entry.index}
              size="small"
              label={`Query ${entry.index + 1} · ${formatCount(entry.rowCount)}`}
              color={entry.index === item.queryIndex ? 'primary' : 'default'}
              variant={entry.index === item.queryIndex ? 'filled' : 'outlined'}
              onClick={() => onQuery(entry.index)}
            />
          ))}
        </Box>
      )}

      {sparql && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography
            component="button"
            type="button"
            onClick={() => setShowQuery((open) => !open)}
            sx={{
              border: 0,
              background: 'none',
              color: 'primary.main',
              cursor: 'pointer',
              p: 0,
              font: 'inherit',
              fontSize: '0.8rem',
            }}
          >
            {showQuery ? 'Hide SPARQL' : 'Show SPARQL'}
          </Typography>
          {showQuery && (
            <Box
              component="pre"
              sx={{
                mt: 1,
                mb: 0,
                p: 1.5,
                overflow: 'auto',
                maxHeight: 220,
                borderRadius: 1,
                backgroundColor: 'action.hover',
                fontSize: 12,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {sparql.trim()}
            </Box>
          )}
        </Box>
      )}

      {query && !query.ok && (
        <Typography sx={{ px: 2, pb: 2 }} color="error">
          {query.error || 'This gold query did not return a table.'}
        </Typography>
      )}

      {rowCount === 0 ? (
        <Typography sx={{ px: 2, pb: 2.5 }} color="text.secondary">
          The gold answer is empty.
        </Typography>
      ) : (
        <>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column} sx={{ fontWeight: 700 }}>
                      {column}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {item.rows.map((row, index) => (
                  <TableRow key={`${item.offset}-${index}`} hover>
                    {columns.map((column) => {
                      const cell = displayCell(row[column]);
                      return (
                        <TableCell
                          key={column}
                          title={row[column] || ''}
                          sx={{
                            maxWidth: 280,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            verticalAlign: 'top',
                          }}
                        >
                          {cell.href ? (
                            <Link
                              href={cell.href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {cell.text}
                            </Link>
                          ) : (
                            cell.text
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={rowCount}
            page={Math.floor(item.offset / item.limit)}
            rowsPerPage={item.limit}
            rowsPerPageOptions={[25, 50, 100]}
            onPageChange={(_, page) => onOffset(page * item.limit)}
            onRowsPerPageChange={(event) => onLimit(Number(event.target.value))}
          />
        </>
      )}
    </Box>
  );
}
