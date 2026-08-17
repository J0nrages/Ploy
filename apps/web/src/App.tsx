import { useEffect, useState } from "react";
import { initializeRules } from "@ploy/rules";
import { LocalPlay } from "./LocalPlay";
import { OnlinePlay } from "./OnlinePlay";
import { RulesHelp } from "./RulesHelp";

type Screen = "menu" | "local" | "online" | "rules";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");

  useEffect(() => {
    void initializeRules()
      .then(() => setReady(true))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "failed to load rules");
      });
  }, []);

  if (!ready) {
    return (
      <main className="hud menu">
        <h1>Ploy</h1>
        <p>{error ?? "Loading the 1970 rules core…"}</p>
      </main>
    );
  }

  if (screen === "local") {
    return <LocalPlay onBack={() => setScreen("menu")} />;
  }

  if (screen === "online") {
    if (!convexUrl) {
      return (
        <main className="hud menu">
          <button type="button" className="ghost" onClick={() => setScreen("menu")}>
            ← Main menu
          </button>
          <h1>Online room</h1>
          <p>Set VITE_CONVEX_URL to open a live anonymous table. Local play stays available offline.</p>
        </main>
      );
    }
    return <OnlinePlay onBack={() => setScreen("menu")} />;
  }

  if (screen === "rules") {
    return (
      <main className="hud menu">
        <button type="button" className="ghost" onClick={() => setScreen("menu")}>
          ← Main menu
        </button>
        <RulesHelp />
      </main>
    );
  }

  return (
    <main className="hud menu">
      <p className="eyebrow">3M Bookshelf · 1970</p>
      <h1>Ploy</h1>
      <p className="lede">
        A strategy game of movement, rotation, and capture. Choose how you want to play.
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="menu-actions">
        <button type="button" className="primary menu-action" onClick={() => setScreen("local")}>
          <strong>Play locally</strong>
          <span>Start a new game or resume an auto-save</span>
        </button>
        <button type="button" className="menu-action" onClick={() => setScreen("online")}>
          <strong>Play online</strong>
          <span>Create or join an anonymous room</span>
        </button>
        <button type="button" className="menu-action" onClick={() => setScreen("rules")}>
          <strong>How to play</strong>
          <span>Rules, pieces, winning, and controls</span>
        </button>
      </div>
      <p className="hint">
        Local games work offline and save in this browser. No account is required.
      </p>
    </main>
  );
}
