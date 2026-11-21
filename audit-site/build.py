import re, sys
h = open("src-index.html").read()
def sub(old, new, count=1):
    global h
    assert h.count(old) == count, (h.count(old), old[:80])
    h = h.replace(old, new)

sub('<meta name=viewport', '<meta name="robots" content="noindex, nofollow"><meta name=viewport')

# --- server persistence instead of window.claude db ---
start = h.index('  const connect = async () => {')
end = h.index('  // ---------- rendering ----------')
h = h[:start] + '''  // Per-case merge: keep whichever version of a case was saved last.
  const mergeLabels = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b || {})) {
      if (!out[k] || String(v?.at || "") >= String(out[k]?.at || "")) out[k] = v;
    }
    return out;
  };
  const makeRef = () => ({
    set: async (doc) => {
      const r = await fetch("/api/labels", {
        method: "PUT", headers: { "content-type": "application/json" }, keepalive: true,
        body: JSON.stringify({ annotator: doc.annotator, labels: doc.labels }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
    },
  });
  const connect = async (code) => {
    state.ref = makeRef();
    try {
      const get = fetch("/api/labels?annotator=" + encodeURIComponent(code), { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
      const data = await Promise.race([get, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000))]);
      return { annotator: code, labels: data.labels || {} };
    } catch { return null; }
  };

''' + h[end:]

sub('''      else setStatus("Could not save to the shared store; kept in this browser", true);''',
    '''      else setStatus("Could not reach the server; kept in this browser and retried on the next save", true);''')

# --- start(): load this annotator's answers from the server first ---
sub('  const start = () => {', '  const start = async () => {')
sub('''    state.annotator = code;
    state.order = seededOrder''', '''    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) { $("annotator").focus(); setStatus("Use letters, digits, - or _ only (max 12)", true); return; }
    if (code !== state.annotator) state.labels = {};
    state.annotator = code;
    $("startBtn").disabled = true; setStatus("Loading your answers…");
    const remote = await connect(code);
    $("startBtn").disabled = false;
    if (remote) { state.labels = mergeLabels(state.labels, remote.labels); setStatus(Object.keys(remote.labels).length ? "Answers restored" : "Ready"); }
    else setStatus("Could not reach the server; answers are kept in this browser for now", true);
    writeLocal();
    state.order = seededOrder''')
sub('''    if (!Object.keys(state.labels).length) persist();
  };''', '''    persist();
  };''')

# --- boot: nothing to connect until the annotator enters a code ---
sub('''    setStatus("Connecting…");
    const remote = await connect();
    if (remote) {
      if (remote.annotator) state.annotator = remote.annotator;
      state.labels = { ...state.labels, ...(remote.labels || {}) };
      setStatus(Object.keys(state.labels).length ? "Answers restored" : "Ready");
    } else {
      setStatus("Saved in this browser only — use “Copy my answers” when done", true);
    }''', '''    setStatus("Enter your code to start");''')

# --- wording ---
sub('Answers save automatically; you can stop and come back.</p>',
    'Answers save automatically to the study server. You can stop and come back at any time, on any device: just enter the same annotator code.</p>')
sub('<p id="exportHint">If the status above says answers are kept only in this browser, copy them and send them to the study author.</p>',
    '<p id="exportHint">Your answers are stored on the study server, so there is nothing to send. If the status above ever showed a save error, also download your answers and email the file to the study author.</p>')
sub('<button class="btn" type="button" id="copyBtn">Copy my answers</button>',
    '<button class="btn" type="button" id="downloadBtn">Download my answers</button>\n      <button class="btn" type="button" id="copyBtn">Copy my answers</button>')
sub('$("copyBtn").addEventListener("click"', '''$("downloadBtn").addEventListener("click", () => {
    saveCurrent();
    const blob = new Blob([JSON.stringify({ annotator: state.annotator, exportedAt: new Date().toISOString(), labels: state.labels }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sparql-audit-${state.annotator || "annotator"}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveCurrent(); });
  $("copyBtn").addEventListener("click"''')
open("public/index.html", "w").write(h)
