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
    const t = Math.max(0, Math.min(26, rankIndex)) / 26;
    const blunder = t < 0.45 ? 0.75 * (1 - t / 0.45) : Math.max(0, 0.08 * (1 - (t - 0.45) / 0.55));
    let ply = rankIndex >= 22 ? 2 : rankIndex >= 11 ? 1 : 0;
    let width = Math.round(4 + t * 8);
    if (size >= 19 && ply === 2) {
      ply = 1;
      width = 8;
    }
    if (size >= 13 && ply === 2) width = 6;
    return {
      blunder: blunder,
      blunderPool: Math.max(2, Math.round(7 - t * 4)),
      missTactics: t < 0.5 ? 0.7 * (1 - t / 0.5) : Math.max(0, 0.06 * (1 - t)),
      seeLadder: rankIndex >= 12,
      seeEyes: rankIndex >= 6,
      ply: ply,
      width: width,
      noise: (1 - t) * (1 - t) * 22,
      passSlack: rankIndex >= 18 ? -1 : -28 - (17 - rankIndex) * 14,
      opening: rankIndex >= 7,
    };
  }

  function starPoints(size) {
    if (size === 19) return [3, 9, 15];
    if (size === 13) return [3, 6, 9];
    if (size === 9) return [2, 4, 6];
    return [size >> 1];
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
    if (stones === 0) {
      const lines = starPoints(size);
      for (let a = 0; a < lines.length; a++) {
        for (let b = 0; b < lines.length; b++) list.push(lines[b] * size + lines[a]);
      }
      list.push((size >> 1) * size + (size >> 1));
      return unique(list);
    }
    for (let i = 0; i < total; i++) {
      if (board[i] === EMPTY && near[i] && i !== ko) list.push(i);
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

  function scoreMove(board, size, index, color, ko, profile, stoneCount) {
    const x = index % size;
    const y = (index / size) | 0;
    if (profile.seeEyes && Engine.isEye(board, size, index, color)) return -400;
    const placed = Engine.placeStone(board, size, x, y, color, ko);
    if (!placed) return -1e9;
    let score = placed.captured * 110;
    const self = Engine.collectGroup(placed.board, size, index, null);
    if (self.libs <= 1) score -= 70 + self.stones.length * 6;
    else if (self.libs === 2) score += 6;
    else score += 10 + Math.min(self.libs, 5);

    const opp = Engine.other(color);
    const seen = new Uint8Array(size * size);
    const around = Engine.neighbors(size, index);
    let threatened = 0;
    for (let n = 0; n < around.length; n++) {
      const j = around[n];
      if (placed.board[j] === opp && !seen[j]) {
        const g = Engine.collectGroup(placed.board, size, j, seen);
        if (g.libs === 1) {
          threatened++;
          score += 28 + g.stones.length * 4;
        } else if (g.libs === 2) score += 6;
      }
    }

    let friendly = 0;
    let enemy = 0;
    for (let n = 0; n < around.length; n++) {
      const v = board[around[n]];
      if (v === color) friendly++;
      else if (v === opp) enemy++;
    }
    score += friendly * 4 + enemy * 3;
    if (friendly >= 3 && enemy === 0 && placed.captured === 0) score -= 8;
    if (placed.captured === 0 && threatened === 0 && self.libs >= 2 && profile.seeEyes) {
      if (enemy === 0 && friendly >= 1) score -= 36;
      else if (friendly > 0 && enemy > 0) score -= 18;
    }

    if (stoneCount < (size >= 19 ? 24 : 12) && profile.opening) {
      const line = Math.min(x, y, size - 1 - x, size - 1 - y) + 1;
      if (line === 4) score += 18;
      else if (line === 3) score += 14;
      else if (line <= 2) score -= 28;
      else if (line >= 7 && stoneCount < 8) score -= 6;
      const stars = starPoints(size);
      if (stars.indexOf(x) >= 0 && stars.indexOf(y) >= 0) score += 8;
    } else if (!profile.opening && stoneCount < 10) {
      score -= Math.min(x, y, size - 1 - x, size - 1 - y);
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
      if (point === ko) continue;
      const x = point % size;
      const y = (point / size) | 0;
      if (g.color !== color) {
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
    if (bestCapture && bestCapture.gain > 0) return bestCapture.index;
    if (bestSave && bestSave.libs >= 2) return bestSave.index;
    return null;
  }

  function rankedMoves(board, size, color, ko, profile, stoneCount) {
    const list = candidates(board, size, color, ko, profile);
    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const s = scoreMove(board, size, list[i], color, ko, profile, stoneCount);
      if (s > -1e8) scored.push({ index: list[i], score: s });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  function chooseOnBoard(board, size, color, ko, rankIndex, stoneCount) {
    const profile = profileFor(rankIndex, size);
    const tactical = urgent(board, size, color, ko, profile);
    if (tactical != null && Math.random() > profile.blunder * 0.35) return tactical;

    let scored = rankedMoves(board, size, color, ko, profile, stoneCount);
    if (!scored.length) return null;

    if (profile.ply >= 1) {
      const opp = Engine.other(color);
      const limit = Math.min(profile.width, scored.length);
      for (let i = 0; i < limit; i++) {
        const move = scored[i];
        const x = move.index % size;
        const y = (move.index / size) | 0;
        const placed = Engine.placeStone(board, size, x, y, color, ko);
        if (!placed) continue;
        let reply = -1e9;
        if (profile.ply >= 2) {
          const replyMove = chooseShallow(placed.board, size, opp, placed.ko, profile, stoneCount + 1);
          reply = replyMove ? replyMove.score : 0;
        } else {
          const replies = rankedMoves(placed.board, size, opp, placed.ko, shallowProfile(profile), stoneCount + 1);
          reply = replies.length ? replies[0].score : 0;
        }
        move.score -= reply * 0.82;
      }
      scored = scored.slice(0, limit).sort(function (a, b) { return b.score - a.score; });
    }

    if (!scored.length) return null;
    if (scored[0].score < profile.passSlack) return null;
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
      ply: 0,
      width: 4,
      noise: 0,
      passSlack: -400,
      opening: profile.opening,
    };
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
    const index = chooseOnBoard(game.board, game.size, game.turn, game.ko, rankIndex, game.stoneCount());
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
