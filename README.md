# Mount Pinatubo Museum Interactive Kiosk

An interactive multimedia kiosk application for the Mount Pinatubo 1991 Eruption Exhibit. Built with **Angular**, **Three.js**, and an optional **Gemini AI** proxy service.

---

## 🚀 Quick Start (Running from Downloaded ZIP)

If you downloaded this project as a ZIP from GitHub:

### 1. Extract the ZIP
Extract the downloaded ZIP archive into any folder on your computer.

### 2. Install Dependencies
Open a terminal in the project directory and run:

```bash
npm install
```
> **Note:** The `postinstall` script automatically installs both the Angular kiosk dependencies and the server proxy dependencies.

### 3. (Optional) Configure Gemini AI Guide
The kiosk's interactive exhibits, 3D simulations, and historical archives work **100% offline out-of-the-box**.

If you wish to enable the **Apo Namalyari AI Guide** chatbot:
1. In the `server/` directory, make a copy of `.env.example` named `.env`:
   ```bash
   cp server/.env.example server/.env
   ```
2. Open `server/.env` in any text editor and add your Google Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key
   PORT=3001
   ```

### 4. Run the Application
To run both the Angular kiosk frontend and the server proxy concurrently:

```bash
npm run dev
```

Once started:
- Open your browser to **`http://localhost:4200`** to view the kiosk.
- The server proxy runs in the background at **`http://localhost:3001`**.

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
