import { useState, useEffect, useRef, useCallback } from "react";
import "./TapFlash.css";

// ── Constants ────────────────────────────────────────────────
const COLORS = [
  "#FF6B6B", "#FF9F43", "#FECA57", "#48DBFB",
  "#FF9FF3", "#54A0FF", "#7C6AF4", "#00D2D3",
  "#1DD1A1", "#FF85A1",
];
const PERFECT_THRESHOLD = 200;
const POINTS_PER_LEVEL = 5;

// ── Helpers ──────────────────────────────────────────────────
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scoreToLevel(score) {
  return Math.floor(score / POINTS_PER_LEVEL) + 1;
}

function getDifficulty(score) {
  // Smooth exponential-ish curve: delay 2000→380ms, visible 2200→520ms
  const t = Math.min(score / 40, 1); // saturates at score 40
  const delay = Math.round(2000 - t * 1620);
  const visible = Math.round(2200 - t * 1680);
  return { delay: Math.max(delay, 380), visible: Math.max(visible, 520) };
}

function fmt(ms) {
  return ms != null ? `${ms} ms` : "—";
}

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case "hit":
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
        break;
      case "perfect":
        osc.frequency.setValueAtTime(680, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1020, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.28);
        break;
      case "levelup": {
        const osc2 = ctx.createOscillator();
        osc2.connect(gain);
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.35);
        break;
      }
      case "miss":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(280, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.16, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case "early":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        break;
    }
  } catch (_) {}
}

// ── Sub-components ────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div className={`tf-stat-card ${accent ? "tf-stat-card--accent" : ""}`}>
      <span className="tf-stat-val">{value}</span>
      <span className="tf-stat-label">{label}</span>
    </div>
  );
}

