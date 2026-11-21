import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { EvalResultRow } from '../../services/backendApi';
import { formatF1, formatPercent } from './format';
import { explainConfig } from './glossary';

interface ScoreBoardProps {
  rows: EvalResultRow[];
  model: string;
}

export function ScoreBoard({ rows, model }: ScoreBoardProps) {
  const visible = rows.filter((row) => row.model === model);
  if (visible.length === 0) {
    return (
      <Typography color="text.secondary">
        No score table is stored for {model}.
      </Typography>
    );
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Each row is the same questions with a different prompt or repair setup.
        Exact is the share of questions answered exactly. F1 is the mean over
        questions.
      </Typography>
      <TableContainer
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          backgroundColor: 'background.paper',
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Configuration</TableCell>
              <TableCell>What changes</TableCell>
              <TableCell align="right">Questions</TableCell>
              <TableCell align="right">Exact</TableCell>
              <TableCell align="right">F1</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={`${row.model}-${row.config}`} hover>
                <TableCell
                  sx={{ fontWeight: row.config === 'full' ? 700 : 600 }}
                >
                  {row.config}
                </TableCell>
                <TableCell sx={{ maxWidth: 520, whiteSpace: 'normal' }}>
                  {explainConfig(row.config)}
                </TableCell>
                <TableCell align="right">{row.questions}</TableCell>
                <TableCell align="right">{formatPercent(row.exact)}</TableCell>
                <TableCell align="right">{formatF1(row.f1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
