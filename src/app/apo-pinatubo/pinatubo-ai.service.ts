import { Injectable } from '@angular/core';
import { retrieveContext, ContextPassage } from './pinatubo-engine';
import { environment } from '../../environments/environment';

export interface AIAnswer {
  text: string;
}

// How many source passages to hand the model as grounding context.
const CONTEXT_TOP_K = 8;

// Keeps the seismo typing indicator on screen for a believable beat.
const MIN_THINK_MS = 550;

// Gemini proxy â€” the API key never leaves the server.
const PROXY_URL = `${environment.apiUrl}/api/chat`;
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 500;

// Longest passage text sent to the model, in characters.
const MAX_PASSAGE_CHARS = 700;

// Creator answer â€” hardcoded so it is always exact.
const CREATORS_ANSWER =
  'I was created by Friench Ocampo and Sebastian Canlas. Feel free to ask me anything about Mount Pinatubo.';

const CREATOR_TARGET = String.raw`(you|yourself|u|this (ai|chatbot|bot|kiosk|app|application|program|system|assistant)|the (ai|chatbot|bot|kiosk|app|application|program|system|assistant)|ai|chatbot|bot)`;
const CREATOR_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bwho\s+(made|created|create|built|build|developed|develop|programmed|designed|coded|invented|owns|trained)\s+${CREATOR_TARGET}\b`, 'i'),
  new RegExp(String.raw`\bwho\s+(is|are|was|were)\s+(your|the)\s+(creators?|developers?|makers?|programmers?|designers?|builders?|authors?|owners?)\b`, 'i'),
  /\byour\s+(creators?|developers?|makers?|programmers?|designers?|builders?)\b/i,
  new RegExp(String.raw`\bwho('?s|\s+is|\s+are)?\s+behind\s+${CREATOR_TARGET}\b`, 'i'),
  /\b(were|was)\s+you\s+(made|created|built|developed|programmed|designed)\b/i,
  /\byou\s+(were|was)\s+(made|created|built|developed|programmed|designed)\s+by\b/i,
  /\bsino\b.*\b(gumawa|lumikha|nilikha|ginawa|nagdisenyo|nag-?program|nagprogram)\b/i,
  /\b(gumawa|lumikha|nilikha|ginawa)\b.*\b(sa\s+iyo|sa\s+inyo|ka|kayo|ai|chatbot|kiosk)\b.*\bsino\b/i
];

function isCreatorQuestion(question: string): boolean {
  return CREATOR_PATTERNS.some(p => p.test(question));
}

// HYBRID SYSTEM PROMPT
// Primary: use local archive passages as context clues.
// Secondary: fill gaps with Gemini's own accurate pre-trained knowledge
// about this well-documented historical event.
// Gatekeeper: if not about Pinatubo at all, decline politely.
const SYSTEM_PROMPT = `You are Apo Namalyari, a knowledgeable guide to Mount Pinatubo at a museum kiosk in the Philippines.

You will be given SOURCE PASSAGES from authoritative books and research about Mount Pinatubo. Use these as your PRIMARY context â€” they are your most reliable grounding.

For details NOT covered by the source passages: you may draw on your own accurate pre-trained knowledge about Mount Pinatubo and the 1991 eruption. This is a well-documented historical event and your training data about it is reliable.

Rules:
1. SOURCE PASSAGES take priority. If a passage directly answers the question, use it. If passages partially cover the question, use them as context and supplement carefully from your own knowledge only where needed.
2. Never fabricate statistics, casualty figures, dates, or names. If you are unsure of a specific number, say so rather than inventing one.
3. If the question is unrelated to Mount Pinatubo â€” its eruption, geology, history, lahars, the Aeta people, PHIVOLCS, Clark Air Base, or events directly connected to the 1991 eruption â€” decline politely and invite them to ask about Pinatubo instead.
4. If the visitor's message is a greeting, pleasantry, or thanks, respond warmly and briefly in character.
5. Never cite sources, passage numbers, book titles, or say "according to my sources." Speak naturally as Apo Namalyari.
6. Keep answers SHORT: 1 to 3 sentences. No markdown, no bullet points, no headers.
7. If the visitor asks who made or created you, say you were created by Friench Ocampo and Sebastian Canlas.
8. Maintain a warm, professional, museum-guide tone throughout.`;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// The (label) prefix on each passage below is for the model's own
// understanding of provenance only Ã¢â‚¬â€ e.g. so it doesn't blend two
// passages that actually contradict each other across sources Ã¢â‚¬â€ it is
// never shown to the visitor (see rule 6 above and REMOVED: citation
// display, previously rendered under each answer in apo-pinatubo.html).
//
// FIX: passages used to be numbered "[1]", "[2]"... The small model
// copied those numbers into answers ("as mentioned in source passage
// [2]"), so they're gone. Nothing needs them, since answers never show
// citations.
//
// FIX: some passages are the HAU book author writing in first person
// (the prologue and acknowledgments: "Leonardo Calma, who spent long
// hours with me in designing this book"). Apo Namalyari also speaks as
// "I", so the model repeated the author's "me" as its own ("Leonardo
// Calma was with me in designing the book"). First-person passages are
// now labeled so the model knows "I/me/my" means the author (see rule 10).
const FIRST_PERSON = /\b(I|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself|[Ww]e|[Oo]ur|[Oo]urs|[Uu]s)\b/;

