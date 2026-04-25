import { useState, useEffect, useRef, useCallback } from "react";
import "./TapFlash.css";

const COLORS = [
  "#FF6B6B", "#FF9F43", "#FECA57", "#48DBFB",
  "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3",
  "#1DD1A1", "#C8D6E5",
];

const PERFECT_THRESHOLD = 200; // ms

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDifficulty(score) {
  // Delay before shape appears: 2000ms → 400ms
  const delay = Math.max(400, 2000 - score * 120);
  // How long shape stays visible: 2200ms → 550ms
  const visible = Math.max(550, 2200 - score * 110);
  return { delay, visible };
}

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "hit") {
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } else if (type === "perfect") {
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1020, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === "miss") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "early") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (_) {
    // Audio not available — silent fallback
  }
}

export default function TapFlash() {
  const [gameState, setGameState] = useState("idle"); // idle | waiting | active | gameover
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(
    () => parseInt(localStorage.getItem("tapflash_hs") || "0", 10)
  );
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [color, setColor] = useState(COLORS[0]);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [lastReaction, setLastReaction] = useState(null);
  const [isPerfect, setIsPerfect] = useState(false);
  const [earlyWarning, setEarlyWarning] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  const appearTimeRef = useRef(null);
  const waitTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const areaRef = useRef(null);

  const clearTimers = useCallback(() => {
    clearTimeout(waitTimerRef.current);
    clearTimeout(hideTimerRef.current);
  }, []);

  const spawnShape = useCallback((currentScore) => {
    clearTimers();
    const { delay, visible } = getDifficulty(currentScore);

    waitTimerRef.current = setTimeout(() => {
      // Pick random position — keep shape fully within area
      const areaEl = areaRef.current;
      const padding = 60; // half shape size + margin
      const w = areaEl ? areaEl.clientWidth : 400;
      const h = areaEl ? areaEl.clientHeight : 400;
      const x = getRandomInt(padding, w - padding);
      const y = getRandomInt(padding, h - padding);

      setPosition({ x, y });
      setColor(COLORS[getRandomInt(0, COLORS.length - 1)]);
      setAnimKey((k) => k + 1);
      setGameState("active");
      appearTimeRef.current = performance.now();

      // Auto-miss if not clicked in time
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
    setScore(0);
    setReactionTimes([]);
    setLastReaction(null);
    setIsPerfect(false);
    setEarlyWarning(false);
    setGameState("waiting");
    spawnShape(0);
  }, [clearTimers, spawnShape]);

  const handleAreaClick = useCallback(() => {
    if (gameState !== "waiting") return;
    // Clicked background before shape appeared
    clearTimers();
    playSound("early");
    setEarlyWarning(true);
    setTimeout(() => {
      setEarlyWarning(false);
      setGameState("waiting");
      spawnShape(score);
    }, 1000);
  }, [gameState, clearTimers, score, spawnShape]);

  const handleShapeClick = useCallback((e) => {
    e.stopPropagation();
    if (gameState !== "active") return;

    clearTimers();
    const rt = Math.round(performance.now() - appearTimeRef.current);
    const perfect = rt < PERFECT_THRESHOLD;

    setLastReaction(rt);
    setIsPerfect(perfect);
    playSound(perfect ? "perfect" : "hit");

    setReactionTimes((prev) => [...prev, rt]);

    const newScore = score + 1;
    setScore(newScore);

    if (newScore > highScore) {
      setHighScore(newScore);
      localStorage.setItem("tapflash_hs", String(newScore));
    }

    setGameState("waiting");
    spawnShape(newScore);
  }, [gameState, clearTimers, score, highScore, spawnShape]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  const avgRT =
    reactionTimes.length > 0
      ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
      : null;

  const { visible: visibleMs } = getDifficulty(score);

  return (
    <div className="tf-root">
      <header className="tf-header">
        <h1 className="tf-logo">
          Tap<span>Flash</span>
        </h1>
        <div className="tf-scores">
          <div className="tf-score-box">
            <span className="tf-score-label">Score</span>
            <span className="tf-score-val">{score}</span>
          </div>
          <div className="tf-score-box">
            <span className="tf-score-label">Best</span>
            <span className="tf-score-val">{highScore}</span>
          </div>
        </div>
      </header>

      <main className="tf-main">
        {gameState === "idle" && (
          <div className="tf-overlay">
            <p className="tf-tagline">Click the circle before it vanishes.</p>
            <button className="tf-btn" onClick={startGame}>
              Start
            </button>
          </div>
        )}

        {gameState === "gameover" && (
          <div className="tf-overlay tf-gameover">
            <h2>Game Over</h2>
            <p className="tf-final-score">{score}</p>
            <p className="tf-final-label">points scored</p>
            {avgRT !== null && (
              <p className="tf-avg-rt">Avg reaction time: {avgRT} ms</p>
            )}
            {score >= highScore && score > 0 && (
              <p className="tf-new-hs">New high score!</p>
            )}
            <button className="tf-btn" onClick={startGame}>
              Try Again
            </button>
          </div>
        )}

        {/* Play area */}
        <div
          ref={areaRef}
          className={`tf-area ${gameState === "idle" || gameState === "gameover" ? "tf-area--dim" : ""}`}
          onClick={handleAreaClick}
        >
          {earlyWarning && (
            <div className="tf-warning">Too early!</div>
          )}

          {gameState === "active" && (
            <div
              key={animKey}
              className="tf-shape"
              onClick={handleShapeClick}
              style={{
                left: position.x,
                top: position.y,
                backgroundColor: color,
                "--visible-ms": `${visibleMs}ms`,
              }}
            />
          )}

          {lastReaction !== null && gameState === "waiting" && (
            <div className={`tf-rt-badge ${isPerfect ? "tf-rt-badge--perfect" : ""}`}>
              {isPerfect && <span className="tf-perfect-label">PERFECT! </span>}
              {lastReaction} ms
            </div>
          )}
        </div>

        {gameState === "waiting" && (
          <p className="tf-hint">Get ready…</p>
        )}
        {gameState === "active" && (
          <p className="tf-hint">Click it!</p>
        )}
      </main>
    </div>
  );
}
