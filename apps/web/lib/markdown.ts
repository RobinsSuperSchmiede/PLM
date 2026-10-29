/** Rough Markdown → plain text for previews (cards, lists, search results). */
export function markdownToPlainText(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/(\*\*|__|~~|`|\*|_)/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
