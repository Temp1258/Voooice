# Voooice: Voice-to-Doc

**Voooice** is a sample web app that records audio from your microphone, processes it into text, and displays or downloads the transcript. It’s intended as a starting point for building a production-ready, offline speech-to-text solution—no cloud required.

---

## 1. What This Is

- **React + TypeScript** app built with [Vite](https://vitejs.dev/).  
- **Tailwind CSS** for styling, **lucide-react** for icons.  
- **Offline-oriented**: designed so you can integrate with local STT libraries (like [Vosk](https://github.com/alphacep/vosk-api)) instead of a cloud service.

By default, the app only has a **simulated** transcription function. You’ll replace it with a real, on-premise STT solution to obtain live transcripts from your microphone recordings.

---

## 2. How to Use This

### A. Basic Setup

1. **Install Node.js** (v16+ or v18+ recommended).  
2. **Clone this repository** (or download the ZIP) and open a terminal in the project directory.  
3. Run:
   ```bash
   npm install
   npm run dev
