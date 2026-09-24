import { useEffect, useState } from 'react';
import { apiRequest, updateTemplate } from '../services/backendApi';

export const DEFAULT_TEMPLATE_ID = 'R186491';
export const NLP4RE_TEMPLATE_ID = 'R1544125';

export async function loadTemplateIntroText(
  templateId: string | null | undefined
): Promise<{ introText: string | null; title: string | null }> {
  const activeTemplateId = (templateId || DEFAULT_TEMPLATE_ID).toUpperCase();
  if (activeTemplateId === NLP4RE_TEMPLATE_ID) {
    return { introText: null, title: null };
  }
  try {
    const data = await apiRequest(`/api/templates/${activeTemplateId}`);
    return { introText: data?.introText ?? null, title: data?.title ?? null };
  } catch {
    return { introText: null, title: null };
  }
}

export async function saveTemplateIntroText(
  templateId: string,
  introText: string,
  userId: string,
  userEmail: string
): Promise<void> {
  await updateTemplate(
    templateId,
    { introText: introText.trim() },
    userId,
    userEmail
  );
}

export function useTemplateIntroText(templateId: string | null | undefined) {
  const [introCustomText, setIntroCustomText] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);

  useEffect(() => {
    const loadIntroText = async () => {
      setIntroCustomText(null);
      setTemplateTitle(null);
      const { introText, title } = await loadTemplateIntroText(templateId);
      setIntroCustomText(introText);
      setTemplateTitle(title);
    };
    void loadIntroText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  return { introCustomText, setIntroCustomText, templateTitle };
}