function buildContextBlock(passages: ContextPassage[]): string {
  if (!passages.length) return '(no matching passages were found for this question)';
  return passages
    .map(p => {
      const where = p.source ? `${p.source.split(' (')[0]}, p.${p.page}` : `p.${p.page}`;
      const voice = FIRST_PERSON.test(p.text)
        ? `; written in first person by the book's author, so "I/me/my/we" means the author, not you`
        : '';
      const text = p.text.length > MAX_PASSAGE_CHARS
        ? p.text.slice(0, MAX_PASSAGE_CHARS).replace(/\s+\S*$/, '') + 'Ã¢â‚¬Â¦'
        : p.text;
      return `- (${where}${voice}) ${text}`;
    })
    .join('\n\n');
}



// SAFETY NET: rule 7 in SYSTEM_PROMPT already tells the model never to
// reveal where an answer comes from, but small models don't always
// follow every instruction every time. This is a second, code-level
// line of defense Ã¢â‚¬â€ it strips the most common ways a source leaks
// through (a leading "According to X, " clause, or a bare mention of
// one of the known book titles) rather than relying on the prompt alone.
// It only removes safe, grammatically-clean prefix clauses; it will not
// catch every possible phrasing, so the prompt instruction still matters.
const KNOWN_SOURCE_NAMES = [
  "Pinatubo: The Saga of the Philippines' Forgotten Giant",
  'Fire and Mud',
  'Pinatubo Complete Q&A Reference Guide',
  'The Ash Warriors',
  'Pinatubo and the Politics of Lahar',
  'Holy Angel University',
  'USGS-PHIVOLCS',
  'HAU Pinatubo Museum Timeline Exhibit'
];

function stripSourceMentions(answer: string): string {
  let result = answer;

  // Leading attribution clauses, e.g. "According to Fire and Mud, the..."
  // or "Based on the archive, lahars are..." Ã¢â‚¬â€ safe to drop the whole
  // clause since what follows already stands as a complete sentence.
  // Re-capitalizes the new first letter, since what follows the comma
  // was originally mid-sentence and starts lowercase.
  result = result.replace(
    /^(according to|based on|as (?:stated|mentioned|noted|described) in|per)\s+[^,]{0,80},\s*([a-z])/i,
    (_match, _lead, firstLetter: string) => firstLetter.toUpperCase()
  );

  // Mid-sentence or sentence-ending meta-reference clauses, e.g.
  // "...designed the book, as mentioned in the source passage." or
  // "...the book, as stated in the archive, is well known" Ã¢â‚¬â€ a
  // comma-led parenthetical aside, safe to drop entirely (including
  // both surrounding commas) since it isn't load-bearing grammar.
  // Keeps the sentence-ending period when the clause was the last
  // thing before it; otherwise the two halves just flow together.
  //
  // FIX: the old pattern required punctuation right after "passage", so
  // "as mentioned in source passage [2]." slipped through. Now it also
  // allows a reference number after the word ("passage [2]", "passages 2
  // and 3") and a wrapping parenthesis.
  const REF_NUMS = String.raw`(?:\s*\[?\d+\]?(?:\s*(?:,|and|&)\s*\[?\d+\]?)*)?`;
  result = result.replace(
    new RegExp(
      String.raw`,?\s*\(?\s*(?:as|which is|which was)\s+(?:mentioned|stated|noted|described|shown|seen)\s+in\s+` +
      String.raw`(?:the\s+|this\s+|that\s+)?(?:source\s+|given\s+|provided\s+)?` +
      String.raw`(?:passages?|text|archive|documents?|sources?)` + REF_NUMS +
      // mid-sentence ("X, as noted in the text, was") drops both commas;
      // at the end of a sentence it stops before the period
      String.raw`\s*\)?(?:\s*,(?=\s)|(?=\s*[.,;!?]|\s*$))`,
      'gi'
    ),
    ''
  );

  // "(see passage 2)", "(passage [3])", "(source 1)"
  result = result.replace(
    new RegExp(String.raw`\s*\(\s*(?:see\s+)?(?:source\s+)?(?:passages?|sources?)` + REF_NUMS + String.raw`\s*\)`, 'gi'),
    ''
  );

  // "...in passage 2" / "...in source passage [2]"
  result = result.replace(
    new RegExp(String.raw`\s+in\s+(?:the\s+)?(?:source\s+)?passages?\s*\[?\d+\]?(?:\s*(?:,|and|&)\s*\[?\d+\]?)*`, 'gi'),
    ''
  );

  // Any leftover bracketed reference numbers: "[2]", "[1, 3]", "[2-4]"
  result = result.replace(/\s*\[\d+(?:\s*[,Ã¢â‚¬â€œ-]\s*\d+)*\]/g, '');

  // Trailing "...in the given/provided information/passages/text/archive"
  // Ã¢â‚¬â€ a generic meta-reference to the retrieval context with no specific
  // source name, safe to drop as a dangling prepositional phrase.
  result = result.replace(
    /\s+in\s+the\s+(given|provided)\s+(information|passages?|text|archive)\b/gi,
    ''
  );

  // Cleanup: collapse any doubled-up spaces and fix stray space-before-
  // punctuation left behind by the removals above.
  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;!?])/g, '$1')
    .replace(/,([.;!?])/g, '$1')
    .trim();

  // A bare mention of a known title anywhere else in the text gets
  // logged so it's easy to notice during testing, even though this
  // function doesn't attempt to rewrite every possible mid-sentence
  // mention (that needs real language understanding, not a regex, to
  // avoid producing a grammatically broken sentence in the general case).
  for (const name of KNOWN_SOURCE_NAMES) {
    if (result.toLowerCase().includes(name.toLowerCase())) {
      console.warn(`[Apo Namalyari] Answer still mentions a source ("${name}") despite the prompt instruction not to:`, result);
    }
  }

  return result.trim();
}

