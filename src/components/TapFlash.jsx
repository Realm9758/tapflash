import { useState, useRef, useCallback, useEffect } from "react";
import "./TapFlash.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const POINTS_PER_LEVEL = 5;
const MAX_LIVES = 3;
const NORMAL_COLORS = [
  "#4FC3F7", "#81C784", "#FFB74D", "#F06292",
  "#CE93D8", "#4DD0E1", "#AED581", "#80CBC4",
];

const MODES = [
  { id: "classic",   icon: "🎯", label: "Classic",   desc: "One circle. Don't miss." },
  { id: "chaos",     icon: "🌀", label: "Chaos",     desc: "Three circles. Pick the right one." },
  { id: "precision", icon: "🔬", label: "Precision", desc: "Smaller targets. Steady hand." },
  { id: "endless",   icon: "♾️", label: "Endless",   desc: "No speed cap. How far?" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scoreToLevel(s) {
  return Math.floor(s / POINTS_PER_LEVEL) + 1;
}

function getDifficulty(score, mode) {
  const lv = scoreToLevel(score);
  if (mode === "endless") {
    return {
      delay:   Math.max(100, Math.round(1500 * Math.pow(0.77, lv - 1))),
      visible: Math.max(200, Math.round(2000 * Math.pow(0.80, lv - 1))),
    };
  }
  return {
    delay:   Math.max(300, Math.round(1500 * Math.pow(0.82, lv - 1))),
    visible: Math.max(480, Math.round(2000 * Math.pow(0.85, lv - 1))),
  };
}

function pickType(level, forceGood = false) {
  if (!forceGood) {
    const badChance = Math.min(0.20, (level - 1) * 0.05);
    if (Math.random() < badChance) return "bad";
  }
  const r = Math.random();
  if (r < 0.09) return "bonus";
  if (r < 0.26) return "fast";
  return "normal";
}

function typeColor(type) {
  if (type === "bad")   return "#FF3B3B";
  if (type === "fast")  return "#FFD600";
  if (type === "bonus") return "#BF5FFF";
  return NORMAL_COLORS[rand(0, NORMAL_COLORS.length - 1)];
}

function typePoints(type) {
  if (type === "bonus") return 3;
  if (type === "fast")  return 2;
  return 1;
}

function spreadPositions(n, w, h, pad, minDist) {
  const pts = [];
  for (let attempts = 0; pts.length < n && attempts < 400; attempts++) {
    const x = rand(pad, w - pad);
    const y = rand(pad, h - pad);
    if (pts.every(p => Math.hypot(p.x - x, p.y - y) >= minDist)) pts.push({ x, y });
  }
  return pts;
}

function feedbackFor(rt, type) {
  if (type === "bad")   return { text: "DANGER!",            kind: "danger"   };
  if (type === "bonus") return { text: `BONUS! +3 · ${rt}ms`, kind: "bonus"   };
  if (type === "fast")  return { text: `QUICK! +2 · ${rt}ms`, kind: "fast"    };
  if (rt < 150)         return { text: `INSANE · ${rt}ms`,   kind: "insane"   };
  if (rt < 200)         return { text: `PERFECT · ${rt}ms`,  kind: "perfect"  };
  if (rt < 320)         return { text: `FAST · ${rt}ms`,     kind: "fast-rt"  };
  return                       { text: `${rt}ms`,             kind: "ok"       };
}

function fmt(ms) { return ms != null ? `${ms} ms` : "—"; }

// ─── Sound ────────────────────────────────────────────────────────────────────
function playSound(type) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;

    switch (type) {
      case "hit":
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(760, t + 0.08);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.18); break;
      case "perfect":
        osc.frequency.setValueAtTime(680, t);
        osc.frequency.exponentialRampToValueAtTime(1020, t + 0.12);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t); osc.stop(t + 0.28); break;
      case "bonus":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.3); break;
      case "bad":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.35); break;
      case "miss":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.3); break;
      case "levelup": {
        const o2 = ctx.createOscillator();
        o2.connect(gain);
        osc.frequency.setValueAtTime(440, t);
        o2.frequency.setValueAtTime(660, t + 0.1);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.1);
        o2.start(t + 0.1); o2.stop(t + 0.35); break;
      }
    }
  } catch (_) {}
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ModeCard({ m, active, onSelect }) {
  return (
    <button
      className={`tf-mode-card ${active ? "tf-mode-card--active" : ""}`}
      onClick={() => onSelect(m.id)}
    >
      <span className="tf-mode-icon">{m.icon}</span>
      <span className="tf-mode-name">{m.label}</span>
      <span className="tf-mode-desc">{m.desc}</span>
    </button>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`tf-stat-card ${accent ? "tf-stat-card--accent" : ""}`}>
      <span className="tf-stat-val">{value}</span>
      <span className="tf-stat-label">{label}</span>
    </div>
  );
}

