import { Box, BoxProps } from '@mui/material';
import DOMPurify from 'dompurify';

interface SafeHtmlProps extends BoxProps {
  html: string;
}

const SafeHtml = ({ html, sx, ...rest }: SafeHtmlProps) => {
  return (
    <Box
      {...rest}
      sx={{
        '& p': { m: 0, mb: 1.5, '&:last-child': { mb: 0 } },
        '& strong': { fontWeight: 700 },
        '& a': { color: 'primary.main' },
        ...((sx as object) ?? {}),
      }}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
};

export default SafeHtml;
