# 🛡️ Raksha — Real-Time On-Device Scam Shield

**Live Demo**: [https://raksha-eight-alpha.vercel.app/](https://raksha-eight-alpha.vercel.app/)

Raksha is a real-time, privacy-first, on-device AI scam detection system. It protects vulnerable users from complex cybercrimes—such as "Digital Arrests", KYC fraud, and Voice Cloning scams—without compromising user privacy. By running powerful edge AI models entirely in the browser, Raksha ensures that sensitive phone call audio **never** leaves the device.

## 🚀 Key Features

- **Zero-Cloud Privacy:** By utilizing WebGPU and WebAssembly, Raksha processes live microphone data securely on your local device. 
- **Real-Time Whisper ASR:** Transcribes Hindi, English, and Hinglish instantly on the edge.
- **Voice-Clone Detection:** Analyzes incoming audio streams heuristically to identify synthetic speech artifacts or cloned voices.
- **Agentic Threat Analysis:** Employs a sophisticated LangGraph-based workflow to evaluate risk signals (urgency, authority impersonation, financial coercion) in real-time.
- **RAG-Powered Advisories:** Retrieves context from official Indian Cybercrime advisories to provide victims with exact explanations of the playbook being used against them.
- **Offline Reasoner (WebLLM):** In the event of a network outage, Raksha seamlessly switches to an on-device Gemma-2B-IT large language model via WebGPU to perform complex reasoning entirely offline.

## 🛠️ Technology Stack

- **Frontend:** React, Vite, TailwindCSS, Zustand (State), XState (Call Lifecycle)
- **Edge AI / WebGPU:** 
  - `@huggingface/transformers` (Whisper-tiny, Multilingual-e5-small, Wav2vec2)
  - `@mlc-ai/web-llm` (Gemma-2B-IT for offline reasoning)
- **Backend (Tier-2 Cloud Reasoner):** Node.js, Express, Socket.IO
- **Agentic Orchestration:** LangChain, LangGraph

## 💻 Running Locally

### Prerequisites
- Node.js (v20+)
- Git

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/Ankit-blip737/hackathon-project.git
   cd hackathon-project
   ```

2. **Start the Backend**
   The backend handles the Tier-2 Cloud Reasoner and LangGraph pipeline.
   ```bash
   cd backend
   npm install
   npm start
   ```
   *The backend will run on `http://localhost:4000`.*

3. **Start the Frontend**
   Open a new terminal window:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   *The application will be accessible at `http://localhost:5173`.*

## 🔒 Security & Privacy Architecture

Unlike traditional cloud-based call scanners, Raksha uses a two-tier privacy architecture:
1. **Tier-1 (Local Edge):** Audio is transcribed via Whisper and analyzed by a local sentence-embedding model to extract threat signals. If the threat is below a certain threshold, the data is discarded.
2. **Tier-2 (Offline/Cloud):** For high-risk calls, the extracted textual signals (never the audio) are passed to an LLM reasoner for complex multi-step evaluation. Users can toggle "Offline Mode" to run this reasoner locally via WebLLM, ensuring absolute zero-trust privacy.

## 🏆 Hackathon Submission

This project was built over 48 hours for our hackathon submission. It addresses the critical gap in consumer protection against sophisticated, highly-targeted AI scams by providing a scalable, localized, and open-source solution.
