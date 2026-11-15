import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-ext-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/outfit/latin-ext-500.css";
import "@fontsource/outfit/latin-600.css";
import "@fontsource/outfit/latin-ext-600.css";
import "@fontsource/outfit/latin-700.css";
import "@fontsource/outfit/latin-ext-700.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-ext-600.css";
import "@fontsource/fraunces/latin-700.css";
import "@fontsource/fraunces/latin-ext-700.css";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
