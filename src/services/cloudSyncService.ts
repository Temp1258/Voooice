import type { VoicePrint, CloudSyncStatus } from '../types';
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  uploaded: string[];
  downloaded: string[];
  conflicts: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Cloud sync service
// ---------------------------------------------------------------------------

const VOICEPRINTS_API = '/api/voiceprints';
const AUDIO_API = '/api/audio';

export class CloudSyncService {
  /**
   * Synchronize local voiceprints with the server.
   * Conflict resolution: server wins by default, unless the local version
   * has a strictly newer createdAt timestamp.
   */
  async syncVoicePrints(localPrints: VoicePrint[], token: string): Promise<SyncResult> {
    const result: SyncResult = { uploaded: [], downloaded: [], conflicts: [], errors: [] };

    try {
      const remotePrints = await this.getRemoteVoicePrints(token);
      const remoteMap = new Map(remotePrints.map(vp => [vp.id, vp]));
      const localMap = new Map(localPrints.map(vp => [vp.id, vp]));

      // Upload local-only prints
      for (const local of localPrints) {
        const remote = remoteMap.get(local.id);
        if (!remote) {
          // Exists only locally -> upload
          try {
            await this.uploadVoicePrint(local, token);
            result.uploaded.push(local.id);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`Upload ${local.id}: ${msg}`);
          }
        } else if (local.createdAt !== remote.createdAt) {
          // Both exist but differ -> conflict
          // Server wins by default; if local is strictly newer, upload it
          if (local.createdAt > remote.createdAt) {
            try {
              await this.uploadVoicePrint(local, token);
              result.uploaded.push(local.id);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              result.errors.push(`Conflict-upload ${local.id}: ${msg}`);
            }
          } else {
            // Server version wins
            result.conflicts.push(local.id);
          }
        }
        // If timestamps match, they are in sync – nothing to do.
      }

      // Download remote-only prints
      for (const remote of remotePrints) {
        if (!localMap.has(remote.id)) {
          result.downloaded.push(remote.id);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
    }

    return result;
  }

  /**
   * Upload a single voiceprint's metadata to the server.
   */
  async uploadVoicePrint(voiceprint: VoicePrint, token: string): Promise<void> {
    const res = await fetch(VOICEPRINTS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(voiceprint),
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  }

  /**
   * Upload raw audio for a voiceprint. Returns the remote URL of the stored file.
   */
  async uploadAudio(voicePrintId: string, audioBlob: Blob, token: string): Promise<string> {
    const form = new FormData();
    form.append('audio', audioBlob, 'audio.wav');

    const res = await fetch(`${AUDIO_API}/${voicePrintId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Audio upload failed: ${res.status}`);
    const data = (await res.json()) as { url: string };
    return data.url;
  }

  /**
   * Download raw audio for a voiceprint from the server.
   */
  async downloadAudio(voicePrintId: string, token: string): Promise<Blob> {
    const res = await fetch(`${AUDIO_API}/${voicePrintId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Audio download failed: ${res.status}`);
    return res.blob();
  }

  /**
   * Fetch all voiceprint metadata from the server.
   */
  async getRemoteVoicePrints(token: string): Promise<VoicePrint[]> {
    const res = await fetch(VOICEPRINTS_API, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Fetch voiceprints failed: ${res.status}`);
    return res.json();
  }
}

// ---------------------------------------------------------------------------
// React context + hook
// ---------------------------------------------------------------------------

interface CloudSyncContextValue {
  status: CloudSyncStatus;
  triggerSync: (localPrints?: VoicePrint[]) => Promise<SyncResult | null>;
}

const CloudSyncContext = createContext<CloudSyncContextValue | null>(null);

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CloudSyncStatus>({
    lastSynced: null,
    syncing: false,
    error: null,
  });

  const service = useMemo(() => new CloudSyncService(), []);

  const triggerSync = useCallback(
    async (localPrints: VoicePrint[] = []): Promise<SyncResult | null> => {
      const token = localStorage.getItem('vocaltext_token');
      if (!token || token === 'local') return null;

      setStatus(prev => ({ ...prev, syncing: true, error: null }));
      try {
        const result = await service.syncVoicePrints(localPrints, token);
        setStatus({ lastSynced: Date.now(), syncing: false, error: null });
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(prev => ({ ...prev, syncing: false, error: msg }));
        return null;
      }
    },
    [service],
  );

  const value = useMemo(() => ({ status, triggerSync }), [status, triggerSync]);

  return React.createElement(CloudSyncContext.Provider, { value }, children);
}

export function useCloudSync(): CloudSyncContextValue {
  const ctx = useContext(CloudSyncContext);
  if (!ctx) throw new Error('useCloudSync must be used within CloudSyncProvider');
  return ctx;
}
