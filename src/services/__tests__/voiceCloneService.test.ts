import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the public interface by providing a mock provider
// This avoids network dependencies and tests the service facade logic

// Import types used by the service
import type { VoiceCloneProvider, SynthesisOptions, ClonedVoice } from '../voiceCloneService';

// Create a mock provider factory
function createMockProvider(): VoiceCloneProvider {
  return {
    cloneVoice: vi.fn().mockResolvedValue('mock-voice-id'),
    synthesize: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' })),
    deleteVoice: vi.fn().mockResolvedValue(undefined),
    listVoices: vi.fn().mockResolvedValue([
      { id: 'v1', name: 'Test Voice', language: 'en' },
    ] as ClonedVoice[]),
  };
}

const DEFAULT_OPTIONS: SynthesisOptions = {
  language: 'zh-CN',
  emotion: 'neutral',
  speed: 1.0,
  stability: 0.5,
  similarity: 0.75,
};

describe('VoiceCloneService', () => {
  // We need to re-import the singleton for each test to get fresh state
  // But since it's a singleton, we test it via setProvider

  it('should be importable', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    expect(voiceCloneService).toBeDefined();
  });

  it('should delegate cloneVoice to the active provider', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    const mock = createMockProvider();
    voiceCloneService.setProvider(mock);

    const blob = new Blob(['test'], { type: 'audio/wav' });
    const result = await voiceCloneService.cloneVoice(blob, 'My Voice');

    expect(result).toBe('mock-voice-id');
    expect(mock.cloneVoice).toHaveBeenCalledWith(blob, 'My Voice');
  });

  it('should delegate synthesize to the active provider', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    const mock = createMockProvider();
    voiceCloneService.setProvider(mock);

    const result = await voiceCloneService.synthesize('Hello', 'v1', DEFAULT_OPTIONS);

    expect(result).toBeInstanceOf(Blob);
    expect(mock.synthesize).toHaveBeenCalledWith('Hello', 'v1', DEFAULT_OPTIONS);
  });

  it('should delegate deleteVoice to the active provider', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    const mock = createMockProvider();
    voiceCloneService.setProvider(mock);

    await voiceCloneService.deleteVoice('v1');

    expect(mock.deleteVoice).toHaveBeenCalledWith('v1');
  });

  it('should delegate listVoices to the active provider', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    const mock = createMockProvider();
    voiceCloneService.setProvider(mock);

    const voices = await voiceCloneService.listVoices();

    expect(voices).toHaveLength(1);
    expect(voices[0].name).toBe('Test Voice');
  });

  it('should switch provider when setApiKey is called', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    // setApiKey switches to ElevenLabs internally
    voiceCloneService.setApiKey('test-key-123');
    expect(voiceCloneService.getApiKey()).toBe('test-key-123');
  });

  it('should switch to LocalTTSProvider when setLocalProvider is called', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    // Should not throw
    voiceCloneService.setLocalProvider('http://localhost:9999');
    expect(voiceCloneService.getApiKey()).toBe('test-key-123'); // key unchanged
  });

  it('should propagate provider errors', async () => {
    const { voiceCloneService } = await import('../voiceCloneService');
    const mock = createMockProvider();
    (mock.synthesize as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    voiceCloneService.setProvider(mock);

    await expect(
      voiceCloneService.synthesize('test', 'v1', DEFAULT_OPTIONS),
    ).rejects.toThrow('Network error');
  });
});
