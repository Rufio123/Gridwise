import { useState, useEffect, useCallback } from "react";

// ─── CARBON INTENSITY API ─────────────────────────────────────────────────────
const CI_API = "https://api.carbonintensity.org.uk";
const GREEN_FUELS = ["wind", "solar", "hydro", "nuclear", "biomass"];

async function fetchGridData() {
  try {
    const [intRes, genRes, forecastRes] = await Promise.all([
      fetch(`${CI_API}/intensity`),
      fetch(`${CI_API}/generation`),
      fetch(`${CI_API}/intensity/date`),
    ]);
    const [intJson, genJson, forecastJson] = await Promise.all([
      intRes.json(), genRes.json(), forecastRes.json()
    ]);
    const intensity = intJson.data[0].intensity;
    const co2 = intensity.actual ?? intensity.forecast;
    const fuels = genJson.data[0].generationmix;
    const greenPct = Math.round(
      fuels.filter(f => GREEN_FUELS.includes(f.fuel)).reduce((s, f) => s + f.perc, 0)
    );
    const now = new Date();
    const forecast = forecastJson.data
      .filter(s => new Date(s.from) >= now)
      .slice(0, 16)
      .map((slot, i) => {
        const t = new Date(slot.from);
        const h = t.getHours(), m = t.getMinutes();
        const green = Math.round(Math.max(5, Math.min(98, 100 - (slot.intensity.forecast / 300) * 90)));
        return {
          label: i === 0 ? "Now" : `${h % 12 || 12}${m ? ":30" : ""}${h >= 12 ? "pm" : "am"}`,
          green,
          co2: slot.intensity.forecast,
          time: t,
          isNow: i === 0,
        };
      });
    const bestWindow = forecast.reduce((best, s) => s.green > (best?.green ?? 0) ? s : best, null);
    return { greenPct, co2, index: intensity.index, forecast, bestWindow, fuels };
  } catch {
    return null;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const MOCK_OHME = { chargeLevel: 43, isCharging: false, targetLevel: 80, powerKw: 7.4 };

function shouldCharge(greenPct, threshold, chargeLevel, targetLevel) {
  if (chargeLevel >= targetLevel) return { charge: false, reason: `Target ${targetLevel}% reached` };
  if (greenPct >= threshold) return { charge: true, reason: `Grid is ${greenPct}% green — above your ${threshold}% threshold` };
  return { charge: false, reason: `Grid is ${greenPct}% green — below your ${threshold}% threshold` };
}

function gridColor(pct) {
  return pct >= 70 ? "#22d3a5" : pct >= 45 ? "#fbbf24" : "#f87060";
}
function gridLabel(pct) {
  return pct >= 70 ? "Great for charging" : pct >= 45 ? "Moderate" : "High carbon";
}
function gridEmoji(pct) {
  return pct >= 70 ? "🌿" : pct >= 45 ? "⚡" : "🔥";
}

// ─── FORECAST TIMELINE ────────────────────────────────────────────────────────
function ForecastTimeline({ forecast, threshold }) {
  if (!forecast || forecast.length === 0) return null;
  const max = Math.max(...forecast.map(s => s.green));

  return (
    <div>
      {/* Bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64, marginBottom: 6 }}>
        {forecast.map((slot, i) => {
          const color = gridColor(slot.green);
          const h = Math.max(6, (slot.green / 100) * 56);
          const isAbove = slot.green >= threshold;
          const isBest = slot.green === max;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
              <div style={{ position: "relative", width: "100%", height: `${h}px` }}>
                <div style={{
                  width: "100%", height: "100%",
                  background: isAbove
                    ? `linear-gradient(to top, ${color}55, ${color}cc)`
                    : `linear-gradient(to top, rgba(255,255,255,0.04), rgba(255,255,255,0.08))`,
                  borderRadius: "3px 3px 0 0",
                  border: slot.isNow ? `1px solid ${color}` : "none",
                  transition: "all 0.8s ease",
                  position: "relative",
                }}>
                  {isBest && (
                    <div style={{
                      position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                      background: color, borderRadius: 4, padding: "1px 4px",
                      fontFamily: "monospace", fontSize: 7, color: "#07090f", fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}>BEST</div>
                  )}
                  {slot.isNow && (
                    <div style={{
                      position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)",
                      width: 6, height: 6, borderRadius: "50%", background: color,
                      boxShadow: `0 0 8px ${color}`, animation: "glow 2s infinite",
                    }} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Threshold line label */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", position: "relative" }}>
          <div style={{ position: "absolute", right: 0, top: -8, fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.2)" }}>
            YOUR THRESHOLD {threshold}%
          </div>
        </div>
      </div>

      {/* Time labels */}
      <div style={{ display: "flex", gap: 3 }}>
        {forecast.map((slot, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            {(i % 4 === 0 || slot.isNow) && (
              <span style={{
                fontFamily: "monospace", fontSize: 8,
                color: slot.isNow ? gridColor(slot.green) : "rgba(255,255,255,0.25)",
                fontWeight: slot.isNow ? 700 : 400,
              }}>{slot.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LARGE GREEN DISPLAY ──────────────────────────────────────────────────────
function GreenDisplay({ pct, loading }) {
  const c = gridColor(pct);
  if (loading) return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid rgba(255,255,255,0.06)`, borderTopColor: "#22d3a5", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
      <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>READING GRID...</div>
    </div>
  );
  return (
    <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
      <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 8 }}>GRID RIGHT NOW</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 20 }}>{gridEmoji(pct)}</div>
        <div style={{
          fontSize: 72, fontWeight: 800, letterSpacing: "-4px", lineHeight: 1,
          color: c, filter: `drop-shadow(0 0 24px ${c}66)`,
          transition: "color 2s ease, filter 2s ease",
          fontFamily: "'Syne', sans-serif",
        }}>{pct}<span style={{ fontSize: 32, letterSpacing: "-1px" }}>%</span></div>
      </div>
      <div style={{
        display: "inline-block", padding: "5px 14px", borderRadius: 20,
        background: `${c}15`, border: `1px solid ${c}35`,
        fontFamily: "monospace", fontSize: 10, color: c, letterSpacing: 2,
      }}>{gridLabel(pct).toUpperCase()}</div>
    </div>
  );
}

// ─── EV BATTERY ───────────────────────────────────────────────────────────────
function EVBattery({ level, isCharging, color }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 80, height: 34, borderRadius: 7, border: `1.5px solid ${color}50`, background: "rgba(255,255,255,0.03)", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${level}%`, background: `linear-gradient(90deg, ${color}40, ${color}80)`, transition: "width 1s ease", borderRadius: 5 }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{level}%</div>
      </div>
      <div style={{ width: 5, height: 14, borderRadius: "0 3px 3px 0", background: `${color}50` }} />
      {isCharging && (
        <div style={{ position: "absolute", top: -8, right: -8, width: 18, height: 18, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, animation: "chargePulse 1.5s infinite", boxShadow: `0 0 10px ${color}` }}>⚡</div>
      )}
    </div>
  );
}

// ─── LOG ITEM ─────────────────────────────────────────────────────────────────
function LogItem({ log, color }) {
  const icons = { started: "▶", paused: "⏸", manual: "✋", setup: "⚙" };
  return (
    <div style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `${color}15`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
        {icons[log.type] ?? "●"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#e2e8f0", marginBottom: 2, lineHeight: 1.3 }}>{log.message}</div>
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{log.time} · {log.greenPct}% green</div>
      </div>
    </div>
  );
}

// ─── SETUP SCREEN ─────────────────────────────────────────────────────────────
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

  const c = gridColor(threshold);

  const steps = [
    {
      label: "Location",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>GridWise uses your postcode to show regional grid data — so your decisions reflect what's actually happening on your local grid.</p>
          <div>
            <label style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 2, display: "block", marginBottom: 8 }}>POSTCODE</label>
            <input value={postcode} onChange={e => setPostcode(e.target.value.toUpperCase())} placeholder="e.g. SW1A" maxLength={4}
              style={{ width: "100%", padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: `1px solid ${postcode.length >= 2 ? "rgba(34,211,165,0.4)" : "rgba(255,255,255,0.1)"}`, color: "#e2e8f0", fontFamily: "monospace", fontSize: 20, outline: "none", letterSpacing: 4, textAlign: "center", transition: "border-color 0.3s" }} />
          </div>
          {postcode.length >= 2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(34,211,165,0.06)", border: "1px solid rgba(34,211,165,0.2)", animation: "fadeUp 0.3s ease" }}>
              <span style={{ color: "#22d3a5" }}>✓</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>GridWise will show regional grid data for <strong style={{ color: "#e2e8f0" }}>{postcode}</strong></span>
            </div>
          )}
        </div>
      ),
      canNext: postcode.length >= 2,
    },
    {
      label: "Connect Ohme",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px", borderRadius: 14, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>OH</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Ohme Home Pro</div>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>SIGN IN WITH YOUR OHME ACCOUNT</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>GridWise reads your charge level and sends start/pause commands on your behalf. Your credentials are never stored.</p>
          {[
            { label: "EMAIL", value: email, set: setEmail, type: "email", ph: "your@email.com" },
            { label: "PASSWORD", value: password, set: setPassword, type: "password", ph: "••••••••" },
          ].map(f => (
            <div key={f.label}>
              <label style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 2, display: "block", marginBottom: 6 }}>{f.label}</label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                style={{ width: "100%", padding: "13px 16px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontFamily: "monospace", fontSize: 13, outline: "none" }} />
            </div>
          ))}
          <button onClick={handleConnect} disabled={connecting || connected || !email || !password}
            style={{ padding: 14, borderRadius: 12, border: `1px solid ${connected ? "rgba(34,211,165,0.4)" : "rgba(59,130,246,0.3)"}`, cursor: "pointer", background: connected ? "rgba(34,211,165,0.1)" : "rgba(59,130,246,0.15)", color: connected ? "#22d3a5" : "#3b82f6", fontFamily: "monospace", fontSize: 10, letterSpacing: 2, fontWeight: 600, transition: "all 0.3s" }}>
            {connecting ? "CONNECTING..." : connected ? "✓ OHME CONNECTED" : "CONNECT OHME →"}
          </button>
        </div>
      ),
      canNext: connected,
    },
    {
      label: "Preferences",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>Set your threshold and target. GridWise handles everything else.</p>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Green threshold</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Only charge above this %</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: c, letterSpacing: -1, fontFamily: "'Syne', sans-serif" }}>{threshold}%</div>
            </div>
            <input type="range" min={40} max={90} step={5} value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: "100%", accentColor: c, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
              <span>40% — charge often</span><span>90% — very green only</span>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Charge target</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Stop charging when EV reaches</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#3b82f6", letterSpacing: -1, fontFamily: "'Syne', sans-serif" }}>{target}%</div>
            </div>
            <input type="range" min={50} max={100} step={5} value={target} onChange={e => setTarget(Number(e.target.value))} style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }} />
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 14, background: `${c}08`, border: `1px solid ${c}20` }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: `${c}bb`, letterSpacing: 2, marginBottom: 10 }}>GRIDWISE WILL AUTOMATICALLY</div>
            {[
              `Check the UK grid every 5 minutes`,
              `Start charging when grid is ${threshold}%+ green`,
              `Pause when grid drops below ${threshold}%`,
              `Stop when your EV reaches ${target}%`,
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                <span style={{ color: c, flexShrink: 0 }}>✓</span>{t}
              </div>
            ))}
          </div>
        </div>
      ),
      canNext: true,
    },
  ];

  const current = steps[step];

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", display: "flex", flexDirection: "column", fontFamily: "'Syne', sans-serif" }}>
      <div style={{ height: 3, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ height: "100%", width: `${((step + 1) / steps.length) * 100}%`, background: "linear-gradient(90deg, #22d3a5, #10b981)", transition: "width 0.5s ease", borderRadius: "0 2px 2px 0" }} />
      </div>
      <div style={{ flex: 1, maxWidth: 440, margin: "0 auto", width: "100%", padding: "32px 20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: 4, color: "rgba(255,255,255,0.2)", marginBottom: 8 }}>STEP {step + 1} OF {steps.length}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px" }}>Grid<span style={{ color: "#22d3a5" }}>Wise</span></h1>
          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{current.label}</div>
        </div>
        <div style={{ flex: 1 }}>{current.content}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: 15, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              BACK
            </button>
          )}
          <button onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onComplete({ postcode, threshold, target })}
            disabled={!current.canNext}
            style={{ flex: 2, padding: 15, borderRadius: 14, border: "none", cursor: current.canNext ? "pointer" : "not-allowed", background: current.canNext ? "linear-gradient(135deg, #22d3a5, #10b981)" : "rgba(255,255,255,0.05)", color: current.canNext ? "#07090f" : "rgba(255,255,255,0.2)", fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 800, boxShadow: current.canNext ? "0 8px 32px rgba(34,211,165,0.25)" : "none", transition: "all 0.3s" }}>
            {step < steps.length - 1 ? "CONTINUE →" : "ACTIVATE GRIDWISE →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
function HomeScreen({ config, onViewLog }) {
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const load = async () => {
      const data = await fetchGridData();
      if (data) { setGrid(data); setLastCheck(new Date()); }
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 300_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setOhme(o => o.isCharging && o.chargeLevel < o.targetLevel ? { ...o, chargeLevel: Math.min(o.targetLevel, o.chargeLevel + 1) } : o);
      setTicker(t => t + 1);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!grid || manualOverride) return;
    const d = shouldCharge(grid.greenPct, config.threshold, ohme.chargeLevel, config.target);
    setDecision(d);
    setOhme(o => {
      if (d.charge !== o.isCharging) {
        addLog(d.charge ? "started" : "paused", d.charge ? `Charging started — ${d.reason}` : `Charging paused — ${d.reason}`, grid.greenPct);
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

  const greenPct = grid?.greenPct ?? 0;
  const c = gridColor(greenPct);
  const evColor = "#3b82f6";
  const isCharging = ohme.isCharging;

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", fontFamily: "'Syne', sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Ambient background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-15%", left: "10%", width: 500, height: 500, background: `radial-gradient(circle, ${c}0d 0%, transparent 65%)`, transition: "background 3s ease" }} />
        <div style={{ position: "absolute", bottom: "0%", right: "-15%", width: 350, height: 350, background: "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", inset: 0, opacity: 0.02, backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 440, margin: "0 auto", padding: "24px 18px 48px" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 8, letterSpacing: 4, color: "rgba(255,255,255,0.2)", marginBottom: 4 }}>HOME ENERGY OS</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-1px" }}>Grid<span style={{ color: c, transition: "color 2s" }}>Wise</span></h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.2)", marginBottom: 3 }}>📍 {config.postcode}</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20,
              background: isCharging ? `${evColor}15` : "rgba(255,255,255,0.04)",
              border: `1px solid ${isCharging ? `${evColor}40` : "rgba(255,255,255,0.08)"}`,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: isCharging ? evColor : "rgba(255,255,255,0.2)", animation: isCharging ? "glow 1.5s infinite" : "none" }} />
              <span style={{ fontFamily: "monospace", fontSize: 8, color: isCharging ? evColor : "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
                {isCharging ? "CHARGING" : "STANDBY"}
              </span>
            </div>
          </div>
        </div>

        {/* ── HERO CARD: Big green number ── */}
        <div style={{
          background: "rgba(255,255,255,0.025)", border: `1px solid ${c}25`,
          borderRadius: 24, padding: "20px 20px 16px", marginBottom: 12,
          position: "relative", overflow: "hidden",
          boxShadow: `0 0 60px ${c}08`,
          transition: "border-color 2s, box-shadow 2s",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 50%)", pointerEvents: "none" }} />

          {/* Big green number */}
          <GreenDisplay pct={greenPct} loading={loading} />

          {/* CO2 badge */}
          {grid && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                {grid.co2}g CO₂/kWh
              </div>
              <div style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>
                {grid.index}
              </div>
            </div>
          )}

          {/* Forecast timeline */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 2, marginBottom: 12 }}>8-HOUR FORECAST</div>
            {grid ? (
              <ForecastTimeline forecast={grid.forecast} threshold={config.threshold} />
            ) : (
              <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: 2 }}>LOADING FORECAST...</div>
              </div>
            )}
          </div>

          {/* Best window */}
          {grid?.bestWindow && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: `${c}08`, border: `1px solid ${c}20`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 8, color: `${c}99`, letterSpacing: 2, marginBottom: 2 }}>BEST WINDOW TODAY</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{grid.bestWindow.label}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: c, fontFamily: "'Syne', sans-serif" }}>{grid.bestWindow.green}%</div>
                <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.3)" }}>renewable</div>
              </div>
            </div>
          )}
        </div>

        {/* ── EV CHARGER CARD ── */}
        <div style={{
          background: isCharging ? `${evColor}08` : "rgba(255,255,255,0.02)",
          border: `1px solid ${isCharging ? `${evColor}30` : "rgba(255,255,255,0.07)"}`,
          borderRadius: 20, padding: "16px 18px", marginBottom: 12,
          transition: "all 0.5s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.25)", letterSpacing: 2, marginBottom: 3 }}>EV CHARGER · OHME HOME PRO</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {isCharging ? `Charging at ${ohme.powerKw}kW` : "Paused"}
              </div>
            </div>
            <EVBattery level={ohme.chargeLevel} isCharging={isCharging} color={evColor} />
          </div>

          {/* Decision reason */}
          {decision && grid && (
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "monospace", fontSize: 8, color: isCharging ? "#22d3a5" : "rgba(255,255,255,0.25)", letterSpacing: 2, marginBottom: 4 }}>
                {manualOverride ? "MANUAL OVERRIDE" : "GRIDWISE DECISION"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>{decision.reason}</div>
            </div>
          )}

          {/* Progress to target */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.25)" }}>PROGRESS TO TARGET</span>
              <span style={{ fontFamily: "monospace", fontSize: 8, color: evColor }}>{ohme.chargeLevel}% → {config.target}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${(ohme.chargeLevel / config.target) * 100}%`, background: `linear-gradient(90deg, ${evColor}80, ${evColor})`, borderRadius: 2, transition: "width 1s ease" }} />
            </div>
          </div>
        </div>

        {/* ── CONTROLS ROW ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {/* Manual override */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Manual control</div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 12, lineHeight: 1.3 }}>
              {manualOverride ? "Auto paused" : "Auto active"}
            </div>
            <button onClick={toggleManual} style={{
              width: "100%", padding: "8px", borderRadius: 10, border: "none", cursor: "pointer",
              background: manualOverride ? "rgba(248,112,96,0.15)" : "rgba(34,211,165,0.1)",
              color: manualOverride ? "#f87060" : "#22d3a5",
              fontFamily: "monospace", fontSize: 9, letterSpacing: 1, fontWeight: 600,
              border: `1px solid ${manualOverride ? "rgba(248,112,96,0.3)" : "rgba(34,211,165,0.2)"}`,
            }}>
              {manualOverride ? "RESUME AUTO" : "OVERRIDE"}
            </button>
          </div>

          {/* Last check */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Grid check</div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 12, lineHeight: 1.3 }}>
              {lastCheck.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ padding: "8px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>EVERY 5 MIN</span>
            </div>
          </div>
        </div>

        {/* ── ACTIVITY ── */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>RECENT ACTIVITY</div>
            <button onClick={onViewLog} style={{ background: "none", border: "none", fontFamily: "monospace", fontSize: 9, color: c, cursor: "pointer", letterSpacing: 1 }}>VIEW ALL →</button>
          </div>
          {logs.slice(0, 3).map(l => <LogItem key={l.id} log={l} color={c} />)}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, textAlign: "center", fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.1)", letterSpacing: 2 }}>
          NATIONAL GRID ESO · LIVE DATA · 5 MIN REFRESH
        </div>
      </div>
    </div>
  );
}

// ─── LOG SCREEN ───────────────────────────────────────────────────────────────
function LogScreen({ onBack, grid }) {
  const c = gridColor(grid?.greenPct ?? 0);
  const logs = [
    { id: 1, type: "started", message: "Charging started — grid 82% green, above 70% threshold", time: "2:14am", greenPct: 82 },
    { id: 2, type: "paused",  message: "Charging paused — grid dropped to 58%, below threshold",  time: "4:30am", greenPct: 58 },
    { id: 3, type: "started", message: "Charging resumed — grid recovered to 76% green",          time: "5:15am", greenPct: 76 },
    { id: 4, type: "paused",  message: "Target 80% reached — charging complete",                  time: "6:44am", greenPct: 71 },
    { id: 5, type: "manual",  message: "Manual override activated",                               time: "Yesterday 11pm", greenPct: 44 },
    { id: 6, type: "started", message: "Charging started — grid 79% green",                      time: "Yesterday 1am", greenPct: 79 },
    { id: 7, type: "setup",   message: "GridWise activated — monitoring grid",                   time: "Yesterday",     greenPct: 0  },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", fontFamily: "'Syne', sans-serif" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "24px 18px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.2)", letterSpacing: 3, marginBottom: 2 }}>GRIDWISE</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px" }}>Activity Log</h2>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[["SESSIONS", "12"], ["GREEN RUNS", "9"], ["AVG GREEN", "76%"]].map(([l, v]) => (
            <div key={l} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, fontFamily: "'Syne', sans-serif" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, padding: "4px 16px" }}>
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

  useEffect(() => { fetchGridData().then(d => { if (d) setGrid(d); }); }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07090f; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes glow { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes chargePulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.15) } }
        input[type=range] { -webkit-appearance: none; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: currentColor; cursor: pointer; box-shadow: 0 0 10px currentColor; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
      {screen === "setup" && <SetupScreen onComplete={cfg => { setConfig(cfg); setScreen("home"); }} />}
      {screen === "home" && config && <HomeScreen config={config} onViewLog={() => setScreen("log")} />}
      {screen === "log" && <LogScreen onBack={() => setScreen("home")} grid={grid} />}
    </>
  );
}