function CircleEl({ circle, onHit, visibleMs }) {
  return (
    <div
      className={`tf-shape tf-shape--${circle.type}`}
      onClick={e => { e.stopPropagation(); onHit(circle); }}
      style={{
        left: circle.x,
        top: circle.y,
        backgroundColor: circle.color,
        "--visible-ms": `${visibleMs}ms`,
        "--shape-color": circle.color,
        width: circle.size,
        height: circle.size,
      }}
    >
      {circle.type === "bad"   && <span className="tf-shape-icon">✕</span>}
      {circle.type === "bonus" && <span className="tf-shape-icon">★</span>}
      {circle.type === "fast"  && <span className="tf-shape-icon">⚡</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reactly() {
  const [screen, setScreen]             = useState("menu"); // menu | game | gameover
  const [selectedMode, setSelectedMode] = useState("classic");

  // Game state
  const [gamePhase, setGamePhase] = useState("waiting"); // waiting | active
  const [score, setScore]         = useState(0);
  const [highScore, setHighScore] = useState(
    () => parseInt(localStorage.getItem("reactly_hs") || "0", 10)
  );
  const [lives, setLives]         = useState(MAX_LIVES);
  const [streak, setStreak]       = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [hitCount, setHitCount]   = useState(0);
  const [missCount, setMissCount] = useState(0);

  // Circles
  const [circles, setCircles]     = useState([]);

  // Feedback
  const [feedback, setFeedback]       = useState(null);
  const [levelUpMsg, setLevelUpMsg]   = useState(null);
  const [earlyWarning, setEarlyWarning] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(null);

  // Reaction time stats
  const [reactionTimes, setReactionTimes] = useState([]);
  const [bestRT, setBestRT] = useState(() => {
    const v = localStorage.getItem("reactly_brt");
    return v ? parseInt(v, 10) : null;
  });

  // Mutable ref for timer callbacks (avoids stale closure issues)
  const G = useRef({ lives: MAX_LIVES, score: 0, streak: 0, bestStreak: 0, mode: "classic" });

  const areaRef          = useRef(null);
  const waitTimerRef     = useRef(null);
  const hideTimerRef     = useRef(null);
  const levelUpTimerRef  = useRef(null);
  const feedbackTimerRef = useRef(null);
  const spawnRef         = useRef(null);
  const appearTimeRef    = useRef(null);

  const clearTimers = () => {
    clearTimeout(waitTimerRef.current);
    clearTimeout(hideTimerRef.current);
  };

  const showFeedback = useCallback((fb) => {
    clearTimeout(feedbackTimerRef.current);
    setFeedback({ ...fb, id: Date.now() });
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 950);
  }, []);

  // Called on timeout miss OR background misclick OR bad circle click
  const handlePenalty = useCallback((type = "miss") => {
    G.current.lives  -= 1;
    G.current.streak  = 0;
    const { lives: newLives, score: curScore, mode } = G.current;

    setLives(newLives);
    setStreak(0);
    setMissCount(c => c + 1);
    setGamePhase("waiting");
    setCircles([]);
    playSound(type === "bad" ? "bad" : "miss");

    if (newLives <= 0) {
      setScreen("gameover");
    } else {
      spawnRef.current?.(curScore, mode);
    }
  }, []);

  // Build the array of circles for the upcoming round
  const buildCircles = useCallback((curScore, mode) => {
    const areaEl    = areaRef.current;
    const precision = mode === "precision";
    const size      = precision ? 44 : 76;
    const padding   = precision ? 50 : 62;
    const w         = areaEl?.clientWidth  ?? 500;
    const h         = areaEl?.clientHeight ?? 440;
    const lv        = scoreToLevel(curScore);

    if (mode === "chaos") {
      // Always: 1 bad + 2 good (shuffled)
      const types = ["bad", pickType(lv, true), pickType(lv, true)];
      for (let i = types.length - 1; i > 0; i--) {
        const j = rand(0, i);
        [types[i], types[j]] = [types[j], types[i]];
      }
      const positions = spreadPositions(3, w, h, padding, size + 28);
      return types.map((type, i) => ({
        id: Date.now() + i,
        x: positions[i]?.x ?? rand(padding, w - padding),
        y: positions[i]?.y ?? rand(padding, h - padding),
        type, color: typeColor(type), size,
      }));
    }

    const type = pickType(lv);
    return [{
      id: Date.now(),
      x: rand(padding, w - padding),
      y: rand(padding, h - padding),
      type, color: typeColor(type), size,
    }];
  }, []);

  const spawn = useCallback((curScore, mode) => {
    clearTimers();
    const { delay, visible } = getDifficulty(curScore, mode);

    waitTimerRef.current = setTimeout(() => {
      const newCircles = buildCircles(curScore, mode);

      // Fast single circles disappear much sooner
      const isSingleFast = newCircles.length === 1 && newCircles[0].type === "fast";
      const effectiveVisible = isSingleFast ? Math.round(visible * 0.40) : visible;

      setCircles(newCircles);
      setGamePhase("active");
      appearTimeRef.current = performance.now();

      hideTimerRef.current = setTimeout(() => {
        const allBad = newCircles.every(c => c.type === "bad");
        if (allBad) {
          showFeedback({ text: "DODGED!", kind: "fast-rt" });
          setGamePhase("waiting");
          setCircles([]);
          spawnRef.current?.(curScore, G.current.mode);
        } else {
          showFeedback({ text: "MISS!", kind: "miss" });
          handlePenalty("miss");
        }
      }, effectiveVisible);
    }, delay);
  }, [buildCircles, handlePenalty, showFeedback]);

  // Store in ref so timer callbacks always call the latest version
  useEffect(() => { spawnRef.current = spawn; }, [spawn]);

  const startGame = useCallback((mode) => {
    clearTimers();
    clearTimeout(levelUpTimerRef.current);
    G.current = { lives: MAX_LIVES, score: 0, streak: 0, bestStreak: 0, mode };

    setScreen("game");
    setGamePhase("waiting");
    setScore(0);
    setLives(MAX_LIVES);
    setStreak(0);
    setBestStreak(0);
    setHitCount(0);
    setMissCount(0);
    setCircles([]);
    setFeedback(null);
    setLevelUpMsg(null);
    setShareFeedback(null);
    setReactionTimes([]);
    setEarlyWarning(false);

    spawn(0, mode);
  }, [spawn]);

  const handleCircleClick = useCallback((circle) => {
    if (gamePhase !== "active") return;
    clearTimers();

    const rt = Math.round(performance.now() - appearTimeRef.current);

    if (circle.type === "bad") {
      showFeedback(feedbackFor(rt, "bad"));
      handlePenalty("bad");
      return;
    }

    // Good circle hit
    const pts = typePoints(circle.type);
    setHitCount(c => c + 1);
    playSound(circle.type === "bonus" ? "bonus" : rt < 200 ? "perfect" : "hit");
    showFeedback(feedbackFor(rt, circle.type));

    setReactionTimes(prev => [...prev, rt]);
    if (bestRT === null || rt < bestRT) {
      setBestRT(rt);
      localStorage.setItem("reactly_brt", String(rt));
    }

    G.current.score  += pts;
    G.current.streak += 1;

    // Streak bonus at 10+
    if (G.current.streak >= 10) G.current.score += 1;

    if (G.current.streak > G.current.bestStreak) {
      G.current.bestStreak = G.current.streak;
      setBestStreak(G.current.bestStreak);
    }

    const newScore  = G.current.score;
    const newStreak = G.current.streak;

    setScore(newScore);
    setStreak(newStreak);

    if (newScore > highScore) {
      setHighScore(newScore);
      localStorage.setItem("reactly_hs", String(newScore));
    }

    // Level up detection
    const prevLevel = scoreToLevel(newScore - pts);
    const newLevel  = scoreToLevel(newScore);
    if (newLevel > prevLevel) {
      clearTimeout(levelUpTimerRef.current);
      setLevelUpMsg(`Level ${newLevel} — Speed Up!`);
      playSound("levelup");
      levelUpTimerRef.current = setTimeout(() => setLevelUpMsg(null), 2200);
    }

    setGamePhase("waiting");
    setCircles([]);
    spawnRef.current?.(newScore, G.current.mode);
  }, [gamePhase, highScore, bestRT, handlePenalty, showFeedback]);

  const handleAreaClick = useCallback(() => {
    if (gamePhase === "active") {
      clearTimers();
      showFeedback({ text: "MISS!", kind: "miss" });
      handlePenalty("miss");
    } else if (gamePhase === "waiting") {
      setEarlyWarning(true);
      setTimeout(() => setEarlyWarning(false), 750);
    }
  }, [gamePhase, handlePenalty, showFeedback]);

  const handleShare = useCallback(async () => {
    const avg = reactionTimes.length
      ? fmt(Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length))
      : "N/A";
    const text = `I scored ${score} on Reactly with an avg of ${avg}. Can you beat me? 🎯`;
    try {
      await navigator.clipboard.writeText(text);
      setShareFeedback("Copied to clipboard!");
    } catch {
      setShareFeedback(text);
    }
    setTimeout(() => setShareFeedback(null), 3000);
  }, [score, reactionTimes]);

  useEffect(() => () => {
    clearTimers();
    clearTimeout(levelUpTimerRef.current);
    clearTimeout(feedbackTimerRef.current);
  }, []);

  // Derived
  const lv             = scoreToLevel(score);
  const avgRT          = reactionTimes.length
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : null;
  const sessionBestRT  = reactionTimes.length ? Math.min(...reactionTimes) : null;
  const totalAttempts  = hitCount + missCount;
  const accuracy       = totalAttempts > 0 ? Math.round((hitCount / totalAttempts) * 100) : null;
  const streakHot      = streak >= 4;
  const streakBlazing  = streak >= 8;
  const isNewHS        = score > 0 && score >= highScore;
  const { visible: visibleMs } = getDifficulty(score, G.current.mode);

  // ── Screen: Menu ────────────────────────────────────────────────────────────
  if (screen === "menu") {
    return (
      <div className="tf-root">
        <header className="tf-header">
          <h1 className="tf-logo">React<span>ly</span></h1>
          <div className="tf-score-box">
            <span className="tf-score-label">Best</span>
            <span className="tf-score-val">{highScore}</span>
          </div>
        </header>
        <main className="tf-main">
          <div className="tf-menu">
            <p className="tf-menu-title">Choose a mode</p>
            <div className="tf-mode-grid">
              {MODES.map(m => (
                <ModeCard
                  key={m.id}
                  m={m}
                  active={selectedMode === m.id}
                  onSelect={setSelectedMode}
                />
              ))}
            </div>
            <button className="tf-btn tf-btn--large" onClick={() => startGame(selectedMode)}>
              Play {MODES.find(m => m.id === selectedMode)?.label}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Screen: Game Over ───────────────────────────────────────────────────────
  if (screen === "gameover") {
    return (
      <div className="tf-root">
        <header className="tf-header">
          <h1 className="tf-logo">React<span>ly</span></h1>
          <div className="tf-score-box">
            <span className="tf-score-label">Best</span>
            <span className="tf-score-val">{highScore}</span>
          </div>
        </header>
        <main className="tf-main">
          <div className="tf-gameover-card">
            <h2 className="tf-go-title">Game Over</h2>

            <div className="tf-final-score-wrap">
              {isNewHS && <span className="tf-new-hs">New Best!</span>}
              <p className="tf-final-score">{score}</p>
              <p className="tf-final-label">points</p>
            </div>

            <div className="tf-stats-grid">
              <StatCard label="Avg RT"      value={fmt(avgRT)} />
              <StatCard label="Best RT"     value={fmt(sessionBestRT)} accent />
              <StatCard label="Best Streak" value={bestStreak > 0 ? `🔥 ${bestStreak}` : "—"} />
              <StatCard label="Accuracy"    value={accuracy != null ? `${accuracy}%` : "—"} />
            </div>

            {shareFeedback ? (
              <p className="tf-share-feedback">{shareFeedback}</p>
            ) : (
              <div className="tf-go-actions">
                <button className="tf-btn" onClick={() => startGame(selectedMode)}>Try Again</button>
                <button className="tf-btn tf-btn--ghost" onClick={() => setScreen("menu")}>Menu</button>
                <button className="tf-btn tf-btn--ghost" onClick={handleShare}>Share</button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── Screen: Game ────────────────────────────────────────────────────────────
  return (
    <div className="tf-root">
      <header className="tf-header">
        <h1 className="tf-logo">React<span>ly</span></h1>

        <div className="tf-header-center">
          <div className="tf-level-badge">
            <span className="tf-level-label">LVL</span>
            <span className="tf-level-num">{lv}</span>
          </div>
        </div>

        <div className="tf-header-right">
          <div className="tf-lives">
            {Array.from({ length: MAX_LIVES }).map((_, i) => (
              <span key={i} className={i < lives ? "tf-heart--alive" : "tf-heart--lost"}>
                {i < lives ? "❤️" : "🖤"}
              </span>
            ))}
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
        </div>
      </header>

      <main className="tf-main">
        {levelUpMsg && (
          <div className="tf-levelup-toast"><span>⚡</span>{levelUpMsg}</div>
        )}

        {streak >= 2 && (
          <div className={`tf-streak ${streakBlazing ? "tf-streak--blazing" : streakHot ? "tf-streak--hot" : ""}`}>
            🔥 {streak}
          </div>
        )}

        <div
          ref={areaRef}
          className={`tf-area ${streakBlazing ? "tf-area--blazing" : streakHot ? "tf-area--hot" : ""}`}
          onClick={handleAreaClick}
        >
          {earlyWarning && <div className="tf-warning">Too early!</div>}

          {circles.map(circle => (
            <CircleEl
              key={circle.id}
              circle={circle}
              onHit={handleCircleClick}
              visibleMs={visibleMs}
            />
          ))}

          {feedback && (
            <div key={feedback.id} className={`tf-feedback tf-feedback--${feedback.kind}`}>
              {feedback.text}
            </div>
          )}
        </div>

        <p className="tf-hint">
          {gamePhase === "waiting" && "Get ready…"}
          {gamePhase === "active"  && (G.current.mode === "chaos" ? "Click the right circle!" : "Click it!")}
        </p>
      </main>
    </div>
  );
}
