import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAudiobook } from './AudiobookContext';
import { EMOTION_OPTIONS, ROLE_COLORS, generateId } from './audiobookUtils';
import type { EmotionType, VoiceRole } from '../../types';

export function RolesTab() {
  const { book, setBook, voicePrints, t } = useAudiobook();

  const updateRoles = (roles: VoiceRole[]) => {
    setBook({ ...book, roles, updatedAt: Date.now() });
  };

  const addRole = () => {
    const colorIdx = book.roles.length % ROLE_COLORS.length;
    const newRole: VoiceRole = {
      id: generateId(),
      name: `Role ${book.roles.length}`,
      voicePrintId: voicePrints[0]?.id || '',
      defaultEmotion: 'neutral',
      speedMultiplier: 1.0,
      color: ROLE_COLORS[colorIdx],
    };
    updateRoles([...book.roles, newRole]);
  };

  const updateRole = (id: string, updates: Partial<VoiceRole>) => {
    updateRoles(book.roles.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteRole = (id: string) => {
    if (id === book.defaultNarratorId) return;
    updateRoles(book.roles.filter(r => r.id !== id));
  };

  const emotionLabel = (emotion: EmotionType): string => {
    return t(`speak.emotion${emotion.charAt(0).toUpperCase() + emotion.slice(1)}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{t('audiobook.roles.title')}</h3>
        <button
          onClick={addRole}
          className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>{t('audiobook.roles.addRole')}</span>
        </button>
      </div>

      <div className="space-y-3">
        {book.roles.map((role) => {
          const isNarrator = role.id === book.defaultNarratorId;
          return (
            <div key={role.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: role.color }}
                  />
                  {isNarrator ? (
                    <span className="text-sm font-semibold text-gray-800">{t('audiobook.roles.narrator')}</span>
                  ) : (
                    <input
                      type="text"
                      value={role.name}
                      onChange={(e) => updateRole(role.id, { name: e.target.value })}
                      className="text-sm font-semibold text-gray-800 border-none focus:outline-none bg-transparent w-32"
                      placeholder={t('audiobook.roles.roleName')}
                    />
                  )}
                </div>
                {!isNarrator && (
                  <button
                    onClick={() => deleteRole(role.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title={t('audiobook.roles.deleteRole')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('audiobook.roles.voiceprint')}</label>
                <select
                  value={role.voicePrintId}
                  onChange={(e) => updateRole(role.id, { voicePrintId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {voicePrints.map(vp => (
                    <option key={vp.id} value={vp.id}>{vp.name} ({vp.averagePitch} Hz)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('audiobook.roles.emotion')}</label>
                <select
                  value={role.defaultEmotion}
                  onChange={(e) => updateRole(role.id, { defaultEmotion: e.target.value as EmotionType })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {EMOTION_OPTIONS.map(em => (
                    <option key={em} value={em}>{emotionLabel(em)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  {t('audiobook.roles.speed')}: {role.speedMultiplier.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={role.speedMultiplier}
                  onChange={(e) => updateRole(role.id, { speedMultiplier: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0.5x</span>
                  <span>2.0x</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('audiobook.roles.color')}</label>
                <div className="flex space-x-2">
                  {ROLE_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => updateRole(role.id, { color })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        role.color === color ? 'border-gray-800 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
