# Mount Pinatubo Museum Interactive Kiosk

An interactive multimedia kiosk application for the Mount Pinatubo 1991 Eruption Exhibit. Built with **Angular**, **Three.js**, and an optional **Gemini AI** proxy service.

---

## 🚀 Quick Start

### 1. Clone or Download the Project

```bash
git clone https://github.com/canlasebastian/mtpinatubo_kiosk.git
cd mtpinatubo_kiosk
```

### 2. Install Dependencies

```bash
npm install
```

> **Note:** This automatically installs both the Angular frontend dependencies and the backend server dependencies in one step.

### 3. Configure the AI Guide (Required for AI chatbot, optional otherwise)

The kiosk's interactive exhibits, 3D simulations, and historical archives work **100% offline** without any configuration.

To enable the **Apo Namalyari AI Guide** chatbot, create a `.env` file in the **project root**:

```bash
# Windows (Command Prompt)
copy .env.example .env

# Windows (PowerShell) / macOS / Linux
cp .env.example .env
```

Then open `.env` and fill in your key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
PORT=3001
```

> Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

### 4. Run the Application

```bash
npm run dev
```

- Angular frontend → **`http://localhost:4200`**
- AI proxy server → **`http://localhost:3001`**

---

## 🛠️ Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs both the Angular frontend (`localhost:4200`) and the AI server proxy (`localhost:3001`) concurrently. |
| `npm start` | Runs only the Angular frontend with live-reload. |
| `npm run build` | Compiles and builds the production bundles into `dist/pinatubo-museum`. |
| `npm run test` | Runs unit test suites via Vitest. |

---

## 🌟 Exhibit Features

- **3D Volcanic Simulator:** Real-time Three.js visualization of the eruption stages and geological changes.
- **Lahar Defense Simulation:** Interactive educational experience demonstrating lahar flow mitigation and impact.
- **Historical Gallery & Audio Archive:** Multimedia records, documentary clips, historical photos, and local accounts.
- **Apo Namalyari AI Guide:** Curated conversational AI grounded in historical archives and museum research.

---

## 👥 Credits & Authors

- **Created by:** Friench Ocampo & Sebastian Canlas
- **Historical References:**
  - *Fire and Mud: Eruptions and Lahars of Mount Pinatubo, Philippines* (USGS / PHIVOLCS)
  - *Pinatubo: The Saga of the Philippines' Forgotten Giant*
  - Holy Angel University (HAU) Pinatubo Museum Timeline Exhibit
