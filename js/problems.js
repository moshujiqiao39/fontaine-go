(function (root, factory) {
  const engine = (typeof root !== "undefined" && root.GoEngine) || require("./engine");
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoProblems = api;
})(typeof self !== "undefined" ? self : this, function (Engine) {
  const BLACK = Engine.BLACK;
  const WHITE = Engine.WHITE;

  const PROBLEMS = [
    {
      id: "p1",
      rank: "18级",
      title: "提子",
      text: "黑先。白子只剩一口气，把它提掉。",
      size: 7,
      black: [[2, 1], [1, 2], [3, 2]],
      white: [[2, 2]],
      line: [[2, 3]],
      targets: [[2, 2]],
    },
    {
      id: "p2",
      rank: "17级",
      title: "角上的子",
      text: "黑先。提掉角上这一颗白子。",
      size: 7,
      black: [[1, 0]],
      white: [[0, 0]],
      line: [[0, 1]],
      targets: [[0, 0]],
    },
    {
      id: "p3",
      rank: "16级",
      title: "边角两子",
      text: "黑先。角上两颗白子只有一口气。",
      size: 7,
      black: [[1, 0], [1, 1]],
      white: [[0, 0], [0, 1]],
      line: [[0, 2]],
      targets: [[0, 0], [0, 1]],
    },
    {
      id: "p4",
      rank: "15级",
      title: "一口气",
      text: "黑先。自己的子被叫吃了，先逃出来。",
      size: 7,
      black: [[2, 2]],
      white: [[2, 1], [1, 2], [2, 3]],
      line: [[3, 2]],
      survive: [2, 2],
    },
    {
      id: "p5",
      rank: "14级",
      title: "吃两子",
      text: "黑先。两颗连在一起的白子可以一次提掉。",
      size: 7,
      black: [[2, 1], [1, 2], [2, 3], [4, 2], [3, 3]],
      white: [[2, 2], [3, 2]],
      line: [[3, 1]],
      targets: [[2, 2], [3, 2]],
    },
    {
      id: "p6",
      rank: "13级",
      title: "双打吃",
      text: "黑先。一着棋同时叫吃左右两块白棋。",
      size: 7,
      black: [[2, 0], [0, 1], [4, 1], [1, 2], [3, 2]],
      white: [[1, 1], [3, 1]],
      line: [[2, 1]],
      atari: 2,
    },
    {
      id: "p7",
      rank: "12级",
      title: "做两眼",
      text: "黑先。在正确的地方下一子，做成两只真眼。",
      size: 7,
      black: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [0, 3], [4, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]],
      white: [],
      line: [[2, 3]],
      eyes: [0, 2],
    },
    {
      id: "p8",
      rank: "11级",
      title: "三子",
      text: "黑先。横排三颗白子只剩一口气。",
      size: 7,
      black: [[2, 1], [3, 1], [4, 1], [1, 2], [2, 3], [3, 3], [4, 3]],
      white: [[2, 2], [3, 2], [4, 2]],
      line: [[5, 2]],
      targets: [[2, 2], [3, 2], [4, 2]],
    },
    {
      id: "p9",
      rank: "9级",
      title: "倒扑取子",
      text: "黑先。白棋的断点上可以一口气提掉两子。",
      size: 6,
      black: [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [3, 2], [2, 3]],
      white: [[1, 1], [2, 2]],
      line: [[2, 1]],
      targets: [[1, 1], [2, 2]],
    },
    {
      id: "p10",
      rank: "7级",
      title: "连接",
      text: "黑先。把被叫吃的子和旁边的黑子连上。",
      size: 7,
      black: [[0, 2], [2, 2], [2, 1], [2, 3]],
      white: [[0, 1], [1, 1], [0, 3], [1, 3]],
      line: [[1, 2]],
      survive: [0, 2],
    },
    {
      id: "p11",
      rank: "5级",
      title: "边上提子",
      text: "黑先。贴着边的白子已经没有出路。",
      size: 9,
      black: [[2, 0], [1, 1], [2, 1], [3, 1]],
      white: [[1, 0]],
      line: [[0, 0]],
      targets: [[1, 0]],
    },
    {
      id: "p12",
      rank: "3级",
      title: "关门",
      text: "黑先。白子看起来有气，其实可以被一次提掉。",
      size: 9,
      black: [[3, 2], [4, 2], [5, 2], [2, 3], [3, 4], [4, 4], [5, 4], [6, 4], [6, 2]],
      white: [[3, 3], [4, 3], [5, 3]],
      line: [[6, 3]],
      targets: [[3, 3], [4, 3], [5, 3]],
    },
  ];

  function solved(game, problem) {
    const size = game.size;
    if (problem.targets) {
      for (let i = 0; i < problem.targets.length; i++) {
        const p = problem.targets[i];
        if (game.board[p[1] * size + p[0]] !== Engine.EMPTY) return false;
      }
      return true;
    }
    if (problem.survive) {
      const p = problem.survive;
      const index = p[1] * size + p[0];
      if (game.board[index] !== BLACK) return false;
      const group = Engine.collectGroup(game.board, size, index, null);
      return group.libs >= 2;
    }
    if (problem.eyes) {
      const p = problem.eyes;
      const index = p[1] * size + p[0];
      if (game.board[index] !== BLACK) return false;
      const group = Engine.collectGroup(game.board, size, index, null);
      return Engine.eyeCount(game.board, size, group) >= 2;
    }
    if (problem.atari) {
      const groups = Engine.allGroups(game.board, size);
      let count = 0;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].color === WHITE && groups[i].libs === 1) count++;
      }
      return count >= problem.atari;
    }
    return false;
  }

  function create(problem) {
    return Engine.Game.fromSetup(problem.size, problem.black, problem.white, BLACK);
  }

  return {
    PROBLEMS: PROBLEMS,
    solved: solved,
    create: create,
    BLACK: BLACK,
    WHITE: WHITE,
  };
});
