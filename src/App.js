import { useState, useEffect, useCallback } from "react";

// ─── CARBON INTENSITY API ─────────────────────────────────────────────────────
const CI_API = "https://api.carbonintensity.org.uk";
const GREEN_FUELS = ["wind", "solar", "hydro", "nuclear", "biomass"];

async function fetchGridData() {
  try {
    const [intRes, genRes] = await Promise.all([
      fetch(`${CI_API}/intensity`),
      fetch(`${CI_API}/generation`),
    ]);
    const [intJson, genJson] = await Promise.all([intRes.json(), genRes.json()]);
    const intensity = intJson.data[0].intensity;
    const co2 = intensity.actual ?? intensity.forecast;
    const fuels = genJson.data[0].generationmix;
    const greenPct = Math.round(fuels.filter(f => GREEN_FUELS.includes(f.fuel)).reduce((s, f) => s + f.perc, 0));
    return { greenPct, co2, index: intensity.index };
  } catch {
    return null;
  }
}

// ─── MOCK OHME STATE (replaces real API in prototype) ─────────────────────────
const MOCK_OHME = { chargeLevel: 43, isCharging: false, targetLevel: 80, powerKw: 7.4 };

// ─── CONTROL LOGIC (runs every 5 min in real app, simulated here) ─────────────
function shouldCharge(greenPct, threshold, chargeLevel, targetLevel) {
  if (chargeLevel >= targetLevel) return { charge: false, reason: `Target ${targetLevel}% reached` };
  if (greenPct >= threshold) return { charge: true, reason: `Grid ${greenPct}% green — above your ${threshold}% threshold` };
  return { charge: false, reason: `Grid ${greenPct}% green — below your ${threshold}% threshold` };
}

// ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
function gridColor(pct) {
  return pct >= 70 ? "#22d3a5" : pct >= 45 ? "#fbbf24" : "#f87060";
}
function gridLabel(pct) {
  return pct >= 70 ? "Green window" : pct >= 45 ? "Moderate" : "High carbon";
}