function LevelUpToast({ message }) {
  return (
    <div className="tf-levelup-toast" key={message}>
      <span className="tf-levelup-icon">⚡</span>
      {message}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function TapFlash() {
  // Game state
  const [gameState, setGameState] = useState("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(
    () => parseInt(localStorage.getItem("tapflash_hs") || "0", 10)
  );

  // Shape
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [color, setColor] = useState(COLORS[0]);
  const [animKey, setAnimKey] = useState(0);
  const [clickedKey, setClickedKey] = useState(null);

  // Reaction stats
  const [reactionTimes, setReactionTimes] = useState([]);
  const [lastReaction, setLastReaction] = useState(null);
  const [isPerfect, setIsPerfect] = useState(false);
  const [bestRT, setBestRT] = useState(() => {
    const v = localStorage.getItem("tapflash_brt");
    return v ? parseInt(v, 10) : null;
  });

  // Progression
  const [levelUpMsg, setLevelUpMsg] = useState(null);
  const [earlyWarning, setEarlyWarning] = useState(false);

  // Share
  const [shareFeedback, setShareFeedback] = useState(null);

  const appearTimeRef = useRef(null);
  const waitTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const levelUpTimerRef = useRef(null);
  const areaRef = useRef(null);

  const level = scoreToLevel(score);

  const clearTimers = useCallback(() => {
    clearTimeout(waitTimerRef.current);
    clearTimeout(hideTimerRef.current);
  }, []);

  const spawnShape = useCallback((currentScore) => {
    clearTimers();
    const { delay, visible } = getDifficulty(currentScore);

    waitTimerRef.current = setTimeout(() => {
      const areaEl = areaRef.current;
      const padding = 60;
      const w = areaEl ? areaEl.clientWidth : 400;
      const h = areaEl ? areaEl.clientHeight : 400;

      setPosition({
        x: getRandomInt(padding, w - padding),
        y: getRandomInt(padding, h - padding),
      });
      setColor(COLORS[getRandomInt(0, COLORS.length - 1)]);
      setAnimKey((k) => k + 1);
      setGameState("active");
      appearTimeRef.current = performance.now();

      hideTimerRef.current = setTimeout(() => {
        setGameState("gameover");
        playSound("miss");
        setLastReaction(null);
        setIsPerfect(false);
      }, visible);
    }, delay);
  }, [clearTimers]);

  const startGame = useCallback(() => {
    clearTimers();
    clearTimeout(levelUpTimerRef.current);
    setScore(0);
    setReactionTimes([]);
    setLastReaction(null);
    setIsPerfect(false);
    setEarlyWarning(false);
    setLevelUpMsg(null);
    setShareFeedback(null);
    setGameState("waiting");
    spawnShape(0);
  }, [clearTimers, spawnShape]);

  const handleAreaClick = useCallback(() => {
    if (gameState !== "waiting") return;
    clearTimers();
    playSound("early");
    setEarlyWarning(true);
    setTimeout(() => {
      setEarlyWarning(false);
      setGameState("waiting");
      spawnShape(score);
    }, 900);
  }, [gameState, clearTimers, score, spawnShape]);

  const handleShapeClick = useCallback((e) => {
    e.stopPropagation();
    if (gameState !== "active") return;

    clearTimers();
    const rt = Math.round(performance.now() - appearTimeRef.current);
    const perfect = rt < PERFECT_THRESHOLD;

    setClickedKey(animKey);
    setLastReaction(rt);
    setIsPerfect(perfect);
    playSound(perfect ? "perfect" : "hit");

    setReactionTimes((prev) => [...prev, rt]);

    if (bestRT === null || rt < bestRT) {
      setBestRT(rt);
      localStorage.setItem("tapflash_brt", String(rt));
    }

    const newScore = score + 1;
    setScore(newScore);

    if (newScore > highScore) {
      setHighScore(newScore);
      localStorage.setItem("tapflash_hs", String(newScore));
    }

    // Level up?
    if (newScore % POINTS_PER_LEVEL === 0) {
      const newLevel = scoreToLevel(newScore);
      clearTimeout(levelUpTimerRef.current);
      setLevelUpMsg(`Level ${newLevel} — Speed Up!`);
      playSound("levelup");
      levelUpTimerRef.current = setTimeout(() => setLevelUpMsg(null), 2200);
    }

    setGameState("waiting");
    spawnShape(newScore);
  }, [gameState, clearTimers, animKey, score, highScore, bestRT, spawnShape]);

  const handleShare = useCallback(async () => {
    const avgDisplay = reactionTimes.length > 0
      ? fmt(Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length))
      : "N/A";
    const text = `I scored ${score} on TapFlash with an avg reaction time of ${avgDisplay}. Can you beat me? 🎯`;
    try {
      await navigator.clipboard.writeText(text);
      setShareFeedback("Copied to clipboard!");
    } catch {
      setShareFeedback("Copy: " + text);
    }
    setTimeout(() => setShareFeedback(null), 3000);
  }, [score, reactionTimes]);

  useEffect(() => () => {
    clearTimers();
    clearTimeout(levelUpTimerRef.current);
  }, [clearTimers]);

  // Derived stats
  const avgRT = reactionTimes.length > 0
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : null;
  const sessionBestRT = reactionTimes.length > 0 ? Math.min(...reactionTimes) : null;
  const accuracy = score > 0 ? Math.round((score / (score + 1)) * 100) : null;
  const { visible: visibleMs } = getDifficulty(score);
  const isNewHS = score > 0 && score >= highScore;

  return (
    <div className="tf-root">
      {/* ── Header ── */}
      <header className="tf-header">
        <h1 className="tf-logo">Tap<span>Flash</span></h1>

        <div className="tf-header-center">
          {(gameState === "waiting" || gameState === "active") && (
            <div className="tf-level-badge">
              <span className="tf-level-label">LVL</span>
              <span className="tf-level-num">{level}</span>
            </div>
          )}
        </div>

        <div className="tf-scores">
          <div className="tf-score-box">
            <span className="tf-score-label">Score</span>
            <span className="tf-score-val">{score}</span>
          </div>
          <div className="tf-score-divider" />
          <div className="tf-score-box">
            <span className="tf-score-label">Best</span>
            <span className="tf-score-val">{highScore}</span>
          </div>
        </div>
      </header>

      <main className="tf-main">
        {/* ── Level-up toast (outside play area) ── */}
        {levelUpMsg && <LevelUpToast message={levelUpMsg} />}

        {/* ── Play area ── */}
        <div
          ref={areaRef}
          className={`tf-area ${gameState === "idle" || gameState === "gameover" ? "tf-area--dim" : ""}`}
          onClick={handleAreaClick}
        >
          {/* Idle overlay */}
          {gameState === "idle" && (
            <div className="tf-overlay tf-overlay--fade">
              <div className="tf-idle-icon">🎯</div>
              <p className="tf-tagline">Click the circle before it vanishes</p>
              <button className="tf-btn" onClick={(e) => { e.stopPropagation(); startGame(); }}>
                Start Game
              </button>
            </div>
          )}

          {/* Game over overlay */}
          {gameState === "gameover" && (
            <div className="tf-overlay tf-overlay--fade tf-gameover">
              <h2 className="tf-go-title">Game Over</h2>

              <div className="tf-final-score-wrap">
                {isNewHS && <span className="tf-new-hs">New Best!</span>}
                <p className="tf-final-score">{score}</p>
                <p className="tf-final-label">points</p>
              </div>

              <div className="tf-stats-grid">
                <StatCard label="Avg RT" value={fmt(avgRT)} />
                <StatCard label="Best RT" value={fmt(sessionBestRT)} accent />
                <StatCard label="Accuracy" value={accuracy != null ? `${accuracy}%` : "—"} />
                <StatCard label="Level" value={level} />
              </div>

              {shareFeedback ? (
                <p className="tf-share-feedback">{shareFeedback}</p>
              ) : (
                <div className="tf-go-actions">
                  <button className="tf-btn" onClick={(e) => { e.stopPropagation(); startGame(); }}>
                    Try Again
                  </button>
                  <button className="tf-btn tf-btn--ghost" onClick={(e) => { e.stopPropagation(); handleShare(); }}>
                    Share Score
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Early warning */}
          {earlyWarning && (
            <div className="tf-warning">Too early!</div>
          )}

          {/* Shape */}
          {gameState === "active" && (
            <div
              key={animKey}
              className={`tf-shape ${clickedKey === animKey ? "tf-shape--clicked" : ""}`}
              onClick={handleShapeClick}
              style={{
                left: position.x,
                top: position.y,
                backgroundColor: color,
                "--visible-ms": `${visibleMs}ms`,
                "--shape-color": color,
              }}
            />
          )}

          {/* Reaction badge */}
          {lastReaction !== null && gameState === "waiting" && (
            <div className={`tf-rt-badge ${isPerfect ? "tf-rt-badge--perfect" : ""}`}>
              {isPerfect && <span className="tf-perfect-label">PERFECT </span>}
              {lastReaction} ms
            </div>
          )}
        </div>

        {/* Status hint */}
        <p className="tf-hint">
          {gameState === "waiting" && "Get ready…"}
          {gameState === "active" && "Click it!"}
        </p>
      </main>
    </div>
  );
}
