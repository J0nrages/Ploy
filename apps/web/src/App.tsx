import { useEffect, useState } from "react";
import { initializeRules } from "@ploy/rules";
import { LocalPlay } from "./LocalPlay";
import { RulesHelp } from "./RulesHelp";

type Screen = "menu" | "local" | "rules";

const OFFICIAL_ONLINE_URL = "https://jonathanrdaniels.com/ploy";

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
        <button
          type="button"
          className="menu-action"
          onClick={() => window.location.assign(OFFICIAL_ONLINE_URL)}
        >
          <strong>Play online</strong>
          <span>Open the official hosted game</span>
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