// ─── ARC GAUGE ────────────────────────────────────────────────────────────────
function ArcGauge({ pct, size = 200, children }) {
  const r = (size / 2) - 14;
  const cx = size / 2, cy = size / 2;
  const start = -220, sweep = 260;
  const toRad = d => d * Math.PI / 180;
  const pt = a => ({ x: cx + r * Math.cos(toRad(a)), y: cy + r * Math.sin(toRad(a)) });
  const p1 = pt(start), p2 = pt(start + sweep);
  const fill = pt(start + (pct / 100) * sweep);
  const filledSweep = (pct / 100) * sweep;
  const la1 = sweep > 180 ? 1 : 0;
  const la2 = filledSweep > 180 ? 1 : 0;
  const c = gridColor(pct);

  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="arcFill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={c} stopOpacity="0.4" />
          <stop offset="100%" stopColor={c} />
        </linearGradient>
        <filter id="arcGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <path d={`M${p1.x},${p1.y} A${r},${r} 0 ${la1},1 ${p2.x},${p2.y}`}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" />
      {/* Fill */}
      {pct > 0 && (
        <path d={`M${p1.x},${p1.y} A${r},${r} 0 ${la2},1 ${fill.x},${fill.y}`}
          fill="none" stroke="url(#arcFill)" strokeWidth="10" strokeLinecap="round"
          filter="url(#arcGlow)"
          style={{ transition: "all 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
      )}
      {children}
    </svg>
  );
}

// ─── EV BATTERY VISUAL ────────────────────────────────────────────────────────
function EVBattery({ level, isCharging, color }) {
  return (
    <div style={{ position: "relative", width: 90, height: 40 }}>
      <div style={{
        width: 84, height: 40, borderRadius: 8,
        border: `2px solid ${color}50`,
        background: "rgba(255,255,255,0.03)",
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${level}%`,
          background: `linear-gradient(90deg, ${color}40, ${color}80)`,
          transition: "width 1s ease",
          borderRadius: 6,
        }} />
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          fontWeight: 600, color: "#e2e8f0", zIndex: 1,
        }}>{level}%</div>
      </div>
      {/* Battery tip */}
      <div style={{
        position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)",
        width: 6, height: 16, borderRadius: "0 3px 3px 0",
        background: `${color}50`,
      }} />
      {/* Charging bolt */}
      {isCharging && (
        <div style={{
          position: "absolute", top: -10, right: -10,
          width: 20, height: 20, borderRadius: "50%",
          background: color, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, boxShadow: `0 0 12px ${color}`,
          animation: "chargePulse 1.5s ease-in-out infinite",
        }}>⚡</div>
      )}
    </div>
  );
}

// ─── ACTIVITY LOG ITEM ────────────────────────────────────────────────────────
function LogItem({ log, color }) {
  const icons = { started: "▶", paused: "⏸", manual: "✋", setup: "⚙️" };
  return (
    <div style={{
      display: "flex", gap: 12, padding: "12px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      animation: "fadeUp 0.4s ease",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `${color}15`, border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12,
      }}>{icons[log.type] ?? "●"}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", marginBottom: 3 }}>{log.message}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.5px" }}>{log.time} · Grid {log.greenPct}% green</div>
      </div>
    </div>
  );
}

// ─── SCREEN: SETUP ────────────────────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [postcode, setPostcode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [threshold, setThreshold] = useState(70);
  const [target, setTarget] = useState(80);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = () => {
    if (!email || !password) return;
    setConnecting(true);
    setTimeout(() => { setConnecting(false); setConnected(true); }, 2000);
  };

  const steps = [
    {
      label: "Location",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            GridWise uses your postcode to fetch regional grid data — so your charging decisions reflect what's actually happening on your local grid.
          </p>
          <div>
            <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "2px", display: "block", marginBottom: 8 }}>POSTCODE</label>
            <input value={postcode} onChange={e => setPostcode(e.target.value.toUpperCase())}
              placeholder="e.g. SW1A" maxLength={4}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontSize: 16,
                outline: "none", letterSpacing: "3px",
              }} />
          </div>
        </div>
      ),
      canNext: postcode.length >= 2,
    },
    {
      label: "Connect Ohme",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
            borderRadius: 12, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>OH</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Ohme Home Pro</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "1px" }}>SIGN IN WITH YOUR OHME ACCOUNT</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            GridWise uses your Ohme credentials to read your charge level and send start/pause commands on your behalf. Your credentials are never stored.
          </p>
          {[
            { label: "EMAIL", value: email, set: setEmail, type: "email", placeholder: "your@email.com" },
            { label: "PASSWORD", value: password, set: setPassword, type: "password", placeholder: "••••••••" },
          ].map(f => (
            <div key={f.label}>
              <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "2px", display: "block", marginBottom: 8 }}>{f.label}</label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: "none" }} />
            </div>
          ))}
          <button onClick={handleConnect} disabled={connecting || connected || !email || !password}
            style={{
              padding: "13px", borderRadius: 12, border: "none", cursor: connected ? "default" : "pointer",
              background: connected ? "rgba(34,211,165,0.15)" : "rgba(59,130,246,0.2)",
              border: `1px solid ${connected ? "rgba(34,211,165,0.4)" : "rgba(59,130,246,0.3)"}`,
              color: connected ? "#22d3a5" : "#3b82f6",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "2px", fontWeight: 600,
              transition: "all 0.3s",
            }}>
            {connecting ? "CONNECTING..." : connected ? "✓ OHME CONNECTED" : "CONNECT OHME →"}
          </button>
        </div>
      ),
      canNext: connected,
    },
    {
      label: "Preferences",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            Set your green threshold and charge target. GridWise will handle everything else automatically.
          </p>
          {/* Green threshold */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Green threshold</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Only charge above this green %</div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: gridColor(threshold) }}>{threshold}%</div>
            </div>
            <input type="range" min={40} max={90} step={5} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              style={{ width: "100%", accentColor: gridColor(threshold), cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
              <span>40% — charge often</span><span>90% — very green only</span>
            </div>
          </div>
          {/* Charge target */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Charge target</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Stop charging when EV reaches</div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>{target}%</div>
            </div>
            <input type="range" min={50} max={100} step={5} value={target}
              onChange={e => setTarget(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }} />
          </div>
          {/* Summary */}
          <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(34,211,165,0.06)", border: "1px solid rgba(34,211,165,0.15)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(34,211,165,0.7)", letterSpacing: "2px", marginBottom: 8 }}>GRIDWISE WILL</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
              ✓ Check the grid every 5 minutes<br />
              ✓ Start charging when grid is {threshold}%+ green<br />
              ✓ Pause charging when grid drops below {threshold}%<br />
              ✓ Stop when your EV reaches {target}%
            </div>
          </div>
        </div>
      ),
      canNext: true,
    },
  ];

  const current = steps[step];

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", display: "flex", flexDirection: "column", fontFamily: "'Syne', sans-serif" }}>
      {/* Progress bar */}
      <div style={{ height: 2, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ height: "100%", width: `${((step + 1) / steps.length) * 100}%`, background: "#22d3a5", transition: "width 0.5s ease" }} />
      </div>

      <div style={{ flex: 1, maxWidth: 440, margin: "0 auto", width: "100%", padding: "32px 20px 24px", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "4px", color: "rgba(255,255,255,0.2)", marginBottom: 6 }}>STEP {step + 1} OF {steps.length}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px" }}>
            {current.label}
          </h1>
        </div>

        {/* Step content */}
        <div style={{ flex: 1 }}>{current.content}</div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10, marginTop: 32 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              BACK
            </button>
          )}
          <button onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onComplete({ postcode, threshold, target })}
            disabled={!current.canNext}
            style={{
              flex: 2, padding: 14, borderRadius: 12, border: "none", cursor: current.canNext ? "pointer" : "not-allowed",
              background: current.canNext ? "linear-gradient(135deg, #22d3a5, #10b981)" : "rgba(255,255,255,0.05)",
              color: current.canNext ? "#07090f" : "rgba(255,255,255,0.2)",
              fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 800,
              boxShadow: current.canNext ? "0 8px 32px rgba(34,211,165,0.3)" : "none",
              transition: "all 0.3s",
            }}>
            {step < steps.length - 1 ? "CONTINUE →" : "ACTIVATE GRIDWISE →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: HOME DASHBOARD ───────────────────────────────────────────────────
function HomeScreen({ config, onViewLog }) {
  const [grid, setGrid] = useState(null);
  const [ohme, setOhme] = useState({ ...MOCK_OHME });
  const [manualOverride, setManualOverride] = useState(false);
  const [lastCheck, setLastCheck] = useState(new Date());
  const [decision, setDecision] = useState(null);
  const [logs, setLogs] = useState([
    { id: 1, type: "setup", message: "GridWise activated — monitoring grid", time: "Just now", greenPct: 0 },
  ]);
  const [ticker, setTicker] = useState(0);

  const addLog = useCallback((type, message, greenPct) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setLogs(l => [{ id: Date.now(), type, message, time, greenPct }, ...l].slice(0, 20));
  }, []);

  // Fetch real grid data
  useEffect(() => {
    const load = async () => {
      const data = await fetchGridData();
      if (data) {
        setGrid(data);
        setLastCheck(new Date());
      }
    };
    load();
    const iv = setInterval(load, 300_000);
    return () => clearInterval(iv);
  }, []);

  // Simulate EV charging level increasing when charging is active
  useEffect(() => {
    const iv = setInterval(() => {
      setOhme(o => {
        if (o.isCharging && o.chargeLevel < o.targetLevel) {
          return { ...o, chargeLevel: Math.min(o.targetLevel, o.chargeLevel + 1) };
        }
        return o;
      });
      setTicker(t => t + 1);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  // Control logic — runs whenever grid data or ohme state changes
  useEffect(() => {
    if (!grid || manualOverride) return;
    const d = shouldCharge(grid.greenPct, config.threshold, ohme.chargeLevel, config.target);
    setDecision(d);

    setOhme(o => {
      if (d.charge !== o.isCharging) {
        addLog(
          d.charge ? "started" : "paused",
          d.charge ? `Charging started — ${d.reason}` : `Charging paused — ${d.reason}`,
          grid.greenPct
        );
        return { ...o, isCharging: d.charge };
      }
      return o;
    });
  }, [grid, config, manualOverride, ticker]);

  const toggleManual = () => {
    const next = !manualOverride;
    setManualOverride(next);
    setOhme(o => ({ ...o, isCharging: next ? !o.isCharging : o.isCharging }));
    addLog("manual", next ? "Manual override — automatic control paused" : "Automatic control resumed", grid?.greenPct ?? 0);
  };

  const c = gridColor(grid?.greenPct ?? 0);
  const evColor = "#3b82f6";

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", fontFamily: "'Syne', sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Ambient */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "20%", width: 400, height: 400, background: `radial-gradient(circle, ${c}10 0%, transparent 70%)`, transition: "background 3s ease" }} />
        <div style={{ position: "absolute", bottom: "5%", right: "-10%", width: 300, height: 300, background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", inset: 0, opacity: 0.025, backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 440, margin: "0 auto", padding: "28px 18px 40px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "4px", color: "rgba(255,255,255,0.2)", marginBottom: 4 }}>HOME ENERGY OS</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px" }}>
              Grid<span style={{ color: c, transition: "color 2s" }}>Wise</span>
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 4 }}>📍 {config.postcode}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
              CHECKED {lastCheck.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* ── MAIN CARD: Grid + EV ── */}
        <div style={{
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 24, padding: 22, marginBottom: 14, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Arc gauge */}
            <div style={{ position: "relative", width: 160, height: 160 }}>
              {grid ? (
                <ArcGauge pct={grid.greenPct} size={160}>
                  <text x="80" y="78" textAnchor="middle" fill={c} fontSize="30" fontFamily="'Syne', sans-serif" fontWeight="800">{grid.greenPct}%</text>
                  <text x="80" y="96" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="'JetBrains Mono', monospace" letterSpacing="1">GREEN NOW</text>
                  <text x="80" y="112" textAnchor="middle" fill={c} fontSize="9" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.5">{gridLabel(grid.greenPct).toUpperCase()}</text>
                </ArcGauge>
              ) : (
                <div style={{ width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#22d3a5", animation: "spin 1s linear infinite" }} />
                </div>
              )}
            </div>

            {/* EV status */}
            <div style={{ flex: 1, paddingLeft: 20 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "2px", marginBottom: 12 }}>EV CHARGER</div>
              <EVBattery level={ohme.chargeLevel} isCharging={ohme.isCharging} color={evColor} />
              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: ohme.isCharging ? evColor : "rgba(255,255,255,0.25)", letterSpacing: "1.5px", marginBottom: 4 }}>
                  {ohme.isCharging ? `● CHARGING · ${ohme.powerKw}kW` : "○ PAUSED"}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>TARGET {config.target}%</div>
              </div>
            </div>
          </div>

          {/* Threshold indicator */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Your threshold: <span style={{ color: c, fontWeight: 600 }}>{config.threshold}% green</span>
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "4px 10px", borderRadius: 6,
                background: `${c}15`, border: `1px solid ${c}30`, color: c, letterSpacing: "1px",
              }}>
                {grid && grid.greenPct >= config.threshold ? "THRESHOLD MET" : "BELOW THRESHOLD"}
              </div>
            </div>
          </div>
        </div>

        {/* ── DECISION CARD ── */}
        {decision && grid && (
          <div style={{
            background: ohme.isCharging ? "rgba(34,211,165,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${ohme.isCharging ? "rgba(34,211,165,0.25)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 16, padding: "14px 18px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ fontSize: 28 }}>{ohme.isCharging ? "⚡" : "⏸"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: ohme.isCharging ? "#22d3a5" : "rgba(255,255,255,0.3)", letterSpacing: "2px", marginBottom: 4 }}>
                {manualOverride ? "MANUAL OVERRIDE" : "GRIDWISE DECISION"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>{decision.reason}</div>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, color: ohme.isCharging ? "#22d3a5" : "rgba(255,255,255,0.15)" }}>
              {grid.co2}g
            </div>
          </div>
        )}

        {/* ── MANUAL OVERRIDE ── */}
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16, padding: "14px 18px", marginBottom: 14,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Manual override</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {manualOverride ? "Automatic control paused" : "GridWise is in control"}
            </div>
          </div>
          <button onClick={toggleManual} style={{
            width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", position: "relative",
            background: manualOverride ? "#f87060" : "rgba(255,255,255,0.08)", transition: "background 0.3s",
          }}>
            <div style={{
              position: "absolute", top: 4, width: 20, height: 20, borderRadius: "50%", background: "white",
              left: manualOverride ? 28 : 4, transition: "left 0.3s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }} />
          </button>
        </div>

        {/* ── ACTIVITY LOG PREVIEW ── */}
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16, padding: "16px 18px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "2px" }}>ACTIVITY</div>
            <button onClick={onViewLog} style={{ background: "none", border: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", cursor: "pointer", letterSpacing: "1px" }}>
              VIEW ALL →
            </button>
          </div>
          {logs.slice(0, 3).map(l => <LogItem key={l.id} log={l} color={c} />)}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.1)", letterSpacing: "2px" }}>
          NATIONAL GRID ESO · LIVE DATA · 5 MIN REFRESH
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: ACTIVITY LOG ─────────────────────────────────────────────────────
function LogScreen({ onBack, grid }) {
  const c = gridColor(grid?.greenPct ?? 0);
  const logs = [
    { id: 1, type: "started", message: "Charging started — grid 82% green, above 70% threshold", time: "2:14am", greenPct: 82 },
    { id: 2, type: "paused",  message: "Charging paused — grid dropped to 58%, below threshold", time: "4:30am", greenPct: 58 },
    { id: 3, type: "started", message: "Charging resumed — grid recovered to 76% green",         time: "5:15am", greenPct: 76 },
    { id: 4, type: "paused",  message: "Charging paused — target 80% reached",                   time: "6:44am", greenPct: 71 },
    { id: 5, type: "manual",  message: "Manual override activated by user",                       time: "Yesterday 11pm", greenPct: 44 },
    { id: 6, type: "started", message: "Charging started — grid 79% green",                      time: "Yesterday 1am", greenPct: 79 },
    { id: 7, type: "setup",   message: "GridWise activated — monitoring grid",                    time: "Yesterday",     greenPct: 0  },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", fontFamily: "'Syne', sans-serif" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "28px 18px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "3px", marginBottom: 2 }}>GRIDWISE</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>Activity Log</h2>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "SESSIONS", value: "12" },
            { label: "GREEN RUNS", value: "9" },
            { label: "AVG GREEN", value: "76%" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.25)", letterSpacing: "1px", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: c }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Log list */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "4px 16px" }}>
          {logs.map(l => <LogItem key={l.id} log={l} color={c} />)}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function GridWiseMVP() {
  const [screen, setScreen] = useState("setup");
  const [config, setConfig] = useState(null);
  const [grid, setGrid] = useState(null);

  useEffect(() => {
    fetchGridData().then(d => { if (d) setGrid(d); });
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07090f; }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes chargePulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.2); opacity: 0.7 } }
        input[type=range] { -webkit-appearance: none; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: currentColor; cursor: pointer; box-shadow: 0 0 8px currentColor; }
        input[type=text], input[type=email], input[type=password] { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 13px 16px; color: #e2e8f0; outline: none; font-size: 14px; transition: border-color 0.2s; }
        input[type=text]:focus, input[type=email]:focus, input[type=password]:focus { border-color: rgba(255,255,255,0.25); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      {screen === "setup" && (
        <SetupScreen onComplete={cfg => { setConfig(cfg); setScreen("home"); }} />
      )}
      {screen === "home" && config && (
        <HomeScreen config={config} onViewLog={() => setScreen("log")} />
      )}
      {screen === "log" && (
        <LogScreen onBack={() => setScreen("home")} grid={grid} />
      )}
    </>
  );
}

