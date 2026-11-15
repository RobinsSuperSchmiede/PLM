import { addDays, toDateKey } from '@/lib/dates';
import type { EntityType } from '@/lib/types';

/**
 * The search understands a few operators next to plain words, so entries the agent or the Telegram bot
 * added can be found without clicking through the pages:
 *   #tag            entries with that tag (prefix is enough)
 *   @project        entries of a project whose name contains the text
 *   typ:notiz       one kind of entry (also type:, art:)
 *   von:telegram    notes by origin: telegram, mcp or app (also via:, from:, quelle:)
 *   heute, gestern, morgen, woche, monat – or 14.11., 14.11.2026, 2026-11-14, 2026-11
 *   vor:DATE / nach:DATE (also before:/after:) for open ranges
 * Everything else is matched against titles and the full text.
 */
export type DateRange = { from: string; to: string; label: string };
export type ParsedQuery = {
  words: string[];
  tags: string[];
  projects: string[];
  types: (EntityType | 'image')[];
  sources: string[];
  range: DateRange | null;
};

const typeAliases: Record<string, EntityType | 'image'> = {
  notiz: 'note', notizen: 'note', note: 'note', notes: 'note',
  aufgabe: 'task', aufgaben: 'task', task: 'task', tasks: 'task', todo: 'task',
  projekt: 'project', projekte: 'project', project: 'project', projects: 'project',
  termin: 'event', termine: 'event', event: 'event', events: 'event',
  meeting: 'meeting', meetings: 'meeting',
  dokument: 'knowledge', dokumente: 'knowledge', doc: 'knowledge', docs: 'knowledge', document: 'knowledge', wissen: 'knowledge', knowledge: 'knowledge',
  datei: 'file', dateien: 'file', file: 'file', files: 'file',
  bild: 'image', bilder: 'image', image: 'image', images: 'image', foto: 'image',
  idee: 'idea', ideen: 'idea', idea: 'idea', ideas: 'idea',
  ordner: 'folder', folder: 'folder',
};
const sourceAliases: Record<string, string> = { telegram: 'telegram', tg: 'telegram', bot: 'telegram', mcp: 'mcp', ki: 'mcp', ai: 'mcp', agent: 'mcp', app: 'app' };
const months = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const monthsEn = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (value: number) => String(value).padStart(2, '0');
const monthRange = (year: number, month: number, label: string): DateRange => ({
  from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`, label,
});

/** Turns one token into a day or a span of days, or returns null if it is not a date. */
export function parseDate(token: string, now = new Date()): DateRange | null {
  const day = (offset: number, label: string): DateRange => {
    const key = toDateKey(addDays(now, offset));
    return { from: key, to: key, label };
  };
  switch (token) {
    case 'heute': case 'today': return day(0, token);
    case 'gestern': case 'yesterday': return day(-1, token);
    case 'morgen': case 'tomorrow': return day(1, token);
    case 'woche': case 'week': {
      const monday = addDays(now, -((now.getDay() + 6) % 7));
      return { from: toDateKey(monday), to: toDateKey(addDays(monday, 6)), label: token };
    }
    case 'monat': case 'month': return monthRange(now.getFullYear(), now.getMonth() + 1, token);
  }
  let match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(token);
  if (match) {
    if (!match[3]) return monthRange(Number(match[1]), Number(match[2]), token);
    return { from: token, to: token, label: token };
  }
  match = /^(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?$/.exec(token);
  if (match) {
    const year = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : now.getFullYear();
    const key = `${year}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
    return Number(match[2]) <= 12 && Number(match[1]) <= 31 ? { from: key, to: key, label: token } : null;
  }
  const month = Math.max(months.indexOf(token), monthsEn.indexOf(token));
  return month >= 0 ? monthRange(now.getFullYear(), month + 1, token) : null;
}

export function parseQuery(raw: string): ParsedQuery {
  const result: ParsedQuery = { words: [], tags: [], projects: [], types: [], sources: [], range: null };
  const narrow = (next: Partial<DateRange> & { label: string }) => {
    result.range = { from: next.from ?? result.range?.from ?? '0000-01-01', to: next.to ?? result.range?.to ?? '9999-12-31', label: result.range && result.range.label !== next.label ? `${result.range.label} ${next.label}` : next.label };
  };
  for (const token of raw.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (token.length > 1 && token.startsWith('#')) { result.tags.push(token.slice(1)); continue; }
    if (token.length > 1 && token.startsWith('@')) { result.projects.push(token.slice(1)); continue; }
    const operator = /^([a-zäöü]+):(.+)$/.exec(token);
    if (operator) {
      const [, name, value] = operator;
      if (['typ', 'type', 'art', 'kind'].includes(name) && typeAliases[value]) { result.types.push(typeAliases[value]); continue; }
      if (['von', 'via', 'from', 'quelle', 'source'].includes(name) && sourceAliases[value]) { result.sources.push(sourceAliases[value]); continue; }
      if (['tag'].includes(name)) { result.tags.push(value.replace(/^#/, '')); continue; }
      if (['projekt', 'project'].includes(name)) { result.projects.push(value); continue; }
      const date = parseDate(value);
      if (date && ['datum', 'date', 'am', 'on', 'im', 'in'].includes(name)) { narrow(date); continue; }
      if (date && ['vor', 'before', 'bis', 'until'].includes(name)) { narrow({ to: date.to, label: token }); continue; }
      if (date && ['nach', 'after', 'seit', 'since', 'ab'].includes(name)) { narrow({ from: date.from, label: token }); continue; }
    }
    // Bare month names stay ordinary words ("mai", "march"); days and relative words count as dates.
    const date = months.includes(token) || monthsEn.includes(token) ? null : parseDate(token);
    if (date) { narrow(date); continue; }
    result.words.push(token);
  }
  return result;
}

export const hasFilters = (query: ParsedQuery) => Boolean(query.tags.length || query.projects.length || query.types.length || query.sources.length || query.range);
