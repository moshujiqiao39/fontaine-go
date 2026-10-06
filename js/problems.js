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
    {
      id: "p13",
      rank: "10级",
      title: "对角两子",
      text: "黑先。角上两颗白子斜着靠在一起，一口棋同时提掉。",
      size: 7,
      black: [[0, 2], [1, 1], [2, 0]],
      white: [[0, 1], [1, 0]],
      line: [[0, 0]],
      targets: [[0, 1], [1, 0]],
    },
    {
      id: "p14",
      rank: "8级",
      title: "断三子",
      text: "黑先。三颗白子被切断，只剩边上的一口气。",
      size: 6,
      black: [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 3]],
      white: [[1, 1], [2, 1], [2, 2]],
      line: [[3, 2]],
      targets: [[1, 1], [2, 1], [2, 2]],
    },
    {
      id: "p15",
      rank: "6级",
      title: "左右叫吃",
      text: "黑先。一着同时叫吃左右两块白棋。",
      size: 7,
      black: [[2, 3], [0, 4], [4, 4], [1, 5], [3, 5]],
      white: [[1, 4], [3, 4]],
      line: [[2, 4]],
      atari: 2,
    },
    {
      id: "p16",
      rank: "4级",
      title: "五子",
      text: "黑先。角上这一团白子只剩一口气。",
      size: 7,
      black: [[2, 0], [2, 1], [2, 2], [2, 3], [0, 3], [1, 3]],
      white: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
      line: [[1, 2]],
      targets: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
    },
    {
      id: "p17",
      rank: "2级",
      title: "点眼",
      text: "黑先。白棋当中那一点是整块棋的气，点上去就能提掉。",
      size: 9,
      black: [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [2, 3], [6, 3], [2, 4], [6, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5]],
      white: [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4]],
      line: [[4, 4]],
      targets: [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4]],
    },
    {
      id: "p18",
      rank: "1级",
      title: "弯三",
      text: "黑先。空当是弯三，只有中央一点能做成两只真眼。",
      size: 7,
      black: [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [4, 2], [1, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4]],
      white: [],
      line: [[2, 2]],
      eyes: [1, 1],
    },
    {
      id: "p19",
      rank: "一段",
      title: "直三",
      text: "黑先。白棋的空当是直三，两手吃净。两端或中间都能走通。",
      size: 7,
      black: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [4, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]],
      white: [[1, 1], [2, 1], [3, 1]],
      line: [[1, 2], [2, 2], [3, 2]],
      branches: [
        [[1, 2], [2, 2], [3, 2]],
        [[3, 2], [2, 2], [1, 2]],
        [[2, 2], [1, 2], [3, 2]],
      ],
      targets: [[1, 1], [2, 1], [3, 1]],
    },
    {
      id: "p20",
      rank: "二段",
      title: "角上的气",
      text: "黑先。角上这块白棋要两手才能提掉，先紧气。",
      size: 9,
      black: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 0], [3, 1], [3, 2], [2, 0]],
      white: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]],
      line: [[1, 2], [2, 1], [2, 2]],
      branches: [
        [[1, 2], [2, 1], [2, 2]],
        [[2, 1], [1, 2], [2, 2]],
      ],
      targets: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]],
    },
    {
      id: "p21",
      rank: "三段",
      title: "曲尺",
      text: "黑先。曲尺形的白棋，两手吃净。",
      size: 9,
      black: [[3, 0], [3, 1], [3, 2], [3, 3], [0, 3], [1, 3], [2, 3]],
      white: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]],
      line: [[1, 2], [2, 1], [2, 2]],
      branches: [
        [[1, 2], [2, 1], [2, 2]],
        [[2, 1], [1, 2], [2, 2]],
      ],
      targets: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]],
    },
    {
      id: "p22",
      rank: "四段",
      title: "边上网",
      text: "黑先。边上的白子用网吃。往短的方向两手，往角上逃要三手。",
      size: 9,
      black: [[2, 0], [3, 1], [1, 2], [4, 2], [2, 3]],
      white: [[2, 1]],
      line: [[1, 1], [2, 2], [3, 2]],
      branches: [
        [[1, 1], [2, 2], [3, 2]],
        [[2, 2], [1, 1], [0, 1], [1, 0], [0, 0]],
      ],
      targets: [[2, 1]],
    },
    {
      id: "p23",
      rank: "五段",
      title: "角上征子",
      text: "黑先。这颗白子要连续叫吃。朝角上或朝边上征，都能在三手里提掉。",
      size: 9,
      black: [[1, 0], [0, 1], [2, 2], [3, 3], [4, 4]],
      white: [[1, 1]],
      line: [[2, 1], [1, 2], [1, 3], [0, 2], [0, 3]],
      branches: [
        [[2, 1], [1, 2], [1, 3], [0, 2], [0, 3]],
        [[1, 2], [2, 1], [3, 1], [2, 0], [3, 0]],
      ],
      targets: [[1, 1]],
    },
    {
      id: "p24",
      rank: "六段",
      title: "长征",
      text: "黑先。白子一路往边上逃，中间不能松，三手提掉。",
      size: 9,
      black: [[2, 1], [1, 2], [0, 3], [3, 3], [4, 4], [5, 5]],
      white: [[2, 2]],
      line: [[3, 2], [2, 3], [2, 4], [1, 3], [1, 4]],
      targets: [[2, 2]],
    },
    {
      id: "p25",
      rank: "七段",
      title: "角上大块",
      text: "黑先。角上这一大块要算清楚三手，才能整块提掉。",
      size: 9,
      black: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [0, 4], [1, 4], [2, 4], [3, 4], [1, 0], [2, 3]],
      white: [[0, 0], [1, 1], [2, 0], [0, 1], [0, 2], [1, 2], [2, 1], [3, 1]],
      line: [[3, 2], [0, 3], [1, 3], [2, 2], [3, 0]],
      targets: [[0, 0], [1, 1], [2, 0], [0, 1], [0, 2], [1, 2], [2, 1], [3, 1]],
    },
    {
      id: "p26",
      rank: "八段",
      title: "一路追",
      text: "黑先。白子贴着征子路线逃，黑棋三手追死。",
      size: 9,
      black: [[3, 2], [2, 3], [1, 4], [4, 4], [5, 5], [6, 6]],
      white: [[3, 3]],
      line: [[4, 3], [3, 4], [3, 5], [2, 4], [2, 5]],
      targets: [[3, 3]],
    },
    {
      id: "p27",
      rank: "九段",
      title: "宽气",
      text: "黑先。这颗白子气比较宽，要连续追四手才提得掉。",
      size: 9,
      black: [[2, 0], [4, 0], [1, 2], [3, 2], [5, 1]],
      white: [[3, 1]],
      line: [[3, 0], [2, 1], [1, 1], [4, 1], [4, 2], [2, 2], [2, 3]],
      targets: [[3, 1]],
    },
  ];

  function rankKey(label) {
    if (label.charAt(label.length - 1) === "级") return 100 - parseInt(label, 10);
    const dans = ["一段", "二段", "三段", "四段", "五段", "六段", "七段", "八段", "九段"];
    const at = dans.indexOf(label);
    return at < 0 ? 300 : 200 + at;
  }
  PROBLEMS.sort(function (a, b) {
    return rankKey(a.rank) - rankKey(b.rank);
  });

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
