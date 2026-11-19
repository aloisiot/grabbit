import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

async function start() {
  // `npm run dev` in a plain browser: fake the Rust backend (see src/dev/mock.ts).
  // This branch is removed from production builds.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    (await import("./dev/mock")).installMocks();
  }
  // Imported after the mocks so stores subscribe to (mocked) events.
  const { default: App } = await import("./App");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
