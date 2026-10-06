(function () {
  const E = window.GoEngine;
  const AI = window.GoAI;
  const PZ = window.GoProblems;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const controls = document.getElementById("controls");
  const banner = document.getElementById("banner");
  const blackSide = document.getElementById("black-side");
  const whiteSide = document.getElementById("white-side");
  const turnInfo = document.getElementById("turn-info");

  const images = { 1: new Image(), 2: new Image() };
  images[1].src = "assets/black.png";
  images[2].src = "assets/white.png";
  images[1].onload = images[2].onload = function () { draw(); };

  const state = {
    mode: "vs",
    game: null,
    size: 19,
    userColor: E.BLACK,
    rankIndex: 8,
    phase: "idle",
    dead: null,
    thinking: false,
    hover: null,
    hint: null,
    puzzleIndex: 0,
    puzzleFilter: "all",
    puzzleStep: 0,
    puzzleLock: false,
    note: "",
    exam: null,
  };

  try {
    const saved = JSON.parse(localStorage.getItem("fontaine-go") || "{}");
    if (typeof saved.rankIndex === "number") state.rankIndex = saved.rankIndex;
    if (typeof saved.size === "number") state.size = saved.size;
    if (saved.userColor === 1 || saved.userColor === 2) state.userColor = saved.userColor;
  } catch (err) { /* keep defaults */ }

  function savePrefs() {
    localStorage.setItem("fontaine-go", JSON.stringify({
      rankIndex: state.rankIndex,
      size: state.size,
      userColor: state.userColor,
    }));
  }

  function nameOf(color) {
    return color === E.BLACK ? "那维莱特" : "莱欧斯利";
  }

  function fmt(n) {
    return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
  }

  function currentSize() {
    if (state.game) return state.game.size;
    if (state.mode === "exam") return 9;
    if (state.mode === "puzzle") return PZ.PROBLEMS[state.puzzleIndex].size;
    return state.size;
  }

  function tap() {
    try {
      const ac = tap.ctx || new AudioContext();
      tap.ctx = ac;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = 480;
      gain.gain.value = 0.035;
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.07);
      osc.stop(ac.currentTime + 0.08);
    } catch (err) { /* autoplay restrictions */ }
  }

  let view = null;

  function geometry() {
    const frame = canvas.parentElement.clientWidth - 24;
    const frameTop = canvas.parentElement.getBoundingClientRect().top;
    const cap = Math.max(300, Math.min(720, window.innerHeight - frameTop - 28));
    const css = Math.max(280, Math.min(frame, cap));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = currentSize();
    const pixelW = Math.round(css * dpr);
    if (view && view.css === css && view.dpr === dpr && view.size === size && canvas.width === pixelW) return view;
    canvas.style.width = css + "px";
    canvas.style.height = css + "px";
    canvas.width = pixelW;
    canvas.height = pixelW;
    const pad = Math.max(26, css * 0.07);
    const gap = (css - pad * 2) / (size - 1);
    view = { css: css, dpr: dpr, size: size, pad: pad, gap: gap };
    return view;
  }

  function pointAt(geom, x, y) {
    return [geom.pad + x * geom.gap, geom.pad + y * geom.gap];
  }

  function nearest(px, py, geom) {
    let best = null;
    let bestDist = geom.gap * 0.48;
    for (let y = 0; y < geom.size; y++) {
      for (let x = 0; x < geom.size; x++) {
        const p = pointAt(geom, x, y);
        const d = Math.hypot(p[0] - px, p[1] - py);
        if (d < bestDist) {
          bestDist = d;
          best = { x: x, y: y };
        }
      }
    }
    return best;
  }

  function starList(size) {
    function grid(lines) {
      const out = [];
      lines.forEach(function (y) {
        lines.forEach(function (x) { out.push([x, y]); });
      });
      return out;
    }
    if (size === 19) return grid([3, 9, 15]);
    if (size === 13) return grid([3, 6, 9]);
    if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    const mid = size >> 1;
    return [[mid, mid]];
  }

  function drawStone(geom, x, y, color, alpha) {
    const p = pointAt(geom, x, y);
    const r = geom.gap * 0.48;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
    const img = images[color];
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, p[0] - r, p[1] - r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = color === E.BLACK ? "#1b2438" : "#f7f4ee";
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const geom = geometry();
    ctx.setTransform(geom.dpr, 0, 0, geom.dpr, 0, 0);
    const wood = ctx.createLinearGradient(0, 0, geom.css, geom.css);
    wood.addColorStop(0, "#f0cb88");
    wood.addColorStop(0.5, "#e2b56a");
    wood.addColorStop(1, "#c99645");
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, geom.css, geom.css);

    ctx.strokeStyle = "#3a2614";
    ctx.lineWidth = Math.max(1, geom.gap * 0.045);
    ctx.beginPath();
    for (let i = 0; i < geom.size; i++) {
      const a = pointAt(geom, i, 0);
      const b = pointAt(geom, i, geom.size - 1);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      const c = pointAt(geom, 0, i);
      const d = pointAt(geom, geom.size - 1, i);
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();

    ctx.fillStyle = "#3a2614";
    starList(geom.size).forEach(function (star) {
      const p = pointAt(geom, star[0], star[1]);
      ctx.beginPath();
      ctx.arc(p[0], p[1], Math.max(2.5, geom.gap * 0.12), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#5a3d22";
    ctx.font = Math.max(10, geom.gap * 0.34) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let x = 0; x < geom.size; x++) {
      const p = pointAt(geom, x, 0);
      const label = E.colName(x);
      ctx.fillText(label, p[0], geom.pad * 0.42);
      ctx.fillText(label, p[0], geom.css - geom.pad * 0.42);
    }
    for (let y = 0; y < geom.size; y++) {
      const p = pointAt(geom, 0, y);
      const label = String(geom.size - y);
      ctx.fillText(label, geom.pad * 0.42, p[1]);
      ctx.fillText(label, geom.css - geom.pad * 0.42, p[1]);
    }

    const game = state.game;
    if (!game) return;

    for (let y = 0; y < game.size; y++) {
      for (let x = 0; x < game.size; x++) {
        const v = game.board[y * game.size + x];
        if (!v) continue;
        const dead = state.phase === "score" && state.dead && state.dead[y * game.size + x];
        drawStone(geom, x, y, v, dead ? 0.28 : 1);
        if (dead) {
          const p = pointAt(geom, x, y);
          ctx.strokeStyle = "#8d1d1d";
          ctx.lineWidth = 2;
          const m = geom.gap * 0.16;
          ctx.beginPath();
          ctx.moveTo(p[0] - m, p[1] - m);
          ctx.lineTo(p[0] + m, p[1] + m);
          ctx.moveTo(p[0] + m, p[1] - m);
          ctx.lineTo(p[0] - m, p[1] + m);
          ctx.stroke();
        }
      }
    }

    if (state.hover && state.phase === "play" && !state.thinking && !state.puzzleLock) {
      const color = game.turn;
      const can = (state.mode === "local" || state.mode === "puzzle" || color === state.userColor);
      if (can && E.placeStone(game.board, game.size, state.hover.x, state.hover.y, color, game.ko)) {
        drawStone(geom, state.hover.x, state.hover.y, color, 0.45);
      }
    }

    if (state.hint) {
      const p = pointAt(geom, state.hint[0], state.hint[1]);
      ctx.strokeStyle = "#8a5a12";
      ctx.lineWidth = 2;
      ctx.strokeRect(p[0] - 7, p[1] - 7, 14, 14);
    }

    const last = game.lastMove;
    if (last && !last.pass) {
      const p = pointAt(geom, last.x, last.y);
      ctx.beginPath();
      ctx.arc(p[0], p[1], geom.gap * 0.52, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 214, 102, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function scoreNow() {
    return E.scorePosition(state.game.board, state.game.size, state.dead);
  }

  function renderStatus() {
    const game = state.game;
    blackSide.innerHTML = '<img src="assets/black.png" alt=""> <span><strong>那维莱特</strong> 提 ' + (game ? game.captured[E.BLACK] : 0) + "</span>";
    whiteSide.innerHTML = '<img src="assets/white.png" alt=""> <span><strong>莱欧斯利</strong> 提 ' + (game ? game.captured[E.WHITE] : 0) + "</span>";
    if (!game || state.phase === "idle") {
      turnInfo.textContent = "准备下棋";
      banner.hidden = true;
      return;
    }
    if (state.thinking) turnInfo.textContent = "对方在想…";
    else if (state.phase === "score") turnInfo.textContent = "终局数子";
    else turnInfo.textContent = "轮到" + nameOf(game.turn);
    if (state.phase === "score" && state.dead) {
      const sc = scoreNow();
      banner.hidden = false;
      banner.textContent = "那维莱特 " + fmt(sc.black) + " 目　莱欧斯利 " + fmt(sc.white) + " 目（已含贴 7.5）　点棋块可改死活";
    } else if (state.note) {
      banner.hidden = false;
      banner.textContent = state.note;
    } else {
      banner.hidden = true;
    }
  }

  function setNote(text) {
    state.note = text || "";
    renderStatus();
  }

  function renderControls() {
    const ranks = AI.RANKS.map(function (rank, i) {
      return '<option value="' + i + '"' + (i === state.rankIndex ? " selected" : "") + ">" + rank.label + "</option>";
    }).join("");
    let html = "";
    if (state.mode === "vs") {
      html = [
        field("棋盘", '<select id="size"><option value="9">9 路</option><option value="13">13 路</option><option value="19">19 路</option></select>'),
        field("对手难度", '<select id="rank">' + ranks + "</select>"),
        field("我方", '<select id="color"><option value="1">那维莱特（黑，先手）</option><option value="2">莱欧斯利（白）</option></select>'),
        '<button type="button" class="primary" id="start">开始对局</button>',
        state.phase === "score" ? "" : playActions(),
        '<p class="help">中国规则，黑先，白贴 7.5 目。段位越高，越会算吃子、征子、死活和数子。下完点「数子」，也可以认输。</p>',
      ].join("");
    } else if (state.mode === "exam") {
      const meta = state.exam
        ? "第 " + state.exam.gameNo + " / 2 局，当前对手 " + AI.RANKS[state.exam.rankIndex].label
        : "共两局 9 路棋。你执黑，从 10 级开始，按胜负调整对手。";
      html = '<p class="help">' + meta + "</p>";
      if (state.phase === "result" && state.exam && state.exam.done) {
        html += '<div class="result-card"><p>估算等级</p><h2>' + AI.RANKS[state.exam.rankIndex].label + "</h2><p class=\"help\">" +
          state.exam.summary + '</p><button type="button" class="primary" id="start">再测一次</button></div>';
      } else {
        html += '<button type="button" class="primary" id="start">' + (state.exam ? "重新测评" : "开始测评") + "</button>";
        if (state.phase !== "score") {
          html += '<div class="actions"><button type="button" id="resign">认输</button><button type="button" id="count">数子</button></div>';
        }
        html += '<p class="help">测评中不能悔棋。局面定了点「数子」，确认后再进入下一局。</p>';
      }
    } else if (state.mode === "puzzle") {
      const problem = PZ.PROBLEMS[state.puzzleIndex];
      const hands = Math.ceil(problem.line.length / 2);
      const shown = puzzleIndices();
      const options = shown.map(function (i) {
        const item = PZ.PROBLEMS[i];
        return '<option value="' + i + '"' + (i === state.puzzleIndex ? " selected" : "") + ">" + item.rank + " · " + item.title + "</option>";
      }).join("");
      html = [
        '<div class="puzzle-head"><h2>' + problem.title + '</h2><span class="badge">' + problem.rank + " · " + hands + " 手</span></div>",
        '<p class="help">' + problem.text + "</p>",
        field("分段", '<select id="filter"><option value="all">全部</option><option value="low">18级到10级</option><option value="high">9级到1级</option><option value="dan">一段到九段</option></select>'),
        field("题目", '<select id="puzzle">' + options + "</select>"),
        '<div class="actions"><button type="button" id="prev">上一题</button><button type="button" id="next">下一题</button><button type="button" id="reset">重来</button><button type="button" id="hint">提示</button></div>',
        '<p class="note ' + (state.puzzleLock === "good" ? "good" : state.puzzleLock === "bad" ? "bad" : "") + '">' + (state.note || "黑先。点对的交叉点。") + "</p>",
      ].join("");
    } else {
      html = [
        field("棋盘", '<select id="size"><option value="9">9 路</option><option value="13">13 路</option><option value="19">19 路</option></select>'),
        '<button type="button" class="primary" id="start">开始双人对局</button>',
        state.phase === "score" ? "" : playActions(),
        '<p class="help">两个人用这一台设备轮流下。先手是那维莱特，后手是莱欧斯利。不用联网。</p>',
      ].join("");
    }
    if (state.phase === "score") {
      const sc = scoreNow();
      const lead = sc.winner === E.BLACK ? "那维莱特胜 " + fmt(sc.margin) + " 目" : "莱欧斯利胜 " + fmt(-sc.margin) + " 目";
      html += '<p class="score-line">' + lead + "</p>";
      html += '<div class="stack"><button type="button" class="primary" id="confirm">确认结果</button><button type="button" id="resume">继续下</button></div>';
    }
    controls.innerHTML = html;
    const sizeSel = document.getElementById("size");
    if (sizeSel) sizeSel.value = String(state.size);
    const colorSel = document.getElementById("color");
    if (colorSel) colorSel.value = String(state.userColor);
    const filterSel = document.getElementById("filter");
    if (filterSel) filterSel.value = state.puzzleFilter;
    bindControls();
  }

  function puzzleBand(rank) {
    if (rank.indexOf("段") >= 0) return "dan";
    const n = parseInt(rank, 10);
    return n >= 10 ? "low" : "high";
  }

  function puzzleIndices() {
    const out = [];
    for (let i = 0; i < PZ.PROBLEMS.length; i++) {
      if (state.puzzleFilter === "all" || puzzleBand(PZ.PROBLEMS[i].rank) === state.puzzleFilter) out.push(i);
    }
    return out.length ? out : [0];
  }

  function stepPuzzle(dir) {
    const ids = puzzleIndices();
    let pos = ids.indexOf(state.puzzleIndex);
    if (pos < 0) pos = dir > 0 ? -1 : 0;
    pos = (pos + dir + ids.length) % ids.length;
    openPuzzle(ids[pos]);
  }

  function field(label, inner) {
    return '<div class="field"><label>' + label + "</label>" + inner + "</div>";
  }

  function playActions() {
    return '<div class="actions three"><button type="button" id="undo">悔棋</button><button type="button" id="resign">认输</button><button type="button" id="count">数子</button></div>';
  }

  function bindControls() {
    const start = document.getElementById("start");
    if (start) start.onclick = begin;
    on("size", "change", function (el) { state.size = Number(el.value); savePrefs(); if (!state.game) draw(); });
    on("rank", "change", function (el) { state.rankIndex = Number(el.value); savePrefs(); });
    on("color", "change", function (el) { state.userColor = Number(el.value); savePrefs(); });
    on("undo", "click", undo);
    on("resign", "click", resign);
    on("count", "click", function () { if (guardPlay()) enterScore(); });
    on("confirm", "click", confirmScore);
    on("resume", "click", resume);
    on("filter", "change", function (el) {
      state.puzzleFilter = el.value;
      const ids = puzzleIndices();
      openPuzzle(ids.indexOf(state.puzzleIndex) < 0 ? ids[0] : state.puzzleIndex);
    });
    on("puzzle", "change", function (el) { openPuzzle(Number(el.value)); });
    on("prev", "click", function () { stepPuzzle(-1); });
    on("next", "click", function () { stepPuzzle(1); });
    on("reset", "click", function () { openPuzzle(state.puzzleIndex); });
    on("hint", "click", showHint);
  }

  function on(id, type, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(type, function () { fn(el); });
  }

  function begin() {
    state.thinking = false;
    state.hint = null;
    state.note = "";
    state.dead = null;
    if (state.mode === "exam") {
      state.exam = { gameNo: 1, rankIndex: 8, summary: "", done: false, parts: [] };
      state.userColor = E.BLACK;
      state.game = new E.Game(9);
    } else if (state.mode === "local") {
      state.game = new E.Game(state.size);
    } else if (state.mode === "vs") {
      state.game = new E.Game(state.size);
    }
    state.phase = "play";
    savePrefs();
    renderControls();
    renderStatus();
    draw();
    if (state.mode === "vs" && state.userColor === E.WHITE) scheduleAI();
  }

  function guardPlay() {
    return state.game && state.phase === "play" && !state.thinking && state.mode !== "puzzle";
  }

  function undo() {
    if (!state.game || state.thinking || state.phase !== "play" || state.mode === "exam" || state.mode === "puzzle") return;
    state.game.undo();
    if (state.mode === "vs" && state.game.turn !== state.userColor) state.game.undo();
    setNote("");
    renderStatus();
    draw();
    if (state.mode === "vs" && state.game.turn !== state.userColor) scheduleAI();
  }

  function resign() {
    if (!guardPlay()) return;
    const quitter = state.mode === "local" ? state.game.turn : state.userColor;
    if (state.mode === "exam") {
      finishExamGame(-80);
      return;
    }
    state.phase = "result";
    state.game.over = true;
    setNote(nameOf(quitter) + "认输，" + nameOf(E.other(quitter)) + "获胜");
    renderControls();
    draw();
  }

  function enterScore() {
    if (!state.game) return;
    state.phase = "score";
    state.thinking = false;
    state.dead = E.suggestDead(state.game.board, state.game.size);
    state.hint = null;
    renderControls();
    renderStatus();
    draw();
  }

  function resume() {
    if (!state.game) return;
    state.phase = "play";
    state.game.over = false;
    state.game.passes = 0;
    state.dead = null;
    setNote("");
    renderControls();
    renderStatus();
    draw();
  }

  function confirmScore() {
    if (state.phase !== "score") return;
    const sc = scoreNow();
    if (state.mode === "exam") {
      finishExamGame(sc.margin);
      return;
    }
    const text = sc.winner === E.BLACK
      ? "那维莱特胜 " + fmt(sc.margin) + " 目"
      : "莱欧斯利胜 " + fmt(-sc.margin) + " 目";
    state.phase = "result";
    setNote(text);
    renderControls();
  }

  function finishExamGame(margin) {
    const exam = state.exam;
    const opponent = AI.RANKS[exam.rankIndex].label;
    const phrase = margin > 0 ? "胜 " + fmt(margin) + " 目" : "负 " + fmt(-margin) + " 目";
    exam.parts.push("对 " + opponent + " " + phrase);
    exam.rankIndex = AI.shiftRank(exam.rankIndex, margin);
    if (exam.gameNo === 1) {
      exam.gameNo = 2;
      state.game = new E.Game(9);
      state.phase = "play";
      state.dead = null;
      setNote("第二局开始");
      renderControls();
      renderStatus();
      draw();
      return;
    }
    exam.done = true;
    exam.summary = exam.parts.join("。") + "。多下几盘，估计会更稳。";
    state.phase = "result";
    setNote("估算等级：" + AI.RANKS[exam.rankIndex].label);
    renderControls();
    renderStatus();
  }

  function scheduleAI() {
    if (!state.game || state.phase !== "play") return;
    if (state.mode === "local" || state.mode === "puzzle") return;
    if (state.game.turn === state.userColor) return;
    state.thinking = true;
    renderStatus();
    const rank = state.mode === "exam" ? state.exam.rankIndex : state.rankIndex;
    const game = state.game;
    setTimeout(function () {
      if (state.game !== game || state.phase !== "play") {
        state.thinking = false;
        return;
      }
      const move = AI.chooseMove(game, rank);
      const played = applyAIMove(game, move);
      state.thinking = false;
      if (!played || game.over) enterScore();
      else {
        renderStatus();
        draw();
      }
    }, 40);
  }

  function applyAIMove(game, move) {
    if (!move || move.pass) return false;
    if (game.play(move.x, move.y).ok) return true;
    for (let i = 0; i < game.board.length; i++) {
      if (game.board[i]) continue;
      if (game.play(i % game.size, (i / game.size) | 0).ok) return true;
    }
    return false;
  }

  function openPuzzle(index) {
    state.mode = "puzzle";
    state.puzzleIndex = index;
    state.puzzleStep = 0;
    state.puzzleLock = false;
    state.hint = null;
    const problem = PZ.PROBLEMS[index];
    const hands = Math.ceil(problem.line.length / 2);
    state.note = "黑先，共 " + hands + " 手。";
    state.puzzleBranches = (problem.branches || [problem.line]).slice();
    state.phase = "play";
    state.game = PZ.create(problem);
    renderControls();
    renderStatus();
    draw();
  }

  function showHint() {
    const problem = PZ.PROBLEMS[state.puzzleIndex];
    const line = (state.puzzleBranches && state.puzzleBranches[0]) || problem.line;
    if (state.puzzleStep >= line.length) return;
    const move = line[state.puzzleStep];
    state.hint = move;
    state.note = "看看 " + E.coordName(move[0], move[1], problem.size);
    renderControls();
    draw();
  }

  function puzzlePlay(x, y) {
    if (state.puzzleLock) return;
    const problem = PZ.PROBLEMS[state.puzzleIndex];
    const played = state.game.play(x, y);
    if (!played.ok) {
      state.note = "这里不能下";
      renderControls();
      return;
    }
    tap();
    state.hint = null;
    const matched = (state.puzzleBranches || [problem.line]).filter(function (line) {
      const mv = line[state.puzzleStep];
      return mv && mv[0] === x && mv[1] === y;
    });
    if (!matched.length) {
      state.puzzleLock = "bad";
      state.note = "不对。点「重来」再试，或看提示。";
      renderControls();
      renderStatus();
      draw();
      return;
    }
    state.puzzleBranches = matched;
    if (PZ.solved(state.game, problem)) {
      state.puzzleLock = "good";
      state.note = "做对了";
      renderControls();
      renderStatus();
      draw();
      return;
    }
    state.puzzleStep += 1;
    const active = state.puzzleBranches[0];
    if (!active || state.puzzleStep >= active.length) {
      state.puzzleLock = "bad";
      state.note = "这步之后没有走到目标。";
      renderControls();
      renderStatus();
      draw();
      return;
    }
    const reply = active[state.puzzleStep];
    if (!state.game.play(reply[0], reply[1]).ok) {
      state.puzzleLock = "bad";
      state.note = "这一路应手走不下去，请重来。";
      renderControls();
      renderStatus();
      draw();
      return;
    }
    state.puzzleStep += 1;
    state.puzzleBranches = state.puzzleBranches.filter(function (line) {
      const mv = line[state.puzzleStep - 1];
      return mv && mv[0] === reply[0] && mv[1] === reply[1];
    });
    if (!state.puzzleBranches.length) state.puzzleBranches = [active];
    if (PZ.solved(state.game, problem) || state.puzzleStep >= active.length) {
      state.puzzleLock = PZ.solved(state.game, problem) ? "good" : "bad";
      state.note = state.puzzleLock === "good" ? "做对了" : "这步之后没有走到目标。";
    } else {
      state.note = "白棋应了一手，请继续。";
    }
    renderControls();
    renderStatus();
    draw();
  }

  function onPoint(x, y) {
    if (!state.game || state.thinking) return;
    if (state.phase === "score") {
      const index = y * state.game.size + x;
      if (!state.game.board[index]) return;
      const group = E.collectGroup(state.game.board, state.game.size, index, null);
      const mark = state.dead[index] ? 0 : 1;
      for (let i = 0; i < group.stones.length; i++) state.dead[group.stones[i]] = mark;
      renderStatus();
      draw();
      renderControls();
      return;
    }
    if (state.phase !== "play") return;
    if (state.mode === "puzzle") {
      puzzlePlay(x, y);
      return;
    }
    if (state.mode !== "local" && state.game.turn !== state.userColor) return;
    const played = state.game.play(x, y);
    if (!played.ok) {
      setNote(played.reason === "ko" ? "劫争，这一手要隔一手才能提" : "这里不能下");
      return;
    }
    tap();
    setNote("");
    if (state.game.over) enterScore();
    else {
      renderStatus();
      draw();
      scheduleAI();
    }
  }

  canvas.addEventListener("pointermove", function (ev) {
    if (ev.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    const geom = geometry();
    state.hover = nearest(ev.clientX - rect.left, ev.clientY - rect.top, geom);
    draw();
  });

  canvas.addEventListener("pointerleave", function () {
    state.hover = null;
    draw();
  });

  canvas.addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    const geom = geometry();
    const rect = canvas.getBoundingClientRect();
    const hit = nearest(ev.clientX - rect.left, ev.clientY - rect.top, geom);
    if (hit) onPoint(hit.x, hit.y);
  });

  document.getElementById("tabs").addEventListener("click", function (ev) {
    const button = ev.target.closest("button");
    if (!button) return;
    state.mode = button.dataset.mode;
    state.game = null;
    state.phase = "idle";
    state.thinking = false;
    state.exam = null;
    state.note = "";
    state.hint = null;
    state.puzzleLock = false;
    document.querySelectorAll(".tabs button").forEach(function (el) {
      el.classList.toggle("active", el === button);
    });
    if (state.mode === "puzzle") openPuzzle(state.puzzleIndex);
    else {
      renderControls();
      renderStatus();
      draw();
    }
  });

  window.addEventListener("resize", draw);
  renderControls();
  renderStatus();
  draw();
})();
