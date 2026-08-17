import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const tree = (
  <StrictMode>
    <App />
  </StrictMode>
);

createRoot(root).render(
  convexUrl ? <ConvexProvider client={new ConvexReactClient(convexUrl)}>{tree}</ConvexProvider> : tree,
);
