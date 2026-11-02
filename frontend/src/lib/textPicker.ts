/**
 * TextPicker utility — browser-native word and sentence extraction.
 *
 * Uses Intl.Segmenter to accurately detect:
 * 1. Target word/phrase at point of click/selection (handles hyphens, apostrophes).
 * 2. Complete enclosing sentence.
 * 3. Before/After surrounding context sentences.
 *
 * Works identically across PDF text layers and EPUB iframes.
 */

export interface TextPick {
  text: string;
  sentence: string;
  leftContext: string;
  rightContext: string;
  offsetInSentence: number;
  rects: DOMRect[];
}

/**
 * Clean up text (de-hyphenate line wraps and normalize spaces).
 */
export function cleanText(str: string): string {
  return str
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2') // rejoin hyphenated words across lines
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract word, enclosing sentence, and surrounding context from a DOM node and character offset.
 */
export function extractPickFromNode(
  targetNode: Node,
  offset: number,
  containerElement?: HTMLElement,
  lang: string = 'en'
): TextPick | null {
  // Find block-level container to get full paragraph/context
  const block = containerElement || (targetNode.parentElement?.closest('p, div, span, section') as HTMLElement) || targetNode.parentElement;
  if (!block) return null;

  const fullBlockText = block.innerText || block.textContent || '';
  if (!fullBlockText.trim()) return null;

  // Compute character index of click relative to full block text
  let charIndexInBlock = 0;
  try {
    const ownerDoc = targetNode.ownerDocument || document;
    const range = ownerDoc.createRange();
    range.selectNodeContents(block);
    range.setEnd(targetNode, offset);
    charIndexInBlock = range.toString().length;
  } catch {
    charIndexInBlock = Math.min(offset, fullBlockText.length - 1);
  }

  // 1. Segment words to find the clicked word
  const wordSegmenter = new (Intl as any).Segmenter(lang, { granularity: 'word' });
  const words = Array.from(wordSegmenter.segment(fullBlockText)) as Array<{
    segment: string;
    index: number;
    isWordLike?: boolean;
  }>;

  // Find segment at charIndexInBlock (only if directly on a word)
  let pickedWord = '';
  for (const w of words) {
    if (charIndexInBlock >= w.index && charIndexInBlock <= w.index + w.segment.length) {
      if (w.isWordLike) {
        pickedWord = w.segment.trim();
        break;
      }
    }
  }

  if (!pickedWord) return null;

  // 2. Segment sentences to find sentence & context
  const sentenceSegmenter = new (Intl as any).Segmenter(lang, { granularity: 'sentence' });
  const sentences = Array.from(sentenceSegmenter.segment(fullBlockText)) as Array<{
    segment: string;
    index: number;
  }>;

  let currentSentenceIndex = -1;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (charIndexInBlock >= s.index && charIndexInBlock < s.index + s.segment.length) {
      currentSentenceIndex = i;
      break;
    }
  }

  if (currentSentenceIndex === -1 && sentences.length > 0) {
    currentSentenceIndex = 0;
  }

  const currentSentence = sentences[currentSentenceIndex]?.segment.trim() || fullBlockText;
  const leftSentences = sentences
    .slice(Math.max(0, currentSentenceIndex - 2), currentSentenceIndex)
    .map((s) => s.segment.trim())
    .join(' ');
  const rightSentences = sentences
    .slice(currentSentenceIndex + 1, currentSentenceIndex + 3)
    .map((s) => s.segment.trim())
    .join(' ');

  const offsetInSentence = currentSentence.indexOf(pickedWord);

  return {
    text: pickedWord,
    sentence: cleanText(currentSentence),
    leftContext: cleanText(leftSentences),
    rightContext: cleanText(rightSentences),
    offsetInSentence: offsetInSentence >= 0 ? offsetInSentence : 0,
    rects: [],
  };
}

/**
 * Pick text from point (x, y) coordinates on screen.
 */
export function pickTextFromPoint(
  clientX: number,
  clientY: number,
  doc: Document = document,
  lang: string = 'en'
): TextPick | null {
  let node: Node | null = null;
  let offset = 0;

  if ('caretPositionFromPoint' in (doc as any)) {
    const pos = (doc as any).caretPositionFromPoint(clientX, clientY);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (!node) return null;

  return extractPickFromNode(node, offset, undefined, lang);
}