// FIX: rules 1-3 in SYSTEM_PROMPT now tell the model as forcefully as
// possible to use ONLY the passages and never its own trained knowledge
// of Pinatubo Ã¢â‚¬â€ but a small model like qwen3:0.6b won't obey a prompt
// instruction perfectly every time. This is a second, code-level check
// specifically for the kind of slip that's hardest to catch by eye: a
// specific-sounding number or year the model stated confidently that
// simply isn't anywhere in the retrieved passages (a classic small-model
// hallucination pattern Ã¢â‚¬â€ filling a gap with something plausible rather
// than admitting the archive doesn't say). It only flags candidates for
// review in the console; it never blocks or rewrites the answer, since a
// number written differently than in the passage (e.g. "a million" vs.
// "1,000,000+") would be a false positive, and refusing a correct answer
// outright would hurt the visitor experience more than an occasional
// unflagged slip does. Use this during testing to catch real archive
// mismatches early, not as a runtime filter.
function warnIfUngrounded(answer: string, passages: ContextPassage[]): void {
  const passageText = passages.map(p => p.text).join(' \n ');
  const numberPattern = /\b\d[\d,]{2,}\b|\b\d{4}\b/g;
  const answerNumbers = answer.match(numberPattern) ?? [];
  for (const num of answerNumbers) {
    const normalized = num.replace(/,/g, '');
    const foundAsIs = passageText.includes(num);
    const foundNormalized = passageText.replace(/,/g, '').includes(normalized);
    if (!foundAsIs && !foundNormalized) {
      console.warn(
        `[Apo Namalyari] Answer states "${num}" but that figure does not appear in any retrieved passage Ã¢â‚¬â€ possible hallucinated detail. Verify against the archive:`,
        { answer, passageText }
      );
    }
  }
}

interface GeminiProxyResponse {
  reply?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class PinatuboAiService {

  async ask(question: string): Promise<AIAnswer> {
    const started = Date.now();
    const result = await this.resolve(question);
    const elapsed = Date.now() - started;
    if (elapsed < MIN_THINK_MS) {
      await sleep(MIN_THINK_MS - elapsed);
    }
    return result;
  }

  private async queryGemini(userContent: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
          messages: [{ role: 'user', content: userContent }]
        })
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Gemini proxy timed out after ${TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Proxy returned HTTP ${res.status}: ${body}`);
    }

    const data = await res.json() as GeminiProxyResponse;
    if (!data.reply) {
      console.error('[Apo Namalyari] Proxy returned no reply field:', data);
      throw new Error('Proxy response missing reply');
    }

    // Gemini does not need JSON wrapping Ã¢â‚¬â€ it returns plain text.
    // Still run it through stripSourceMentions for consistency.
    return stripSourceMentions(data.reply.trim());
  }


  private async resolve(question: string): Promise<AIAnswer> {
    if (isCreatorQuestion(question)) {
      return { text: CREATORS_ANSWER };
    }
    const passages: ContextPassage[] = retrieveContext(question, CONTEXT_TOP_K);
    const userContent = passages.length > 0
      ? `CONTEXT FROM ARCHIVE:\n${buildContextBlock(passages)}\n\nVISITOR QUESTION: ${question.trim()}`
      : `VISITOR QUESTION: ${question.trim()}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const answer = await this.queryGemini(userContent);
        return { text: answer };
      } catch (err) {
        console.error(`[Apo Namalyari] Gemini request failed (attempt ${attempt}/2):`, err);
        if (attempt === 2) {
          return { text: "I'm having trouble connecting right now. Please try again in a moment." };
        }
      }
    }
    return { text: "I'm having trouble connecting right now. Please try again in a moment." };
  }
}