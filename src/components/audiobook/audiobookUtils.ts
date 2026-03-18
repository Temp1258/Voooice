/**
 * Shared utilities for the Audiobook workbench components.
 */
import type { AudioBook, ChapterSegment, VoiceRole, VoicePrint } from '../../types';

export const STORAGE_KEY = 'voooice_audiobooks';
export const EMOTION_OPTIONS = ['neutral', 'happy', 'sad', 'angry', 'excited', 'calm'] as const;
export const ROLE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];
export const MAX_SEGMENT_LENGTH = 500;

export function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。！？.!?\n])/);
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_SEGMENT_LENGTH && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

export function splitTextIntoSegments(
  text: string,
  roles: VoiceRole[],
  narratorName: string,
): ChapterSegment[] {
  const segments: ChapterSegment[] = [];
  const dialoguePattern = /[\u300c\u201c]([^\u300d\u201d]*)[\u300d\u201d]/g;
  let lastIndex = 0;
  let order = 0;
  let match: RegExpExecArray | null;

  while ((match = dialoguePattern.exec(text)) !== null) {
    const beforeText = text.slice(lastIndex, match.index).trim();
    if (beforeText) {
      for (const chunk of chunkText(beforeText)) {
        segments.push({
          id: generateId(), text: chunk, roleName: narratorName,
          emotion: 'neutral', duration: 0, order: order++, status: 'pending',
        });
      }
    }
    const dialogueText = match[1].trim();
    if (dialogueText) {
      segments.push({
        id: generateId(), text: dialogueText,
        roleName: roles.length > 1 ? roles[1].name : narratorName,
        emotion: 'neutral', duration: 0, order: order++, status: 'pending',
      });
    }
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    for (const chunk of chunkText(remaining)) {
      segments.push({
        id: generateId(), text: chunk, roleName: narratorName,
        emotion: 'neutral', duration: 0, order: order++, status: 'pending',
      });
    }
  }

  if (segments.length === 0 && text.trim()) {
    for (const chunk of chunkText(text.trim())) {
      segments.push({
        id: generateId(), text: chunk, roleName: narratorName,
        emotion: 'neutral', duration: 0, order: order++, status: 'pending',
      });
    }
  }

  return segments;
}

export function splitByChapterMarkers(text: string): { title: string; content: string }[] {
  const pattern = /(?:^|\n)\s*((?:第[一二三四五六七八九十百千\d]+章|Chapter\s+\d+)[^\n]*)/gi;
  const matches: { index: number; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    matches.push({ index: match.index, title: match[1].trim() });
  }

  if (matches.length === 0) {
    return [{ title: 'Chapter 1', content: text.trim() }];
  }

  const chapters: { title: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].title.length + 1;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    chapters.push({ title: matches[i].title, content: text.slice(start, end).trim() });
  }

  return chapters;
}

export function createDefaultNarrator(voicePrints: VoicePrint[]): VoiceRole {
  return {
    id: generateId(),
    name: 'Narrator',
    voicePrintId: voicePrints[0]?.id || '',
    defaultEmotion: 'neutral',
    speedMultiplier: 1.0,
    color: ROLE_COLORS[0],
  };
}

export function createEmptyBook(voicePrints: VoicePrint[]): AudioBook {
  const narrator = createDefaultNarrator(voicePrints);
  return {
    id: generateId(),
    title: '',
    author: '',
    chapters: [],
    roles: [narrator],
    defaultNarratorId: narrator.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalDuration: 0,
    status: 'draft',
  };
}

export function serializeBook(book: AudioBook): string {
  const cleanBook = {
    ...book,
    chapters: book.chapters.map(ch => ({
      ...ch,
      segments: ch.segments.map(seg => ({
        ...seg,
        audioBlob: undefined,
      })),
    })),
  };
  return JSON.stringify(cleanBook);
}

export function loadBooksFromStorage(): AudioBook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveBooksToStorage(books: AudioBook[]): void {
  try {
    const cleaned = books.map(b => JSON.parse(serializeBook(b)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch { /* ignore */ }
}
