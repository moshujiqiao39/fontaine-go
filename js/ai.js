(function (root, factory) {
  const engine = (typeof root !== "undefined" && root.GoEngine) || require("./engine");
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoAI = api;
})(typeof self !== "undefined" ? self : this, function (Engine) {
  const BLACK = Engine.BLACK;
  const WHITE = Engine.WHITE;
  const EMPTY = Engine.EMPTY;

  const RANKS = [];
  for (let k = 18; k >= 1; k--) RANKS.push({ id: k + "k", label: k + "级" });
  ["一段", "二段", "三段", "四段", "五段", "六段", "七段", "八段", "九段"].forEach(function (label, i) {
    RANKS.push({ id: i + 1 + "d", label: label });
  });

  function profileFor(rankIndex, size) {
    const rank = Math.max(0, Math.min(26, rankIndex));
    let ply = 0;
    if (rank >= 26) ply = 7;
    else if (rank >= 24) ply = 6;
    else if (rank >= 22) ply = 5;
    else if (rank >= 14) ply = 4;
    else if (rank >= 8) ply = 3;
    else if (rank >= 3) ply = 2;
    else if (rank >= 1) ply = 1;
    let width = rank >= 22 ? 8 : rank >= 14 ? 7 : rank >= 8 ? 6 : 5;
    if (size >= 19) width = Math.min(width, ply >= 7 ? 5 : ply >= 6 ? 7 : ply >= 5 ? 7 : 6);
    return {
      blunder: rank <= 2 ? 0.55 - rank * 0.08 : rank <= 8 ? 0.28 - (rank - 2) * 0.025 : rank <= 17 ? Math.max(0.02, 0.08 - (rank - 8) * 0.006) : 0,
      blunderPool: rank < 6 ? 4 : 2,
      missTactics: rank < 2 ? 0.45 : rank < 8 ? 0.12 : 0,
      seeLadder: rank >= 8,
      seeEyes: rank >= 1,
      readKill: rank >= 8,
      ply: ply,
      width: width,
      noise: rank < 6 ? 5 : rank < 16 ? 0.7 : 0,
      opening: rank >= 1,
      contactPenalty: rank >= 14 ? 34 : rank >= 6 ? 24 : 8,
      capture: rank >= 18 ? 180 : 120,
      atari: rank >= 18 ? 48 : 30,
      atariStone: rank >= 18 ? 9 : 4,
      killDepth: rank >= 26 ? 6 : rank >= 24 ? 5 : rank >= 22 ? 4 : rank >= 14 ? 3 : 2,
      q: rank >= 26 ? 4 : rank >= 24 ? 4 : rank >= 22 ? 3 : rank >= 8 ? 2 : 0,
      seeSacrifice: rank >= 6,
      seeKo: rank >= 6,
      sente: rank >= 8 ? 22 : rank >= 3 ? 8 : 0,
      budget: size >= 19 ? (rank >= 26 ? 36000 : rank >= 24 ? 28000 : rank >= 22 ? 18000 : rank >= 14 ? 9000 : rank >= 8 ? 4000 : 900) : (rank >= 26 ? 42000 : rank >= 24 ? 32000 : rank >= 22 ? 22000 : rank >= 14 ? 12000 : 5000),
    };
  }

  function starPoints(size) {
    if (size === 19) return [3, 9, 15];
    if (size === 13) return [3, 6, 9];
    if (size === 9) return [2, 4, 6];
    return [size >> 1];
  }

  function cornerReach(size) {
    if (size >= 19) return 5;
    if (size >= 13) return 4;
    return 2;
  }

  function cornerKey(size, x, y) {
    const reach = cornerReach(size);
    const lx = x < size / 2 ? x : size - 1 - x;
    const ly = y < size / 2 ? y : size - 1 - y;
    if (lx > reach || ly > reach) return -1;
    return (x * 2 >= size ? 1 : 0) + (y * 2 >= size ? 2 : 0);
  }

  function emptyCornerKeys(board, size) {
    const taken = [false, false, false, false];
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue;
      const key = cornerKey(size, i % size, (i / size) | 0);
      if (key >= 0) taken[key] = true;
    }
    const empty = [];
    for (let k = 0; k < 4; k++) if (!taken[k]) empty.push(k);
    return empty;
  }

  function openingPointsForCorner(size, key) {
    const originX = key & 1 ? size - 1 : 0;
    const originY = key & 2 ? size - 1 : 0;
    const sx = originX === 0 ? 1 : -1;
    const sy = originY === 0 ? 1 : -1;
    const minD = 2;
    const maxD = size >= 13 ? 4 : 2;
    const points = [];
    for (let dx = minD; dx <= maxD; dx++) {
      for (let dy = minD; dy <= maxD; dy++) {
        if (size >= 13 && dx === maxD && dy === maxD) continue;
        const x = originX + sx * dx;
        const y = originY + sy * dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        points.push(y * size + x);
      }
    }
    return points;
  }

  function isStandardOpening(size, x, y) {
    const lx = Math.min(x, size - 1 - x);
    const ly = Math.min(y, size - 1 - y);
    const maxD = size >= 13 ? 4 : 2;
    if (lx < 2 || ly < 2 || lx > maxD || ly > maxD) return false;
    if (size >= 13 && lx === maxD && ly === maxD) return false;
    return cornerKey(size, x, y) >= 0;
  }

  function candidates(board, size, color, ko, profile) {
    const total = size * size;
    let stones = 0;
    const near = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (!board[i]) continue;
      stones++;
      const x = i % size;
      const y = (i / size) | 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          near[ny * size + nx] = 1;
        }
      }
    }
    const list = [];
    const radius = profile.local ? 2 : (profile.ply >= 2 ? 3 : 2);
    if (stones > 0 && radius > 2) {
      for (let i = 0; i < total; i++) {
        if (!board[i]) continue;
        const x = i % size;
        const y = (i / size) | 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            near[ny * size + nx] = 1;
          }
        }
      }
    }
    if (stones === 0) {
      const lines = starPoints(size);
      for (let a = 0; a < lines.length; a++) {
        for (let b = 0; b < lines.length; b++) list.push(lines[b] * size + lines[a]);
      }
      list.push((size >> 1) * size + (size >> 1));
      return unique(list);
    }
    if (ko >= 0) {
      const snap = Engine.placeStone(board, size, ko % size, (ko / size) | 0, color, ko);
      if (snap && snap.captured >= 2) list.push(ko);
    }
    for (let i = 0; i < total; i++) {
      if (board[i] === EMPTY && near[i] && i !== ko) list.push(i);
    }
    if (profile.opening && !profile.local && stones > 0 && stones < (size >= 19 ? 20 : 10)) {
      const empty = emptyCornerKeys(board, size);
      for (let e = 0; e < empty.length; e++) {
        const pts = openingPointsForCorner(size, empty[e]);
        for (let p = 0; p < pts.length; p++) {
          if (board[pts[p]] === EMPTY && pts[p] !== ko) list.push(pts[p]);
        }
      }
      const lines = size >= 13 ? [2, 3] : [2];
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (let t = 2; t < size - 2; t++) {
          const pts = [line * size + t, (size - 1 - line) * size + t, t * size + line, t * size + (size - 1 - line)];
          for (let p = 0; p < pts.length; p++) {
            if (board[pts[p]] === EMPTY && pts[p] !== ko) list.push(pts[p]);
          }
        }
      }
    }
    if (profile.blunder > 0.35) {
      let extra = 0;
      for (let n = 0; n < 12 && extra < 4; n++) {
        const i = (Math.random() * total) | 0;
        if (board[i] === EMPTY && i !== ko) {
          list.push(i);
          extra++;
        }
      }
    }
    return unique(list);
  }

  function unique(list) {
    const seen = Object.create(null);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (!seen[list[i]]) {
        seen[list[i]] = 1;
        out.push(list[i]);
      }
    }
    return out;
  }

  function sacrificeNet(boardAfter, size, index, color, koAfter) {
    const self = Engine.collectGroup(boardAfter, size, index, null);
    if (!self.stones.length || self.libs !== 1) return 0;
    const lib = self.libPoints[0];
    const opp = Engine.other(color);
    const taken = Engine.placeStone(boardAfter, size, lib % size, (lib / size) | 0, opp, koAfter);
    if (!taken || taken.captured < 1) return 0;
    const capturer = Engine.collectGroup(taken.board, size, lib, null);
    if (capturer.color !== opp || capturer.libs !== 1) return 0;
    const back = capturer.libPoints[0];
    const recapture = Engine.placeStone(taken.board, size, back % size, (back / size) | 0, color, taken.ko);
    if (!recapture) return 0;
    const mine = Engine.collectGroup(recapture.board, size, back, null);
    const risk = mine.libs <= 1 ? mine.stones.length : 0;
    return recapture.captured - risk - taken.captured;
  }

  function koThreat(board, size, color, ko) {
    const opp = Engine.other(color);
    const groups = Engine.allGroups(board, size);
    let best = null;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.color !== opp || group.libs < 1 || group.libs > 2) continue;
      for (let L = 0; L < group.libPoints.length; L++) {
        const lib = group.libPoints[L];
        if (lib === ko) continue;
        const placed = Engine.placeStone(board, size, lib % size, (lib / size) | 0, color, ko);
        if (!placed) continue;
        const self = Engine.collectGroup(placed.board, size, lib, null);
        if (self.libs <= 1 && placed.captured === 0) continue;
        let threat = placed.captured * 3;
        const seen = new Uint8Array(size * size);
        const around = Engine.neighbors(size, lib);
        for (let n = 0; n < around.length; n++) {
          const j = around[n];
          if (placed.board[j] === opp && !seen[j]) {
            const after = Engine.collectGroup(placed.board, size, j, seen);
            if (after.libs === 1) threat += after.stones.length * 2;
          }
        }
        if (threat < 2) continue;
        if (!best || threat > best.threat) best = { index: lib, threat: threat };
      }
    }
    return best ? best.index : null;
  }

  function globalFocus(board, size, color) {
    const bonus = new Int16Array(board.length);
    const groups = Engine.allGroups(board, size);
    const own = [];
    const enemy = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.libs < 1 || group.libs > 4 || group.stones.length < 2) continue;
      const item = { libs: group.libs, stones: group.stones.length, points: group.libPoints };
      if (group.color === color) own.push(item);
      else enemy.push(item);
    }
    function mark(list, weight) {
      list.sort(function (a, b) { return a.libs - b.libs || b.stones - a.stones; });
      const n = Math.min(3, list.length);
      for (let i = 0; i < n; i++) {
        const group = list[i];
        const add = weight + group.stones * 4 + (4 - group.libs) * 8;
        for (let p = 0; p < group.points.length; p++) bonus[group.points[p]] += add;
      }
    }
    mark(own, 26);
    mark(enemy, 20);
    return bonus;
  }

  function scoreMove(board, size, index, color, ko, profile, stoneCount) {
    const x = index % size;
    const y = (index / size) | 0;
    if (profile.seeEyes && Engine.isEye(board, size, index, color)) return -400;
    const placed = Engine.placeStone(board, size, x, y, color, ko);
    if (!placed) return -1e9;
    let score = placed.captured * (profile.capture || 110);
    if (placed.captured > 0 && profile.dead) {
      let doomed = 0;
      for (let c = 0; c < placed.capturedPoints.length; c++) {
        if (profile.dead[placed.capturedPoints[c]]) doomed++;
      }
      if (doomed) score -= doomed * ((profile.capture || 120) - 6);
    }
    const self = Engine.collectGroup(placed.board, size, index, null);
    let sacrifice = 0;
    if (self.libs <= 1 && placed.captured === 0 && profile.seeSacrifice) {
      sacrifice = sacrificeNet(placed.board, size, index, color, placed.ko);
    }
    if (sacrifice > 0) score += sacrifice * (profile.capture || 120) + 40;
    else if (self.libs <= 1) score -= 70 + self.stones.length * 6;
    else if (self.libs === 2) score += 6;
    else score += 10 + Math.min(self.libs, 5);

    const opp = Engine.other(color);
    const seen = new Uint8Array(size * size);
    const around = Engine.neighbors(size, index);
    let threatened = 0;
    let threatenedStones = 0;
    for (let n = 0; n < around.length; n++) {
      const j = around[n];
      if (placed.board[j] === opp && !seen[j]) {
        const g = Engine.collectGroup(placed.board, size, j, seen);
        if (g.libs === 1) {
          threatened++;
          threatenedStones += g.stones.length;
          score += (profile.atari || 28) + g.stones.length * (profile.atariStone || 4);
        } else if (g.libs === 2) score += 6;
      }
    }
    if (threatenedStones > 0 && self.libs >= 2 && profile.sente) score += profile.sente + threatenedStones * 6;
    if (profile.focus) score += profile.focus[index] || 0;

    let friendly = 0;
    let enemy = 0;
    for (let n = 0; n < around.length; n++) {
      const v = board[around[n]];
      if (v === color) friendly++;
      else if (v === opp) enemy++;
    }
    score += friendly * 4 + enemy * 3;
    if (placed.captured === 0 && friendly > 0) {
      const touched = new Uint8Array(size * size);
      let groupsTouched = 0;
      for (let n = 0; n < around.length; n++) {
        const j = around[n];
        if (board[j] === color && !touched[j]) {
          groupsTouched++;
          Engine.collectGroup(board, size, j, touched);
        }
      }
      if (groupsTouched >= 2) score += 18;
    }
    if (friendly >= 3 && enemy === 0 && placed.captured === 0) score -= 8;
    if (placed.captured === 0 && threatened === 0 && self.libs >= 2 && profile.seeEyes) {
      if (enemy === 0 && friendly >= 1) score -= 36;
      else if (friendly > 0 && enemy > 0) score -= 18;
    }

    let nearOpp = 99;
    let nearOwn = 99;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const v = board[ny * size + nx];
        if (!v) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (v === opp && dist < nearOpp) nearOpp = dist;
        if (v === color && dist < nearOwn) nearOwn = dist;
      }
    }
    const early = stoneCount < (size >= 19 ? 30 : 16);
    if (early && profile.opening && placed.captured === 0 && threatened === 0) {
      const empty = emptyCornerKeys(board, size);
      const key = cornerKey(size, x, y);
      const line = Math.min(x, y, size - 1 - x, size - 1 - y) + 1;
      if (empty.length) {
        if (key >= 0 && empty.indexOf(key) >= 0 && isStandardOpening(size, x, y)) score += 110;
        else if (nearOpp <= 4) score -= 120;
        else score -= 24;
      } else if (nearOpp === 1) {
        score -= profile.contactPenalty;
      } else if (nearOpp === 3 || nearOpp === 4) {
        score += 12;
      }
      if (nearOwn === 1) score -= 32;
      else if (nearOwn === 3 || nearOwn === 4) score += 24;
      if (line === 4) score += 16;
      else if (line === 3) score += 12;
      else if (line <= 2) score -= 36;
    } else if (!profile.opening && stoneCount < 8) {
      score -= Math.min(x, y, size - 1 - x, size - 1 - y);
    }

    if (profile.seeEyes && !profile.local && self.stones.length >= 4 && self.libs >= 2) {
      let eyesBefore = 0;
      const touched = new Uint8Array(size * size);
      for (let n = 0; n < around.length; n++) {
        const j = around[n];
        if (board[j] === color && !touched[j]) {
          const prev = Engine.collectGroup(board, size, j, touched);
          const prevEyes = Engine.eyeCount(board, size, prev);
          if (prevEyes > eyesBefore) eyesBefore = prevEyes;
        }
      }
      const eyesNow = Engine.eyeCount(placed.board, size, self);
      if (eyesNow >= 2 && eyesBefore < 2) score += 150;
      else if (eyesNow > eyesBefore) score += 28;
    }

    if (profile.seeLadder && placed.captured === 0) {
      const chased = Engine.collectGroup(placed.board, size, index, null);
      if (chased.libs === 1) {
        const works = ladderWorks(placed.board, size, index, opp);
        if (works) score -= 80;
      }
    }

    score += (Math.random() - 0.5) * profile.noise;
    return score;
  }

  function ladderWorks(board, size, stoneIndex, attacker) {
    let b = board.slice();
    const defender = b[stoneIndex];
    if (!defender) return false;
    for (let step = 0; step < 16; step++) {
      const group = Engine.collectGroup(b, size, stoneIndex, null);
      if (!group.stones.length || b[group.stones[0]] !== defender) return true;
      if (group.libs >= 2) return false;
      if (group.libs === 0) return true;
      const atkAt = group.libPoints[0];
      const ax = atkAt % size;
      const ay = (atkAt / size) | 0;
      const hit = Engine.placeStone(b, size, ax, ay, attacker, -1);
      if (!hit) return false;
      b = hit.board;
      if (!b[stoneIndex]) return true;
      const after = Engine.collectGroup(b, size, stoneIndex, null);
      if (after.libs >= 2) return false;
      if (after.libs === 0) return true;
      const esc = after.libPoints[0];
      const ex = esc % size;
      const ey = (esc / size) | 0;
      const run = Engine.placeStone(b, size, ex, ey, defender, -1);
      if (!run) return true;
      b = run.board;
      stoneIndex = esc;
    }
    return false;
  }

  function urgent(board, size, color, ko, profile) {
    if (Math.random() < profile.missTactics) return null;
    const groups = Engine.allGroups(board, size);
    let bestCapture = null;
    let bestSave = null;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.libs !== 1) continue;
      const point = g.libPoints[0];
      const x = point % size;
      const y = (point / size) | 0;
      if (g.color !== color) {
        if (profile.dead && stonesAreDead(profile.dead, g.stones)) continue;
        const placed = Engine.placeStone(board, size, x, y, color, ko);
        if (!placed) continue;
        const self = Engine.collectGroup(placed.board, size, point, null);
        const gain = placed.captured - (self.libs <= 1 ? self.stones.length : 0);
        if (!bestCapture || gain > bestCapture.gain) bestCapture = { index: point, gain: gain };
      } else {
        const placed = Engine.placeStone(board, size, x, y, color, ko);
        if (!placed) continue;
        const self = Engine.collectGroup(placed.board, size, point, null);
        const safety = self.libs * 10 - (placed.captured < 0 ? 0 : 0);
        if (self.libs >= 2 || placed.captured > 0) {
          if (!bestSave || safety > bestSave.safety) bestSave = { index: point, safety: safety, libs: self.libs };
        }
      }
    }
    const minGain = profile.seeSacrifice ? 2 : 1;
    if (bestCapture && bestCapture.gain >= minGain) return bestCapture.index;
    if (bestSave && bestSave.libs >= 2) return bestSave.index;
    return null;
  }

  function rankedMoves(board, size, color, ko, profile, stoneCount) {
    const list = candidates(board, size, color, ko, profile);
    if (profile.search) profile.search.nodes += list.length;
    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const s = scoreMove(board, size, list[i], color, ko, profile, stoneCount);
      if (s > -1e8) scored.push({ index: list[i], score: s });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  function stoneLeft(board, stones) {
    for (let i = 0; i < stones.length; i++) {
      if (board[stones[i]]) return stones[i];
    }
    return -1;
  }

  function capturesGroup(board, size, color, ko, stones, index, depth, maxDepth) {
    if (maxDepth == null) maxDepth = 2;
    const placed = Engine.placeStone(board, size, index % size, (index / size) | 0, color, ko);
    if (!placed) return false;
    const left = stoneLeft(placed.board, stones);
    if (left < 0) return true;
    if (depth >= maxDepth) return false;
    const group = Engine.collectGroup(placed.board, size, left, null);
    if (group.libs === 0) return true;
    if (group.libs > 2) return false;
    const opp = Engine.other(color);
    for (let i = 0; i < group.libPoints.length; i++) {
      const lib = group.libPoints[i];
      const reply = Engine.placeStone(placed.board, size, lib % size, (lib / size) | 0, opp, placed.ko);
      if (!reply) return true;
      const remain = stoneLeft(reply.board, stones);
      if (remain < 0) return false;
      const after = Engine.collectGroup(reply.board, size, remain, null);
      if (after.libs === 0) continue;
      if (after.libs === 1) {
        if (!capturesGroup(reply.board, size, color, reply.ko, stones, after.libPoints[0], depth + 1, maxDepth)) return false;
        continue;
      }
      let finished = false;
      if (depth < (maxDepth >= 5 ? 3 : 2) && depth + 1 < maxDepth) {
        for (let k = 0; k < after.libPoints.length; k++) {
          if (capturesGroup(reply.board, size, color, reply.ko, stones, after.libPoints[k], depth + 1, maxDepth)) {
            finished = true;
            break;
          }
        }
      }
      if (!finished) return false;
    }
    return group.libPoints.length > 0;
  }

  function stonesAreDead(dead, stones) {
    for (let i = 0; i < stones.length; i++) {
      if (!dead[stones[i]]) return false;
    }
    return stones.length > 0;
  }

  function areaLead(board, size, color) {
    const sc = Engine.scorePosition(board, size, Engine.suggestDead(board, size));
    const lead = sc.black - sc.white;
    return color === BLACK ? lead : -lead;
  }

  function findKill(board, size, color, ko, maxDepth, dead) {
    const groups = Engine.allGroups(board, size);
    let best = null;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.color === color || group.libs < 1 || group.libs > 2 || group.stones.length > 7) continue;
      if (dead && stonesAreDead(dead, group.stones)) continue;
      for (let L = 0; L < group.libPoints.length; L++) {
        const start = group.libPoints[L];
        if (start === ko) continue;
        if (!capturesGroup(board, size, color, ko, group.stones, start, 0, maxDepth || 2)) continue;
        if (!best || group.stones.length > best.gain) best = { index: start, gain: group.stones.length };
      }
    }
    return best;
  }

  const BOOK = [
    { stones: [[3, 3, "O"]], move: [5, 2], loose: true },
    { stones: [[3, 3, "S"], [5, 2, "O"]], move: [2, 5], loose: true },
    { stones: [[3, 3, "O"], [5, 2, "S"], [2, 5, "O"]], move: [8, 2], loose: true },
    { stones: [[3, 3, "S"], [2, 2, "O"]], move: [2, 3], loose: false },
    { stones: [[3, 3, "O"], [2, 2, "S"], [2, 3, "O"]], move: [2, 1], loose: false },
    { stones: [[3, 3, "S"], [2, 2, "O"], [2, 3, "S"], [2, 1, "O"]], move: [3, 2], loose: false },
    { stones: [[3, 3, "S"], [5, 2, "O"], [2, 5, "O"]], move: [2, 2], loose: false },
    { stones: [[3, 2, "O"]], move: [5, 3], loose: true },
    { stones: [[3, 2, "S"], [5, 3, "O"]], move: [2, 4], loose: true },
    { stones: [[3, 2, "S"], [5, 2, "O"]], move: [4, 2], loose: false },
    { stones: [[3, 2, "O"], [5, 2, "S"], [4, 2, "O"]], move: [4, 1], loose: false },
    { stones: [[3, 2, "S"], [5, 2, "O"], [4, 2, "S"], [4, 1, "O"]], move: [4, 3], loose: false },
    { stones: [[3, 2, "O"], [5, 2, "S"], [4, 2, "O"], [4, 1, "S"], [4, 3, "O"]], move: [7, 2], loose: true },
  ];

  function cornerRoom(board, size, x, y) {
    let near = 0;
    const span = 5;
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (board[ny * size + nx]) near++;
      }
    }
    return near;
  }

  function matchBook(board, size, color, ko, ox, oy, sx, sy, pattern) {
    const box = 6;
    const need = Object.create(null);
    for (let i = 0; i < pattern.stones.length; i++) {
      const stone = pattern.stones[i];
      const x = ox + sx * stone[0];
      const y = oy + sy * stone[1];
      if (x < 0 || y < 0 || x >= size || y >= size) return null;
      need[y * size + x] = stone[2] === "S" ? color : Engine.other(color);
    }
    for (let ly = 0; ly < box; ly++) {
      for (let lx = 0; lx < box; lx++) {
        const x = ox + sx * lx;
        const y = oy + sy * ly;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const idx = y * size + x;
        if ((board[idx] || 0) !== (need[idx] || 0)) return null;
      }
    }
    const mx = ox + sx * pattern.move[0];
    const my = oy + sy * pattern.move[1];
    if (mx < 0 || my < 0 || mx >= size || my >= size || my * size + mx === ko) return null;
    if (!Engine.placeStone(board, size, mx, my, color, ko)) return null;
    return my * size + mx;
  }

  function josekiMove(board, size, color, ko, allowLoose) {
    if (size < 13) return null;
    const corners = [
      [0, 0, 1, 1],
      [size - 1, 0, -1, 1],
      [0, size - 1, 1, -1],
      [size - 1, size - 1, -1, -1],
    ];
    let best = null;
    let bestRank = -1;
    let bestRoom = 1e9;
    for (let c = 0; c < corners.length; c++) {
      const ox = corners[c][0];
      const oy = corners[c][1];
      const sx = corners[c][2];
      const sy = corners[c][3];
      for (let p = 0; p < BOOK.length; p++) {
        const pattern = BOOK[p];
        if (pattern.loose && !allowLoose) continue;
        const mirrors = [
          pattern,
          {
            stones: pattern.stones.map(function (s) { return [s[1], s[0], s[2]]; }),
            move: [pattern.move[1], pattern.move[0]],
            loose: pattern.loose,
          },
        ];
        for (let m = 0; m < mirrors.length; m++) {
          const hit = matchBook(board, size, color, ko, ox, oy, sx, sy, mirrors[m]);
          if (hit == null) continue;
          const room = cornerRoom(board, size, hit % size, (hit / size) | 0);
          const rank = (pattern.loose ? 0 : 2) + (pattern.stones.length >= 2 ? 1 : 0);
          if (rank > bestRank || (rank === bestRank && room < bestRoom)) {
            bestRank = rank;
            bestRoom = room;
            best = hit;
          }
        }
      }
    }
    return best;
  }

  function hasContact(board, size, color) {
    const opp = Engine.other(color);
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== color) continue;
      const x = i % size;
      const y = (i / size) | 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (board[ny * size + nx] === opp) return true;
        }
      }
    }
    return false;
  }

  function sideClear(board, size, x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (board[ny * size + nx]) return false;
      }
    }
    return true;
  }

  function fusekiMove(board, size, color, ko) {
    if (size < 13) return null;
    const lines = starPoints(size);
    const edge = lines[0];
    const mid = lines[1];
    const far = lines[2];
    const ends = [
      [edge, edge, far, edge, mid, edge],
      [edge, far, far, far, mid, far],
      [edge, edge, edge, far, edge, mid],
      [far, edge, far, far, far, mid],
    ];
    for (let i = 0; i < ends.length; i++) {
      const a = ends[i][1] * size + ends[i][0];
      const b = ends[i][3] * size + ends[i][2];
      const x = ends[i][4];
      const y = ends[i][5];
      if (board[a] !== color || board[b] !== color) continue;
      if (board[y * size + x] || y * size + x === ko || !sideClear(board, size, x, y)) continue;
      if (Engine.placeStone(board, size, x, y, color, ko)) return y * size + x;
    }
    if (size < 19) return null;
    const families = [
      [[3, 2], [15, 2], [3, 16], [15, 16]],
      [[2, 3], [16, 3], [2, 15], [16, 15]],
    ];
    const sideOf = {
      "3,2": [3, 9],
      "15,2": [15, 9],
      "3,16": [3, 9],
      "15,16": [15, 9],
      "2,3": [9, 3],
      "16,3": [9, 3],
      "2,15": [9, 15],
      "16,15": [9, 15],
    };
    for (let f = 0; f < families.length; f++) {
      const points = families[f];
      let owned = 0;
      const missing = [];
      for (let i = 0; i < points.length; i++) {
        const x = points[i][0];
        const y = points[i][1];
        const v = board[y * size + x];
        if (v === color) owned++;
        else if (!v) missing.push(points[i]);
      }
      if (owned >= 2) {
        for (let i = 0; i < missing.length; i++) {
          const x = missing[i][0];
          const y = missing[i][1];
          const key = cornerKey(size, x, y);
          if (key < 0 || emptyCornerKeys(board, size).indexOf(key) < 0) continue;
          if (y * size + x === ko || !sideClear(board, size, x, y)) continue;
          if (Engine.placeStone(board, size, x, y, color, ko)) return y * size + x;
        }
      } else if (owned === 1) {
        for (let i = 0; i < points.length; i++) {
          const x = points[i][0];
          const y = points[i][1];
          if (board[y * size + x] !== color) continue;
          const side = sideOf[x + "," + y];
          const sx = side[0];
          const sy = side[1];
          if (board[sy * size + sx] || sy * size + sx === ko || !sideClear(board, size, sx, sy)) continue;
          if (Engine.placeStone(board, size, sx, sy, color, ko)) return sy * size + sx;
        }
      }
    }
    return null;
  }

  function chooseOnBoard(board, size, color, ko, rankIndex, stoneCount) {
    const profile = profileFor(rankIndex, size);
    const openingPhase = profile.opening && stoneCount < (size >= 19 ? 12 : 8) && emptyCornerKeys(board, size).length > 0;
    if (openingPhase && rankIndex >= 8 && profile.ply < 2) profile.ply = 2;
    if (rankIndex >= 8 && !openingPhase && stoneCount >= 12) profile.dead = Engine.suggestDead(board, size);
    if (ko >= 0) {
      const snap = Engine.placeStone(board, size, ko % size, (ko / size) | 0, color, ko);
      if (snap && snap.captured >= 2) return ko;
    }
    if (profile.readKill && Math.random() >= profile.missTactics) {
      const kill = findKill(board, size, color, ko, profile.killDepth, profile.dead);
      const oppKill = findKill(board, size, Engine.other(color), -1, profile.killDepth, null);
      if (oppKill) {
        const placed = Engine.placeStone(board, size, oppKill.index % size, (oppKill.index / size) | 0, color, ko);
        if (placed) return oppKill.index;
      }
      if (kill && kill.gain >= 1) return kill.index;
    }
    if (ko >= 0 && profile.seeKo && Math.random() >= profile.missTactics) {
      const threat = koThreat(board, size, color, ko);
      if (threat != null) return threat;
    }

    const tactical = urgent(board, size, color, ko, profile);
    if (tactical != null && Math.random() > profile.blunder * 0.35) return tactical;

    if (rankIndex >= 8 || Math.random() > 0.55) {
      const contact = josekiMove(board, size, color, ko, false);
      if (contact != null) return contact;
    }
    if (rankIndex >= 14 && stoneCount < (size >= 19 ? 22 : 12) && !hasContact(board, size, color)) {
      const famous = fusekiMove(board, size, color, ko);
      if (famous != null) return famous;
    }
    if (rankIndex >= 8 || Math.random() > 0.55) {
      const book = josekiMove(board, size, color, ko, emptyCornerKeys(board, size).length === 0);
      if (book != null) return book;
    }

    if (rankIndex >= 4 && !openingPhase && stoneCount >= 10) profile.focus = globalFocus(board, size, color);

    let scored = rankedMoves(board, size, color, ko, profile, stoneCount);
    if (!scored.length) return null;

    if (profile.dead && rankIndex >= 8) {
      const before = areaLead(board, size, color);
      const considered = Math.min(profile.width, scored.length);
      for (let i = 0; i < considered; i++) {
        const idx = scored[i].index;
        const placed = Engine.placeStone(board, size, idx % size, (idx / size) | 0, color, ko);
        if (!placed) continue;
        scored[i].score += (areaLead(placed.board, size, color) - before) * 8;
      }
      scored.sort(function (a, b) { return b.score - a.score; });
    }

    if (profile.ply >= 1) {
      profile.search = { nodes: 0, budget: profile.budget || 2000 };
      const quiet = shallowProfile(profile);
      const limit = Math.min(profile.width, scored.length);
      const depth = Math.max(0, profile.ply - 1);
      let alpha = -1e9;
      for (let i = 0; i < limit; i++) {
        if (profile.search.nodes > profile.search.budget) break;
        const move = scored[i];
        const x = move.index % size;
        const y = (move.index / size) | 0;
        const placed = Engine.placeStone(board, size, x, y, color, ko);
        if (!placed) continue;
        const reply = readScore(placed.board, size, Engine.other(color), placed.ko, quiet, stoneCount + 1, depth, Math.max(3, profile.width - 1), (move.score - alpha) / 0.85);
        move.score -= reply * 0.82;
        if (move.score > alpha) alpha = move.score;
      }
      scored = scored.slice(0, limit).sort(function (a, b) { return b.score - a.score; });
    }

    if (!scored.length) return null;
    if (Math.random() < profile.blunder) {
      const pool = scored.slice(0, Math.min(profile.blunderPool, scored.length));
      return pool[(Math.random() * pool.length) | 0].index;
    }
    return scored[0].index;
  }

  function shallowProfile(profile) {
    return {
      blunder: 0,
      blunderPool: 2,
      missTactics: 1,
      seeLadder: false,
      seeEyes: true,
      readKill: false,
      ply: 0,
      width: 4,
      noise: 0,
      opening: false,
      local: true,
      q: profile.q || 0,
      search: profile.search || null,
      contactPenalty: profile.contactPenalty || 16,
      capture: profile.capture || 120,
      atari: profile.atari || 30,
      atariStone: profile.atariStone || 4,
    };
  }

  function readScore(board, size, color, ko, profile, stoneCount, depth, width, beta) {
    const moves = rankedMoves(board, size, color, ko, profile, stoneCount);
    if (!moves.length) return 0;
    const search = profile.search;
    if (search && search.nodes > search.budget) return moves[0].score;
    if (depth <= 0) return horizon(board, size, color, ko, profile, stoneCount, moves);
    const limit = Math.min(width, moves.length);
    let best = -1e9;
    const opp = Engine.other(color);
    for (let i = 0; i < limit; i++) {
      if (search && search.nodes > search.budget) break;
      const idx = moves[i].index;
      const placed = Engine.placeStone(board, size, idx % size, (idx / size) | 0, color, ko);
      if (!placed) continue;
      const replyBeta = beta == null ? null : (moves[i].score - beta) / 0.85;
      const reply = readScore(placed.board, size, opp, placed.ko, profile, stoneCount + 1, depth - 1, Math.max(2, width - 1), replyBeta);
      const value = moves[i].score - reply * 0.85;
      if (value > best) best = value;
      if (beta != null && best >= beta) return best;
    }
    return best > -1e8 ? best : 0;
  }

  function horizon(board, size, color, ko, profile, stoneCount, moves) {
    if (!moves.length) return 0;
    if (!profile.q || moves[0].score < 70) return moves[0].score;
    let best = moves[0].score;
    const opp = Engine.other(color);
    const child = shallowProfile(profile);
    child.q = profile.q - 1;
    const limit = Math.min(2, moves.length);
    for (let i = 0; i < limit; i++) {
      if (moves[i].score < 70) break;
      if (profile.search && profile.search.nodes > profile.search.budget) break;
      const idx = moves[i].index;
      const placed = Engine.placeStone(board, size, idx % size, (idx / size) | 0, color, ko);
      if (!placed) continue;
      const reply = readScore(placed.board, size, opp, placed.ko, child, stoneCount + 1, 0, 2, null);
      const value = moves[i].score - reply * 0.85;
      if (value > best) best = value;
    }
    return best;
  }

  function chooseShallow(board, size, color, ko, profile, stoneCount) {
    const replies = rankedMoves(board, size, color, ko, shallowProfile(profile), stoneCount);
    if (!replies.length) return null;
    const top = replies[0];
    const x = top.index % size;
    const y = (top.index / size) | 0;
    const placed = Engine.placeStone(board, size, x, y, color, ko);
    if (!placed) return null;
    const counter = rankedMoves(placed.board, size, Engine.other(color), placed.ko, shallowProfile(profile), stoneCount + 1);
    const counterScore = counter.length ? counter[0].score : 0;
    return { index: top.index, score: top.score - counterScore * 0.8 };
  }

  function chooseMove(game, rankIndex) {
    let index = chooseOnBoard(game.board, game.size, game.turn, game.ko, rankIndex, game.stoneCount());
    if (index == null) {
      for (let i = 0; i < game.board.length; i++) {
        if (game.board[i]) continue;
        if (Engine.placeStone(game.board, game.size, i % game.size, (i / game.size) | 0, game.turn, game.ko)) {
          index = i;
          break;
        }
      }
    }
    if (index == null) return { pass: true };
    return { pass: false, x: index % game.size, y: (index / game.size) | 0 };
  }

  function shiftRank(index, margin) {
    let delta = 0;
    const m = margin;
    if (m >= 40) delta = 10;
    else if (m >= 25) delta = 7;
    else if (m >= 12) delta = 4;
    else if (m >= 4) delta = 2;
    else if (m > -4) delta = 0;
    else if (m > -12) delta = -2;
    else if (m > -25) delta = -4;
    else if (m > -40) delta = -7;
    else delta = -10;
    return Math.max(0, Math.min(RANKS.length - 1, index + delta));
  }

  return {
    RANKS: RANKS,
    profileFor: profileFor,
    chooseMove: chooseMove,
    shiftRank: shiftRank,
  };
});
