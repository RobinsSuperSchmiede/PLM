'use client';

import { useI18n } from '@/components/i18n-provider';

/** Footnote listing the accepted upload formats. */
export function AcceptedFilesHint() {
  const { t } = useI18n();
  return <p className="px-5 pb-6 pt-2 text-xs text-muted-foreground sm:px-8">{t('files.dropHint')}</p>;
}
