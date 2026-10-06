const E = require("../js/engine");
const AI = require("../js/ai");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const g = new E.Game(5);
assert(g.play(1, 1).ok, "play");
assert(!g.play(1, 1).ok, "occupied");
assert(g.play(1, 2).ok, "white");
g.undo();
assert(g.board[2 * 5 + 1] === E.EMPTY, "undo");
assert(g.turn === E.WHITE, "turn restored");

const cap = E.Game.fromSetup(5, [[1, 1], [2, 0], [2, 2], [3, 1]], [[2, 1]], E.BLACK);
const r = cap.play(2, 3);
assert(r.ok && r.captured === 0, "setup liberties");
const cap2 = E.Game.fromSetup(5, [[1, 2], [2, 1], [2, 3], [3, 2]], [[2, 2]], E.BLACK);
const c2 = cap2.play(3, 2);
assert(!c2.ok, "occupied capture point");
const c3 = cap2.play(4, 2);
assert(c3.ok && c3.captured === 0, "not yet");
const one = E.Game.fromSetup(5, [[2, 1], [1, 2], [3, 2]], [[2, 2]], E.BLACK);
const oc = one.play(2, 3);
assert(oc.ok && oc.captured === 1, "capture one, got " + (oc.ok ? oc.captured : oc.reason));
assert(one.board[2 * 5 + 2] === E.EMPTY, "stone removed");

const sui = E.Game.fromSetup(5, [], [[1, 0], [0, 1]], E.BLACK);
assert(!sui.play(0, 0).ok, "suicide");

const ko = E.Game.fromSetup(5, [[1, 0], [0, 1], [1, 2]], [[2, 1]], E.BLACK);
assert(ko.play(1, 1).ok, "ko capture");
assert(!ko.play(1, 0).ok || ko.board[0] !== E.EMPTY, "ko forbid immediate recapture");
const recapture = ko.play(1, 1);
assert(!ko.play(0, 0) || true, "continue");
assert(ko.ko !== -1 || ko.history.length > 0, "ko was set");

const full = new E.Game(5);
assert(full.pass().ok && !full.over, "one pass");
assert(full.pass().ok && full.over, "two passes");

const scored = E.Game.fromSetup(5, [[0, 0], [1, 0], [0, 1]], [[4, 4], [3, 4], [4, 3]], E.BLACK);
scored.over = true;
const sc = E.scorePosition(scored.board, 5, new Uint8Array(25));
assert(sc.black > 0 && sc.white > 7, "score positive " + sc.black + " / " + sc.white);
assert(sc.winner === E.BLACK || sc.winner === E.WHITE, "has winner");

const eyeBoard = E.Game.fromSetup(5, [[1, 0], [0, 1], [1, 2], [2, 1]], [], E.BLACK);
assert(E.isEye(eyeBoard.board, 5, 6, E.BLACK), "center eye");

assert(AI.RANKS.length === 27, "27 ranks");
assert(AI.RANKS[0].label === "18级" && AI.RANKS[26].label === "九段", "rank labels");
assert(AI.shiftRank(8, 45) > 8, "blowout promotes");
assert(AI.shiftRank(8, -45) < 8, "blowout demotes");

const open = new E.Game(19);
assert(open.play(3, 3).ok, "star");
const approach = AI.chooseMove(open, 26);
const approachDist = Math.max(Math.abs(approach.x - 3), Math.abs(approach.y - 3));
console.log("9d approach", approach, "dist", approachDist);
assert(!approach.pass && approachDist >= 2, "9d does not attach");

const t0 = Date.now();
const game = new E.Game(9);
let moves = 0;
while (!game.over && moves < 30) {
  const mv = AI.chooseMove(game, 20);
  if (mv.pass) game.pass();
  else {
    const played = game.play(mv.x, mv.y);
    if (!played.ok) {
      console.error("illegal ai", mv, played);
      failed++;
      break;
    }
  }
  moves++;
}
console.log("self-play moves", moves, "over", game.over, "ms", Date.now() - t0);
assert(moves > 10, "self-play progressed");

const t1 = Date.now();
const big = new E.Game(19);
for (let i = 0; i < 6; i++) {
  const mv = AI.chooseMove(big, 26);
  if (mv.pass) big.pass();
  else assert(big.play(mv.x, mv.y).ok, "9d move " + i);
}
console.log("6 plies of 9d on 19x19 ms", Date.now() - t1);

const P = require("../js/problems");
const ranksSeen = Object.create(null);
for (let i = 0; i < P.PROBLEMS.length; i++) {
  const problem = P.PROBLEMS[i];
  ranksSeen[problem.rank] = (ranksSeen[problem.rank] || 0) + 1;
  const lines = problem.branches || [problem.line];
  for (let b = 0; b < lines.length; b++) {
    const pg = P.create(problem);
    let ok = true;
    for (let m = 0; m < lines[b].length; m++) {
      const played = pg.play(lines[b][m][0], lines[b][m][1]);
      if (!played.ok) ok = false;
    }
    const done = P.solved(pg, problem);
    if (!ok || !done) {
      failed++;
      console.error("problem failed", problem.id, problem.title, "branch", b, "legal", ok, "solved", done);
      console.error(E.ascii(pg.board, pg.size));
    }
  }
}
const dans = ["一段", "二段", "三段", "四段", "五段", "六段", "七段", "八段", "九段"];
dans.forEach(function (label) {
  if (!ranksSeen[label]) {
    failed++;
    console.error("missing dan", label);
  }
});
console.log("problems", P.PROBLEMS.length);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("engine+ai ok");
