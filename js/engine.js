(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const KOMI = 7.5;

  function other(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  function neighbors(size, index) {
    const x = index % size;
    const y = (index / size) | 0;
    const out = [];
    if (x > 0) out.push(index - 1);
    if (x < size - 1) out.push(index + 1);
    if (y > 0) out.push(index - size);
    if (y < size - 1) out.push(index + size);
    return out;
  }

  function keyOf(board) {
    let s = "";
    for (let i = 0; i < board.length; i++) s += board[i];
    return s;
  }

  function collectGroup(board, size, start, seenExternal) {
    const color = board[start];
    const seen = seenExternal || new Uint8Array(board.length);
    const stones = [];
    const libPoints = [];
    const libSeen = new Uint8Array(board.length);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      stones.push(i);
      const x = i % size;
      const y = (i / size) | 0;
      if (x > 0) visit(i - 1);
      if (x < size - 1) visit(i + 1);
      if (y > 0) visit(i - size);
      if (y < size - 1) visit(i + size);
    }
    return { stones, color, libs: libPoints.length, libPoints };

    function visit(j) {
      const v = board[j];
      if (v === EMPTY) {
        if (!libSeen[j]) {
          libSeen[j] = 1;
          libPoints.push(j);
        }
      } else if (v === color && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }

  function placeStone(board, size, x, y, color, ko) {
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    const index = y * size + x;
    if (board[index] !== EMPTY) return null;
    const next = board.slice();
    next[index] = color;
    const opp = other(color);
    const captured = [];
    const seen = new Uint8Array(size * size);
    const around = neighbors(size, index);
    for (let n = 0; n < around.length; n++) {
      const j = around[n];
      if (next[j] === opp && !seen[j]) {
        const group = collectGroup(next, size, j, seen);
        if (group.libs === 0) {
          for (let k = 0; k < group.stones.length; k++) {
            const s = group.stones[k];
            next[s] = EMPTY;
            captured.push(s);
          }
        }
      }
    }
    if (captured.length === 0) {
      const self = collectGroup(next, size, index, new Uint8Array(size * size));
      if (self.libs === 0) return null;
    } else if (ko === index && captured.length === 1) {
      return null;
    }
    return {
      board: next,
      captured: captured.length,
      capturedPoints: captured,
      ko: captured.length === 1 ? captured[0] : -1,
      index: index,
    };
  }

  function isEye(board, size, index, color) {
    if (board[index] !== EMPTY) return false;
    const x = index % size;
    const y = (index / size) | 0;
    const ns = neighbors(size, index);
    for (let i = 0; i < ns.length; i++) {
      if (board[ns[i]] !== color) return false;
    }
    const enemy = other(color);
    let opp = 0;
    let diagCount = 0;
    for (let dy = -1; dy <= 1; dy += 2) {
      for (let dx = -1; dx <= 1; dx += 2) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        diagCount++;
        if (board[ny * size + nx] === enemy) opp++;
      }
    }
    if (diagCount >= 4) return opp < 2;
    return opp < 1;
  }

  function allGroups(board, size) {
    const seen = new Uint8Array(board.length);
    const groups = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== EMPTY && !seen[i]) groups.push(collectGroup(board, size, i, seen));
    }
    return groups;
  }

  function exclusiveTerritory(board, size, group) {
    const seen = new Uint8Array(board.length);
    let area = 0;
    let regions = 0;
    for (let p = 0; p < group.libPoints.length; p++) {
      const start = group.libPoints[p];
      if (seen[start] || board[start] !== EMPTY) continue;
      const stack = [start];
      seen[start] = 1;
      let count = 0;
      let foreign = false;
      while (stack.length) {
        const i = stack.pop();
        count++;
        const ns = neighbors(size, i);
        for (let n = 0; n < ns.length; n++) {
          const j = ns[n];
          const v = board[j];
          if (v === EMPTY && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          } else if (v !== EMPTY && v !== group.color) {
            foreign = true;
          }
        }
      }
      if (!foreign) {
        area += count;
        if (count >= 2) regions++;
      }
    }
    return { area, regions };
  }

  function eyeCount(board, size, group) {
    let eyes = 0;
    for (let i = 0; i < group.libPoints.length; i++) {
      if (isEye(board, size, group.libPoints[i], group.color)) eyes++;
    }
    return eyes;
  }

  function fillingLoses(board, size, group, lib) {
    const color = group.color;
    const placed = placeStone(board, size, lib % size, (lib / size) | 0, color, -1);
    if (!placed) return true;
    if (placed.captured > 0) return false;
    const self = collectGroup(placed.board, size, lib, null);
    if (self.libs !== 1) return false;
    const back = self.libPoints[0];
    const reply = placeStone(placed.board, size, back % size, (back / size) | 0, other(color), placed.ko);
    if (!reply) return false;
    for (let i = 0; i < group.stones.length; i++) {
      if (reply.board[group.stones[i]]) return false;
    }
    return true;
  }

  function isMutual(board, size, group) {
    if (group.libs < 1 || group.libs > 3) return false;
    if (eyeCount(board, size, group) >= 1) return false;
    if (exclusiveTerritory(board, size, group).area > 0) return false;
    for (let i = 0; i < group.libPoints.length; i++) {
      if (!fillingLoses(board, size, group, group.libPoints[i])) return false;
    }
    return true;
  }

  function sharedOpponents(board, size, group) {
    const found = [];
    const seenStone = new Uint8Array(board.length);
    const seenEmpty = new Uint8Array(board.length);
    const stack = [];
    const opp = other(group.color);
    for (let p = 0; p < group.libPoints.length; p++) {
      seenEmpty[group.libPoints[p]] = 1;
      stack.push(group.libPoints[p]);
    }
    while (stack.length) {
      const i = stack.pop();
      const ns = neighbors(size, i);
      for (let n = 0; n < ns.length; n++) {
        const j = ns[n];
        if (board[j] === EMPTY && !seenEmpty[j]) {
          seenEmpty[j] = 1;
          stack.push(j);
        } else if (board[j] === opp && !seenStone[j]) {
          found.push(collectGroup(board, size, j, seenStone));
        }
      }
    }
    return found;
  }

  function suggestDead(board, size) {
    const dead = new Uint8Array(board.length);
    const groups = allGroups(board, size);
    const mutual = new Array(groups.length);
    const owner = new Int16Array(board.length);
    for (let i = 0; i < owner.length; i++) owner[i] = -1;
    for (let g = 0; g < groups.length; g++) {
      mutual[g] = isMutual(board, size, groups[g]);
      const stones = groups[g].stones;
      for (let i = 0; i < stones.length; i++) owner[stones[i]] = g;
    }
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const eyes = eyeCount(board, size, group);
      const territory = exclusiveTerritory(board, size, group);
      let seki = false;
      if (mutual[g]) {
        const partners = sharedOpponents(board, size, group);
        seki = partners.length > 0;
        for (let p = 0; p < partners.length; p++) {
          const idx = owner[partners[p].stones[0]];
          if (idx < 0 || !mutual[idx]) {
            seki = false;
            break;
          }
        }
      }
      const alive = eyes >= 2 || territory.area >= 8 || territory.regions >= 2 || seki;
      if (!alive && eyes === 0 && territory.area <= 4) {
        for (let i = 0; i < group.stones.length; i++) dead[group.stones[i]] = 1;
      }
    }
    return dead;
  }

  function scorePosition(board, size, dead) {
    const b = board.slice();
    if (dead) {
      for (let i = 0; i < b.length; i++) {
        if (dead[i]) b[i] = EMPTY;
      }
    }
    let black = 0;
    let white = 0;
    const seen = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) {
      if (b[i] === BLACK) black++;
      else if (b[i] === WHITE) white++;
      else if (!seen[i]) {
        const stack = [i];
        seen[i] = 1;
        const region = [];
        let touchBlack = false;
        let touchWhite = false;
        while (stack.length) {
          const p = stack.pop();
          region.push(p);
          const ns = neighbors(size, p);
          for (let n = 0; n < ns.length; n++) {
            const j = ns[n];
            if (b[j] === EMPTY && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            } else if (b[j] === BLACK) touchBlack = true;
            else if (b[j] === WHITE) touchWhite = true;
          }
        }
        if (touchBlack && !touchWhite) black += region.length;
        else if (touchWhite && !touchBlack) white += region.length;
      }
    }
    const whiteScore = white + KOMI;
    return {
      black: black,
      white: whiteScore,
      margin: black - whiteScore,
      winner: black > whiteScore ? BLACK : WHITE,
      komi: KOMI,
    };
  }

  function ascii(board, size) {
    let text = "";
    for (let y = 0; y < size; y++) {
      let row = "";
      for (let x = 0; x < size; x++) {
        const v = board[y * size + x];
        row += v === BLACK ? "X" : v === WHITE ? "O" : ".";
      }
      text += row + "\n";
    }
    return text;
  }

  function colName(x) {
    let n = x;
    if (n >= 8) n += 1;
    return String.fromCharCode(65 + n);
  }

  function coordName(x, y, size) {
    return colName(x) + (size - y);
  }

  class Game {
    constructor(size) {
      this.size = size || 19;
      this.board = new Uint8Array(this.size * this.size);
      this.turn = BLACK;
      this.passes = 0;
      this.captured = [0, 0, 0];
      this.ko = -1;
      this.history = [];
      this.hashes = new Set();
      this.hashes.add(keyOf(this.board));
      this.lastMove = null;
      this.over = false;
    }

    static fromSetup(size, black, white, turn) {
      const game = new Game(size);
      for (let i = 0; i < black.length; i++) {
        const p = black[i];
        game.board[p[1] * size + p[0]] = BLACK;
      }
      for (let i = 0; i < white.length; i++) {
        const p = white[i];
        game.board[p[1] * size + p[0]] = WHITE;
      }
      game.turn = turn || BLACK;
      game.hashes = new Set([keyOf(game.board)]);
      return game;
    }

    snapshot() {
      return {
        board: this.board.slice(),
        turn: this.turn,
        passes: this.passes,
        captured: this.captured.slice(),
        ko: this.ko,
        lastMove: this.lastMove,
      };
    }

    play(x, y) {
      if (this.over) return { ok: false, reason: "over" };
      const placed = placeStone(this.board, this.size, x, y, this.turn, this.ko);
      if (!placed) return { ok: false, reason: "illegal" };
      const key = keyOf(placed.board);
      if (this.hashes.has(key)) return { ok: false, reason: "ko" };
      this.history.push(this.snapshot());
      this.captured[this.turn] += placed.captured;
      this.board = placed.board;
      this.ko = placed.ko;
      this.lastMove = { x: x, y: y, color: this.turn, pass: false };
      this.turn = other(this.turn);
      this.passes = 0;
      this.hashes.add(key);
      return { ok: true, captured: placed.captured };
    }

    pass() {
      if (this.over) return { ok: false, reason: "over" };
      this.history.push(this.snapshot());
      this.lastMove = { pass: true, color: this.turn };
      this.turn = other(this.turn);
      this.passes += 1;
      this.ko = -1;
      if (this.passes >= 2) this.over = true;
      return { ok: true, over: this.over };
    }

    undo() {
      const prev = this.history.pop();
      if (!prev) return false;
      this.hashes.delete(keyOf(this.board));
      this.board = prev.board;
      this.turn = prev.turn;
      this.passes = prev.passes;
      this.captured = prev.captured;
      this.ko = prev.ko;
      this.lastMove = prev.lastMove;
      this.over = false;
      return true;
    }

    stoneCount() {
      let n = 0;
      for (let i = 0; i < this.board.length; i++) if (this.board[i]) n++;
      return n;
    }
  }

  return {
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    KOMI: KOMI,
    other: other,
    neighbors: neighbors,
    collectGroup: collectGroup,
    placeStone: placeStone,
    isEye: isEye,
    allGroups: allGroups,
    eyeCount: eyeCount,
    suggestDead: suggestDead,
    scorePosition: scorePosition,
    ascii: ascii,
    colName: colName,
    coordName: coordName,
    Game: Game,
  };
});
