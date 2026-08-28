import { useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { PartnersContent } from '../../firestore/CRUDHomeContent';
import { fadeUp, MotionBox, staggerContainer } from '../../constants/motion';
import { useRevealMotion } from '../../hooks/useRevealMotion';
import SectionHeading from './SectionHeading';
import { plateSx } from './atlasTokens';
import tibLogo from '../../assets/TIB.png';
import orkgLogo from '../../assets/ORKG.png';
import orkgaskLogo from '../../assets/ORKGask.png';
import KGEmpireLogo from '../../assets/KGEmpire.png';
import NLP4RELogo from '../../assets/NLP4RE.png';

interface PartnersProps {
  content: PartnersContent;
}

const logoMap: Record<string, string> = {
  '/src/assets/TIB.png': tibLogo,
  '/src/assets/ORKG.png': orkgLogo,
  '/src/assets/ORKGask.png': orkgaskLogo,
  '/src/assets/KGEmpire.png': KGEmpireLogo,
  '/src/assets/NLP4RE.png': NLP4RELogo,
};

const Partners = ({ content }: PartnersProps) => {
  const theme = useTheme();
  const reveal = useRevealMotion();
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const getLogoSrc = (logoUrl: string) => logoMap[logoUrl] ?? logoUrl;

  return (
    <Box>
      <SectionHeading
        eyebrow="Institutions"
        title={content.title}
        align="center"
      />
      <MotionBox
        {...reveal}
        variants={staggerContainer}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        {content.partners.map((partner) => {
          const logoSrc = getLogoSrc(partner.logoUrl);
          const hasError = failedImages.has(partner.logoUrl);
          return (
            <Box
              key={partner.label}
              component="a"
              href={partner.link}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textDecoration: 'none', color: 'inherit' }}
            >
              <MotionBox
                variants={fadeUp}
                sx={{
                  ...plateSx(theme.palette.mode),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 3,
                  height: '100%',
                  transition: 'border-color 0.2s ease',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {!hasError ? (
                    <Box
                      component="img"
                      src={logoSrc}
                      alt=""
                      onError={() =>
                        setFailedImages((prev) =>
                          new Set(prev).add(partner.logoUrl)
                        )
                      }
                      sx={{ width: 40, height: 40, objectFit: 'contain' }}
                    />
                  ) : null}
                </Box>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                  }}
                >
                  {partner.label}
                </Typography>
              </MotionBox>
            </Box>
          );
        })}
      </MotionBox>
    </Box>
  );
};

export default Partners;
