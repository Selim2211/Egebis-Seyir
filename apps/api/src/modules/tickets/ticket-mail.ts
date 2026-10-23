import { richTextToPlain, type RichTextNode } from '@scrum/shared';

/** Başlık üst sınırı (Bug başlığı en çok 500 karakter). */
const TITLE_MAX = 200;
/** Açıklamaya alınacak en çok karakter; fazlası "(devamı kırpıldı)" ile kesilir. */
const BODY_MAX_CHARS = 20_000;

const AUTOMATED_LOCAL_PARTS = new Set([
  'mailer-daemon',
  'postmaster',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'bounce',
  'bounces',
]);

/** "Re: Fwd: ynt: konu" → "konu" ve en çok 200 karakter; boşsa yer tutucu. */
export function ticketTitle(subject: string | undefined | null): string {
  const cleaned = (subject ?? '')
    .replace(/^\s*((re|fwd?|ynt|iletilen|il|cevap)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return '(Konusuz e-posta)';
  return cleaned.length > TITLE_MAX ? `${cleaned.slice(0, TITLE_MAX - 1)}…` : cleaned;
}

export interface MailFacts {
  fromEmail: string;
  /** Küçük harfli başlık adı → değer (mailparser `headers` tablosundan). */
  headers: ReadonlyMap<string, string>;
  ownAddress: string;
}

/**
 * Otomatik/toplu e-posta mı? (yanıt otomatiği, bülten, geri dönen posta). Bunlar Bug'a çevrilmez ve
 * otomatik yanıt almaz; aksi halde iki otomatik sistem birbirine sonsuz yanıt yazabilir.
 */
export function isAutomatedMail({ fromEmail, headers }: MailFacts): boolean {
  const local = fromEmail.split('@')[0]?.toLowerCase() ?? '';
  if (AUTOMATED_LOCAL_PARTS.has(local)) return true;
  const autoSubmitted = headers.get('auto-submitted')?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  const precedence = headers.get('precedence')?.toLowerCase();
  if (precedence && ['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)) return true;
  if (headers.has('x-autoreply') || headers.has('x-autorespond') || headers.has('list-id')) {
    return true;
  }
  return false;
}

/** Düz metni Tiptap belgesine çevirir: boş satırla ayrılan bloklar paragraf, satır sonları hardBreak olur. */
export function textToRichText(input: string): RichTextNode {
  let text = input.replace(/\r\n?/g, '\n').trim();
  if (text.length > BODY_MAX_CHARS) text = `${text.slice(0, BODY_MAX_CHARS)}\n\n(devamı kırpıldı)`;
  const paragraphs = text === '' ? [] : text.split(/\n{2,}/);
  const content: RichTextNode[] = paragraphs.map((block) => {
    const inline: RichTextNode[] = [];
    block.split('\n').forEach((line, index) => {
      if (index > 0) inline.push({ type: 'hardBreak' });
      if (line.trim() !== '') inline.push({ type: 'text', text: line });
    });
    return inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' };
  });
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

/** Bug açıklamasının düz metin karşılığı (arama için). */
export const plainOf = (doc: RichTextNode): string => richTextToPlain(doc);

/** HTML-only e-postada metin bölümü yoksa etiketlerden arındırılmış metin üretir. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Yanıt e-postasında alıntılanan eski yazışmayı keser ("... tarihinde ... yazdı:", "> " satırları, "-----Original"). */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*-{2,}\s*(original message|orijinal ileti|forwarded message)/i.test(line)) break;
    if (
      /^\s*(on .{5,80} wrote:|.{5,80} tarihinde .{3,80} şunu yazdı:|.{5,80} yazdı:)\s*$/i.test(line)
    ) {
      break;
    }
    out.push(line);
  }
  const cut = out.join('\n').trim();
  return cut === '' ? text.trim() : cut;
}
