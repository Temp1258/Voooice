import React, { useRef } from 'react';
import { FileText, Pause, Type, Zap, Wand2, Clock, Hash } from 'lucide-react';
import { useAudiobook } from './AudiobookContext';
import { splitTextIntoSegments } from './audiobookUtils';
import type { Chapter } from '../../types';

export function EditorTab() {
  const { book, setBook, selectedChapterId, t } = useAudiobook();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chapter = book.chapters.find(c => c.id === selectedChapterId);

  if (!chapter) {
    return (
      <div className="text-center py-16">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{t('audiobook.editor.selectChapter')}</p>
      </div>
    );
  }

  const updateChapter = (updates: Partial<Chapter>) => {
    const chapters = book.chapters.map(c =>
      c.id === chapter.id ? { ...c, ...updates } : c
    );
    setBook({ ...book, chapters, updatedAt: Date.now() });
  };

  const insertAtCursor = (before: string, after: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = chapter.rawText.slice(start, end);
    const newText = chapter.rawText.slice(0, start) + before + selected + after + chapter.rawText.slice(end);
    updateChapter({ rawText: newText });
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    }, 0);
  };

  const handleAutoDetectRoles = () => {
    const narrator = book.roles.find(r => r.id === book.defaultNarratorId) || book.roles[0];
    const segments = splitTextIntoSegments(chapter.rawText, book.roles, narrator?.name || 'Narrator');
    updateChapter({ segments });
  };

  const wordCount = chapter.rawText.length;
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 250));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <input
          type="text"
          value={chapter.title}
          onChange={(e) => updateChapter({ title: e.target.value })}
          className="w-full text-lg font-semibold text-gray-900 border-none focus:outline-none focus:ring-0 bg-transparent"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3">
        <p className="text-xs font-medium text-gray-500 mb-2">{t('audiobook.editor.ssmlToolbar')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => insertAtCursor('<break time="500ms"/>')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Pause className="h-3 w-3" />
            <span>{t('audiobook.editor.insertPause')}</span>
          </button>
          <button
            onClick={() => insertAtCursor('<emphasis>', '</emphasis>')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Type className="h-3 w-3" />
            <span>{t('audiobook.editor.emphasis')}</span>
          </button>
          <button
            onClick={() => insertAtCursor('<prosody rate="fast">', '</prosody>')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Zap className="h-3 w-3" />
            <span>{t('audiobook.editor.speedChange')}</span>
          </button>
          <button
            onClick={() => insertAtCursor('[emotion:happy]', '[/emotion]')}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <Wand2 className="h-3 w-3" />
            <span>{t('audiobook.editor.emotionMark')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <textarea
          ref={textareaRef}
          value={chapter.rawText}
          onChange={(e) => updateChapter({ rawText: e.target.value })}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
          rows={14}
          placeholder={t('audiobook.editor.chapterText')}
        />

        <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Hash className="h-3 w-3" />
              <span>{t('audiobook.editor.wordCount')}: {wordCount}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>{t('audiobook.editor.estimatedDuration')}: ~{estimatedMinutes} {t('audiobook.editor.minutes')}</span>
            </span>
          </div>
          <button
            onClick={handleAutoDetectRoles}
            disabled={!chapter.rawText.trim()}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            <Wand2 className="h-3 w-3" />
            <span>{t('audiobook.editor.autoDetectRoles')}</span>
          </button>
        </div>
      </div>

      {chapter.segments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            {t('audiobook.editor.segmentPreview')} ({chapter.segments.length} {t('audiobook.editor.segments')})
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {chapter.segments.map((seg) => {
              const role = book.roles.find(r => r.name === seg.roleName);
              return (
                <div key={seg.id} className="flex items-start space-x-2 text-xs p-2 bg-gray-50 rounded-lg">
                  <span
                    className="inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: role?.color || '#9ca3af' }}
                  />
                  <span className="font-medium text-gray-600 flex-shrink-0 w-16 truncate">{seg.roleName}</span>
                  <span className="text-gray-500 truncate">{seg.text.slice(0, 80)}{seg.text.length > 80 ? '...' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
