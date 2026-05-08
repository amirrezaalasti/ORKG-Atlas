import QuestionAccordion from './QuestionAccordion';
import { Box, Paper, Typography, Chip, Stack, Button } from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { FirebaseQuestion } from '../store/slices/questionSlice';
import { Link as RouterLink, useParams } from 'react-router';
import { getBuiltinTemplateConfig } from '../constants/template_config';
import { Query } from '../constants/queries_chart_info';
import InfoIcon from '@mui/icons-material/Info';
import { useState, useEffect } from 'react';
import CRUDHomeContent, { HomeContentData } from '../firestore/CRUDHomeContent';
import { useBackupChange } from '../hooks/useBackupChange';
import { getOrkgTemplateDetail } from '../services/orkgTemplatesApi';

//* Dashboard component that displays the questions for a given template
const Dashboard = () => {
  const params = useParams();
  const templateId = params.templateId;
  const [homeContent, setHomeContent] = useState<HomeContentData | null>(null);
  const backupVersion = useBackupChange(); // Listen for backup changes

  const firebaseQuestions = useSelector<
    RootState,
    Record<string, FirebaseQuestion>
  >(
    (state) =>
      state.questions.firebaseQuestions as Record<string, FirebaseQuestion>
  );

  const [orkgDetail, setOrkgDetail] = useState<{
    label: string;
    description: string | null;
  } | null>(null);

  useEffect(() => {
    const loadHomeContent = async () => {
      const content = await CRUDHomeContent.getHomeContent();
      setHomeContent(content);
    };
    loadHomeContent();
  }, [backupVersion]); // Re-fetch when backup changes

  useEffect(() => {
    let cancelled = false;
    const loadDetail = async () => {
      if (!templateId || getBuiltinTemplateConfig(templateId)) {
        setOrkgDetail(null);
        return;
      }
      const detail = await getOrkgTemplateDetail(templateId);
      if (!cancelled && detail)
        setOrkgDetail({
          label: detail.label,
          description: detail.description,
        });
      else if (!cancelled) setOrkgDetail(null);
    };
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const sortedFirebaseQuestions = Object.values(firebaseQuestions).sort(
    (a, b) => a.id - b.id
  );

  const builtinConfig = getBuiltinTemplateConfig(templateId as string);

  /** Curated dashboards: Empirical Research Practice & NLP4RE */
  const queriesForCuratedTemplate = builtinConfig?.queries ?? null;

  const mergedQuestions = queriesForCuratedTemplate
    ? sortedFirebaseQuestions.map((question) => {
        return {
          ...queriesForCuratedTemplate.find((q) => q.id === question.id),
          ...question,
        };
      })
    : [];

  const homeOverride = homeContent?.templateInfoBoxes?.[templateId as string];

  const templateInfoTitle =
    homeOverride?.title ??
    builtinConfig?.title ??
    orkgDetail?.label ??
    templateId ??
    'Template';

  const templateInfoDescriptionHtml = homeOverride?.description ?? '';

  // Get template info box content from home content or use fallback
  const templateInfoBox = {
    title: templateInfoTitle,
    description: templateInfoDescriptionHtml,
  };

  /** Any ORKG template: show catalog metadata + Atlas tools; avoid bundling empirical questions by mistake */
  if (!queriesForCuratedTemplate) {
    return (
      <Box
        sx={{
          width: '100%',
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          px: { xs: 2, sm: 3, md: 4 },
          py: { xs: 3, md: 6 },
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '1000px',
            mb: { xs: 3, md: 4 },
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, sm: 3 },
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              borderLeft: '4px solid #039be5',
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.5 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: 'rgba(232, 97, 97, 0.1)',
                  flexShrink: 0,
                }}
              >
                <InfoIcon sx={{ color: '#039be5', fontSize: '1.25rem' }} />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  color: 'text.primary',
                  fontWeight: 600,
                  fontSize: '1rem',
                }}
              >
                {templateInfoBox.title}
              </Typography>
            </Box>

            {templateInfoDescriptionHtml ? (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                }}
              >
                <Box
                  dangerouslySetInnerHTML={{
                    __html: templateInfoDescriptionHtml,
                  }}
                />
              </Typography>
            ) : (
              <>
                {orkgDetail?.description ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2, fontSize: '0.875rem', lineHeight: 1.6 }}
                  >
                    {orkgDetail.description}
                  </Typography>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2, fontSize: '0.875rem', lineHeight: 1.6 }}
                  >
                    This ORKG template is not one of the two curated ORKG Atlas
                    themes yet. Explore its structure or run ad hoc SPARQL from
                    the tools below.
                  </Typography>
                )}
              </>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                component={RouterLink}
                to={`/${templateId}/schema`}
                sx={{ bgcolor: '#039be5', '&:hover': { bgcolor: '#0277bd' } }}
              >
                Template schema graph
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to={`/${templateId}/dynamic-question`}
                sx={{
                  borderColor: '#039be5',
                  color: '#039be5',
                  '&:hover': { borderColor: '#0277bd', color: '#0277bd' },
                }}
              >
                Dynamic question
              </Button>
              <Button
                variant="text"
                href={`https://orkg.org/templates/${templateId}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: 'text.secondary' }}
              >
                Open in ORKG
              </Button>
            </Stack>

            <Typography
              variant="caption"
              sx={{
                display: 'block',
                color: 'text.secondary',
                fontSize: '0.7rem',
                opacity: 0.85,
                mt: 2,
              }}
            >
              ID: {templateId}
            </Typography>
          </Paper>
        </Box>
      </Box>
    );
  }

  const queries = queriesForCuratedTemplate;

  return (
    <Box
      sx={{
        width: '100%',
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 6 },
      }}
    >
      {/* Template Info Box */}
      <Box
        sx={{
          width: '100%',
          maxWidth: '1000px',
          mb: { xs: 3, md: 4 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, sm: 3 },
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            borderLeft: '4px solid #039be5',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 1,
                backgroundColor: 'rgba(232, 97, 97, 0.1)',
                flexShrink: 0,
              }}
            >
              <InfoIcon sx={{ color: '#039be5', fontSize: '1.25rem' }} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                color: 'text.primary',
                fontWeight: 600,
                fontSize: '1rem',
              }}
            >
              {templateInfoBox.title}
            </Typography>
          </Box>

          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mb: 2,
              fontSize: '0.875rem',
              lineHeight: 1.6,
            }}
          >
            <Box
              dangerouslySetInnerHTML={{ __html: templateInfoBox.description }}
            />
          </Typography>

          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Chip
              label={`${queries!.length} Questions`}
              size="small"
              sx={{
                backgroundColor: 'rgba(232, 97, 97, 0.1)',
                color: '#039be5',
                fontWeight: 500,
                fontSize: '0.75rem',
                height: 24,
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.7rem',
                opacity: 0.7,
                ml: 'auto',
              }}
            >
              ID: {templateId}
            </Typography>
          </Box>
        </Paper>
      </Box>
      {Object.values(mergedQuestions).map((query: Query) => (
        <Box
          key={`question-wrapper-${query.uid}`}
          id={`question-${query.id}`}
          sx={{
            width: '100%',
            maxWidth: '1000px',
            mb: { xs: 2.5, md: 3.5 },
          }}
        >
          {queries!.find((q) => q.id === query.id) && (
            <QuestionAccordion query={query} />
          )}
        </Box>
      ))}
    </Box>
  );
};

export default Dashboard;
