import { Link as MuiLink, type LinkProps } from '@mui/material';
import { useChatPreviewOptional } from '../../context/ChatPreviewContext';
import { canOpenInChatPreview } from '../../utils/chatPreview';

interface PreviewLinkProps extends LinkProps {
  href: string;
}

/**
 * Link that opens ORKG / ORKG Ask URLs in the chat side-panel iframe.
 * Modifier-click still opens a new browser tab.
 */
const PreviewLink = ({
  href,
  onClick,
  target,
  rel,
  children,
  ...rest
}: PreviewLinkProps) => {
  const { tryOpenPreviewFromClick } = useChatPreviewOptional();
  const inPanel = canOpenInChatPreview(href);

  return (
    <MuiLink
      href={href}
      target={inPanel ? undefined : (target ?? '_blank')}
      rel={inPanel ? undefined : (rel ?? 'noopener noreferrer')}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          tryOpenPreviewFromClick(
            e,
            href,
            typeof children === 'string' ? children : undefined
          );
        }
      }}
      {...rest}
    >
      {children}
    </MuiLink>
  );
};

export default PreviewLink;
