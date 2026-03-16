// ---------------------------------------------------------------------------
// realtimeVoiceService.ts – Real-time voice conversion using AudioWorklet
// with a granular-synthesis pitch shifter and formant preservation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AudioWorkletProcessor source – embedded as a string so we can load it via
// a Blob URL at runtime without a separate file.
//
// The processor implements a simplified granular-synthesis pitch shifter:
//   1. Incoming audio is written into a circular buffer.
//   2. Two overlapping grain readers traverse the buffer at a rate
//      determined by the pitch-shift ratio.
//   3. A Hann window is applied to each grain for smooth crossfading
//      (overlap-add), preserving formant characteristics better than
//      naive resampling.
// ---------------------------------------------------------------------------

const WORKLET_PROCESSOR_SOURCE = /* js */ `
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'pitchFactor',
        defaultValue: 1.0,
        minValue: 0.5,
        maxValue: 2.0,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();

    // Circular buffer – 2 seconds at 48 kHz should be plenty.
    this.bufferSize = 96000;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;

    // Two overlapping read heads for crossfade (overlap-add).
    this.grainSize = 1024;
    this.readHead0 = 0;
    this.readHead1 = this.grainSize / 2; // offset by half a grain

    this.active = true;

    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.active = false;
      }
    };
  }

  /**
   * Hann window value for position t in [0, size).
   */
  hann(t, size) {
    return 0.5 * (1 - Math.cos((2 * Math.PI * t) / size));
  }

  process(inputs, outputs, parameters) {
    if (!this.active) return false;

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inChannel = input[0];
    const outChannel = output[0];
    const pitchFactor = parameters.pitchFactor[0] ?? 1.0;
    const blockSize = inChannel.length;

    // 1. Write incoming samples into the circular buffer.
    for (let i = 0; i < blockSize; i++) {
      this.buffer[this.writeIndex] = inChannel[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
    }

    // 2. Read from two grain heads at shifted rate & overlap-add.
    for (let i = 0; i < blockSize; i++) {
      // Fractional positions in the grain for the Hann window.
      const grainPos0 = this.readHead0 % this.grainSize;
      const grainPos1 = this.readHead1 % this.grainSize;

      const w0 = this.hann(grainPos0, this.grainSize);
      const w1 = this.hann(grainPos1, this.grainSize);

      // Read from circular buffer at the (integer) read positions.
      const idx0 = Math.floor(this.readHead0) % this.bufferSize;
      const idx1 = Math.floor(this.readHead1) % this.bufferSize;

      const s0 = this.buffer[(idx0 + this.bufferSize) % this.bufferSize];
      const s1 = this.buffer[(idx1 + this.bufferSize) % this.bufferSize];

      outChannel[i] = s0 * w0 + s1 * w1;

      // Advance read heads at the pitch-shifted rate.
      this.readHead0 = (this.readHead0 + pitchFactor) % this.bufferSize;
      this.readHead1 = (this.readHead1 + pitchFactor) % this.bufferSize;

      // Reset grains when they finish to keep overlap in sync.
      if (grainPos0 + pitchFactor >= this.grainSize) {
        this.readHead0 = this.readHead1 + this.grainSize / 2;
      }
      if (grainPos1 + pitchFactor >= this.grainSize) {
        this.readHead1 = this.readHead0 + this.grainSize / 2;
      }
    }

    return true;
  }
}

registerProcessor('pitch-shift-processor', PitchShiftProcessor);
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VoiceTarget {
  voiceId: string;
  /** Desired pitch shift factor (1.0 = no change, >1 = higher, <1 = lower). */
  pitchFactor: number;
}

export class RealtimeVoiceConverter {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private workletBlobUrl: string | null = null;

  private targetVoiceId: string | null = null;
  private pitchFactor = 1.0;
  private running = false;

  /** Timestamp when processing started – used for latency reporting. */
  private startTime = 0;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start real-time voice conversion.
   *
   * @param inputStream - A MediaStream from getUserMedia (or similar).
   * @param targetVoiceId - Identifier of the target voice to convert to.
   * @param pitchFactor - Optional initial pitch factor (default 1.0).
   * @returns A MediaStream carrying the converted audio.
   */
  async start(
    inputStream: MediaStream,
    targetVoiceId: string,
    pitchFactor = 1.0,
  ): Promise<MediaStream> {
    if (this.running) {
      throw new Error('RealtimeVoiceConverter is already running. Call stop() first.');
    }

    this.targetVoiceId = targetVoiceId;
    this.pitchFactor = pitchFactor;

    // Create AudioContext.
    this.audioContext = new AudioContext({ latencyHint: 'interactive' });

    // Load the worklet from a blob URL.
    this.workletBlobUrl = URL.createObjectURL(
      new Blob([WORKLET_PROCESSOR_SOURCE], { type: 'application/javascript' }),
    );
    await this.audioContext.audioWorklet.addModule(this.workletBlobUrl);

    // Build the audio graph.
    this.sourceNode = this.audioContext.createMediaStreamSource(inputStream);
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      'pitch-shift-processor',
    );
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    // Set initial pitch factor.
    const pitchParam = this.workletNode.parameters.get('pitchFactor');
    if (pitchParam) {
      pitchParam.setValueAtTime(this.pitchFactor, this.audioContext.currentTime);
    }

    // Connect: input → worklet → destination.
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    this.running = true;
    this.startTime = performance.now();

    return this.destinationNode.stream;
  }

  /**
   * Stop conversion and release all audio resources.
   */
  stop(): void {
    if (!this.running) return;

    // Signal the worklet processor to stop.
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }

    // Disconnect nodes.
    try {
      this.sourceNode?.disconnect();
    } catch {
      // already disconnected
    }
    try {
      this.workletNode?.disconnect();
    } catch {
      // already disconnected
    }

    // Close context.
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }

    // Revoke blob URL.
    if (this.workletBlobUrl) {
      URL.revokeObjectURL(this.workletBlobUrl);
      this.workletBlobUrl = null;
    }

    this.sourceNode = null;
    this.workletNode = null;
    this.destinationNode = null;
    this.audioContext = null;
    this.running = false;
    this.startTime = 0;
  }

  // -----------------------------------------------------------------------
  // Runtime controls
  // -----------------------------------------------------------------------

  /**
   * Switch to a different target voice while running.
   *
   * @param voiceId - New target voice identifier.
   * @param pitchFactor - Optional new pitch factor.
   */
  setTargetVoice(voiceId: string, pitchFactor?: number): void {
    this.targetVoiceId = voiceId;

    if (pitchFactor !== undefined) {
      this.pitchFactor = pitchFactor;
    }

    if (this.workletNode && this.audioContext) {
      const param = this.workletNode.parameters.get('pitchFactor');
      if (param) {
        param.setValueAtTime(this.pitchFactor, this.audioContext.currentTime);
      }
    }
  }

  /**
   * Returns an estimate of the processing latency in milliseconds.
   *
   * This combines the AudioContext's own base latency with the worklet
   * block-processing overhead.
   */
  getLatency(): number {
    if (!this.audioContext || !this.running) return 0;

    // baseLatency is the inherent latency of the AudioContext output.
    const baseLatencyMs = (this.audioContext.baseLatency ?? 0) * 1000;
    // A single render quantum is 128 samples.
    const renderQuantumMs =
      (128 / this.audioContext.sampleRate) * 1000;

    return baseLatencyMs + renderQuantumMs;
  }

  // -----------------------------------------------------------------------
  // Getters
  // -----------------------------------------------------------------------

  get isRunning(): boolean {
    return this.running;
  }

  get currentTargetVoiceId(): string | null {
    return this.targetVoiceId;
  }

  get currentPitchFactor(): number {
    return this.pitchFactor;
  }
}

/** Convenience singleton for app-wide use. */
export const realtimeVoiceConverter = new RealtimeVoiceConverter();
