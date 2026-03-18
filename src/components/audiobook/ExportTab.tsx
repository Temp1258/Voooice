import React, { useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { downloadBlob } from '../../utils/audioExport';
import { useAudiobook } from './AudiobookContext';
import type { AudioExportFormat } from '../../types';

export function ExportTab() {
  const { book, selectedChapterId, t } = useAudiobook();
  const [format, setFormat] = useState<AudioExportFormat>('wav');
  const [includeMarkers, setIncludeMarkers] = useState(true);
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');

  const allSegments = book.chapters.flatMap(ch => ch.segments);
  const hasAudio = allSegments.some(s => s.status === 'done' && s.audioBlob);

  const handleExportChapter = () => {
    const chapter = book.chapters.find(c => c.id === selectedChapterId);
    if (!chapter) return;
    const blobs = chapter.segments
      .filter(s => s.status === 'done' && s.audioBlob)
      .map(s => s.audioBlob!);
    if (blobs.length === 0) return;
    const combined = new Blob(blobs, { type: 'audio/wav' });
    const safeName = (book.title || 'audiobook').replace(/[^\w\u4e00-\u9fff]/g, '_');
    downloadBlob(combined, `${safeName}_${chapter.title}.wav`);
  };

  const handleExportBook = () => {
    const blobs: Blob[] = [];
    for (const chapter of book.chapters) {
      for (const seg of chapter.segments) {
        if (seg.status === 'done' && seg.audioBlob) {
          blobs.push(seg.audioBlob);
        }
      }
    }
    if (blobs.length === 0) return;
    const combined = new Blob(blobs, { type: 'audio/wav' });
    const safeName = (book.title || 'audiobook').replace(/[^\w\u4e00-\u9fff]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(combined, `${safeName}_${timestamp}.wav`);
  };

  if (!hasAudio) {
    return (
      <div className="text-center py-16">
        <Download className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{t('audiobook.export.noAudio')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('audiobook.export.format')}</h4>
        <div className="space-y-2">
          <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
            format === 'wav' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
          }`}>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="format"
                value="wav"
                checked={format === 'wav'}
                onChange={() => setFormat('wav')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{t('audiobook.export.wav')}</span>
            </div>
          </label>

          <label className={`flex items-center justify-between p-3 rounded-xl border cursor-not-allowed opacity-60 ${
            format === 'mp3' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50'
          }`}>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="format"
                value="mp3"
                disabled
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{t('audiobook.export.mp3')}</span>
            </div>
            <span className="flex items-center space-x-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Lock className="h-3 w-3" />
              <span>{t('audiobook.export.proRequired')}</span>
            </span>
          </label>

          <label className={`flex items-center justify-between p-3 rounded-xl border cursor-not-allowed opacity-60 ${
            format === 'ogg' ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50'
          }`}>
            <div className="flex items-center space-x-3">
              <input
                type="radio"
                name="format"
                value="ogg"
                disabled
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{t('audiobook.export.ogg')}</span>
            </div>
            <span className="flex items-center space-x-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Lock className="h-3 w-3" />
              <span>{t('audiobook.export.proRequired')}</span>
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">{t('audiobook.export.chapterMarkers')}</span>
          <button
            onClick={() => setIncludeMarkers(!includeMarkers)}
            className={`w-10 h-6 rounded-full transition-colors relative ${
              includeMarkers ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              includeMarkers ? 'left-[18px]' : 'left-0.5'
            }`} />
          </button>
        </div>

        <div>
          <label className="text-sm text-gray-700 block mb-2">{t('audiobook.export.quality')}</label>
          <div className="flex space-x-2">
            <button
              onClick={() => setQuality('standard')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                quality === 'standard'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('audiobook.export.standard')}
            </button>
            <button
              onClick={() => setQuality('high')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                quality === 'high'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('audiobook.export.high')}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {selectedChapterId && (
          <button
            onClick={handleExportChapter}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>{t('audiobook.export.exportChapter')}</span>
          </button>
        )}
        <button
          onClick={handleExportBook}
          className="w-full flex items-center justify-center space-x-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>{t('audiobook.export.exportBook')}</span>
        </button>
      </div>
    </div>
  );
}
