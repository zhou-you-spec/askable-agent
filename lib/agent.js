'use strict';
/**
 * 问不出口的那道题 —— 核心引擎 v2
 *
 * 设计原则：档位永远由学生拨。
 *   求助深度 depth: 1 只给思路 / 2 关键一行 / 3 完整代码
 *   讲解粒度 grain: line 逐行讲 / card 只讲卡住的 / code 只给代码
 *
 * v2 新增：
 *   - 多轮引导：1 档先问一个具体问题，等学生回答后再往下带
 *   - 换讲法：3 档说"还是没懂"，换粒度/换说法重讲，而不是重复
 *   - 学生画像：记住已掌握的概念、反复卡住的点
 *   - 边界防护：提示注入、越界闲聊、危机转介
 *   - 学会反馈：学生说"懂了"，记下并给下一步挑战
 */

const { KnowledgeBase } = require('./kb');

const DEPTH_NAME = { 1: '1 档 · 只给思路', 2: '2 档 · 关键一行', 3: '3 档 · 完整代码' };
const GRAIN_NAME = { line: '逐行讲', card: '只讲卡住的', code: '只给代码' };
const GRAIN_CYCLE = ['line', 'card', 'code'];
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 完整示例代码（仅在 3 档出现），逐行讲解用得到 */
const DEMO = {
  'err-filenotfound': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv(r'C:/Users/你/Desktop/成绩.csv')", explain: "打开桌面上的成绩表。路径，就是文件的家庭住址。", concept: "路径" },
    { line: "print(df['成绩'].mean())", explain: "把「成绩」一列加起来除以人数，就像算班级平均分。", concept: "mean" }
  ],
  'err-indentation': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "读表格；这一行顶格写，不属于任何缩进块。", concept: "read_csv" },
    { line: "if len(df) > 0:", explain: "判断表里有没有数据；冒号结尾，下一行必须缩进。", concept: "缩进" },
    { line: "    print(df['成绩'].mean())", explain: "这一行开头空 4 格，表示它属于上面的 if。", concept: "缩进" }
  ],
  'err-modulenotfound': [
    { line: "import pandas as pd", explain: "取出 pandas；报错说明这个环境里没有它。", concept: "pip" },
    { line: "# 先在终端执行：python -m pip install pandas", explain: "用「你现在这个 Python」去装，才不会装错环境。", concept: "pip" }
  ],
  'err-keyerror': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "把表格读进来。", concept: "read_csv" },
    { line: "print(list(df.columns))", explain: "先把它真实的列名打出来，照抄，别凭记忆写。", concept: "DataFrame" },
    { line: "print(df['成绩'].mean())", explain: "用屏幕上真实出现的列名，再算平均。", concept: "mean" }
  ],
  'err-valueerror-csv': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv', encoding='gbk')", explain: "换一本「字典」去读这个中文表格。", concept: "编码" },
    { line: "print(df.head())", explain: "先看前五行，确认是不是读对了。", concept: "DataFrame" }
  ],
  'err-typeerror-mean': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "把表格读进来。", concept: "read_csv" },
    { line: "df['成绩'] = pd.to_numeric(df['成绩'], errors='coerce')", explain: "把「文字 89」转成「数字 89」，转不了的变空值。", concept: "类型" },
    { line: "print(df['成绩'].mean())", explain: "现在才是数字，可以算平均分了。", concept: "mean" }
  ],
  'err-convert-float': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "把表格读进来。", concept: "read_csv" },
    { line: "df['成绩'] = pd.to_numeric(df['成绩'], errors='coerce')", explain: "能转的转成数字，「89分」这种转不了的先留空。", concept: "类型" },
    { line: "print(df['成绩'].isna().sum())", explain: "数一数有几个没转成功，心里有数再决定怎么办。", concept: "缺失值" }
  ],
  'err-zerodivision': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "把表格读进来。", concept: "read_csv" },
    { line: "if len(df) > 0:", explain: "先确认表不是空的；空表算平均就是拿 0 做除数。", concept: "缺失值" },
    { line: "    print(df['成绩'].mean())", explain: "有数据才求平均；没有就先回去修筛选条件。", concept: "mean" }
  ],
  'err-nameerror': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "先创建 df，后面的代码才能用它。", concept: "变量" },
    { line: "print(df['成绩'].mean())", explain: "这时 df 已经存在，再取列就不会报 NameError。", concept: "mean" }
  ],
  'err-attributeerror': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "把表格读进来。", concept: "read_csv" },
    { line: "print(type(df['成绩']))", explain: "先看清手里是 Series 还是 DataFrame，再决定点哪个方法。", concept: "DataFrame" },
    { line: "print(df['成绩'].mean())", explain: "mean 是 Series 的方法，选对了列才调得动。", concept: "mean" }
  ],
  'err-emptydata': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "with open('成绩.csv', encoding='utf-8') as f:", explain: "先用最朴素的方式打开，看看里面到底有没有内容。", concept: "文件操作" },
    { line: "    print(repr(f.read()[:200]))", explain: "只打印前 200 个字符，空文件和错误页一眼就能认出来。", concept: "数据读取" }
  ],
  'err-permission': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "# 先关掉 Excel 里打开的那个文件", explain: "文件被占用时，读和写都会失败，先释放它。", concept: "文件操作" },
    { line: "df = pd.read_csv('成绩.csv')", explain: "文件释放后再读，就能正常读进来了。", concept: "read_csv" }
  ],
  'err-jsondecode': [
    { line: "with open('数据.json', encoding='utf-8') as f:", explain: "先打开文件看原文，别急着解析。", concept: "文件操作" },
    { line: "    print(f.read()[:200])", explain: "看一眼开头：是 JSON 还是 HTML 报错页，一看便知。", concept: "数据读取" },
    { line: "import json", explain: "确认内容是 JSON 之后，再导入解析库。", concept: "pip" }
  ],
  'err-sheet': [
    { line: "import pandas as pd", explain: "从工具箱里取出 pandas。", concept: "pip" },
    { line: "print(pd.ExcelFile('成绩.xlsx').sheet_names)", explain: "先把所有工作表名字打出来，照抄真实的名字。", concept: "数据读取" },
    { line: "df = pd.read_excel('成绩.xlsx', sheet_name='真实名字')", explain: "用屏幕上真实出现的名字，再读那个表。", concept: "read_csv" }
  ]
};

/** 1 档：先接住你，而不是先给答案 —— 第一问 */
const FIRST_QUESTION = {
  'err-filenotfound': '你的成绩表，现在放在电脑的哪个位置？',
  'err-indentation': '你先看一下：报错说的这一行，和它上一行，是不是都没缩进？',
  'err-modulenotfound': '这个库，你是在哪个终端里装的？和现在跑代码的是同一个 Python 吗？',
  'err-keyerror': '你能先把这一列的真实名字打出来给我看看吗？',
  'err-valueerror-csv': '这个文件是用 Excel 另存的吗？另存的时候选的是什么编码？',
  'err-typeerror-mean': '你觉得「89」和 89，在电脑眼里是同一个东西吗？',
  'err-convert-float': '你这一列里，是不是有几行写的是「缺考」或者带了「分」字？',
  'err-zerodivision': '算这一步之前，你先 print(len(df)) 看一眼：是不是筛完就没数据了？',
  'err-nameerror': '报错这一行用到的变量，你往上翻翻，它是在哪一行被创建的？',
  'err-attributeerror': '你先 print(type(...)) 看一眼：手里这个东西，真的是你以为的那种类型吗？',
  'err-emptydata': '你先用记事本打开这个文件看一眼：里面除了表头，还有没有数据？',
  'err-permission': '这个文件现在是不是还在 Excel 里开着？先把它关掉。',
  'err-jsondecode': '你先打个 print 看看文件前几个字：是 JSON，还是一段网页报错？',
  'err-sheet': '你能把 Excel 底部所有工作表的名字念一遍吗？'
};

/** 第二问（学生答完第一问后追问，对应 PPT 里的两口对话） */
const SECOND_QUESTION = {
  'err-filenotfound': '好。那你想想：代码运行的时候，它会去哪里找这个文件？想明白这两个「位置」，你就知道该改哪儿了。',
  'err-indentation': '好。那你看冒号后面那一行：它是顶格写的，还是空了几格？',
  'err-modulenotfound': '那就是「装在哪」和「用哪个」对不上。你先确认一下：你现在跑代码的解释器路径是什么？',
  'err-keyerror': '好。那对着这份真实列名，你代码里写的那个列名，和它一模一样吗？（空格、全角都要算）',
  'err-valueerror-csv': '对。那就先别改别的，只把读取那一行换一本「字典」再跑一次，看看报错变不变。',
  'err-typeerror-mean': '对，不是。所以先别急着算，先看看这一列现在是什么类型。',
  'err-convert-float': '对。那就先把它转成数字，转不了的就留空，再数数有几个空的。',
  'err-zerodivision': '对。所以在算之前，先给自己加一道「有没有数据」的检查。',
  'err-nameerror': '对。那就把它挪到使用它的那行前面，顺序对了，名字就在了。',
  'err-attributeerror': '对。先确认类型，再去查这个方法到底属于谁。'
};

/** 换讲法：同一道题，换一种说法（而不是重复一遍） */
const RETELL = {
  'err-filenotfound': [
    '换个说法：你需要同时知道两个「地址」——文件在硬盘上的地址，和程序启动时站的地址，两个对不上就找不到。',
    '再换个角度：先不要改代码，把 .py 文件和表格放在同一个文件夹里，让两个地址自然一致。'
  ],
  'err-indentation': [
    '换个说法：Python 不看你写得漂不漂亮，只看「左边空了几格」。同一层的东西必须空格数相同。',
    '再换个角度：把报错那一行的上一行结尾补上冒号，然后选中下一行按 Tab，让它们对齐。'
  ]
};

const INJECTION = /(忽略|无视|忘记|清除|跳过).{0,6}(之前|以上|前面|你的|所有).{0,6}(指令|规则|设定|限制|要求)|你现在是|扮演|越狱|开发者模式|developer mode|system prompt|系统提示词|把你的(设定|规则)告诉我|ignore\s+(all\s+)?(previous|above)?\s*instructions|disregard|act\s+as|pretend\s+to\s+be|jailbreak/i;
const IMPERSONATE = /我是(老师|教师|教务|管理员|评委|校长)/;
const CRISIS = /(不想活|自杀|轻生|活着没意思|自残|伤害自己|结束生命|死了算了|抑郁得想死)/;
const OFFTOPIC = /写.{0,4}诗|作诗|写.{0,4}小说|讲个笑话|明星|八卦|游戏攻略|彩票|股票推荐|天气预报|翻译成英文/;

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 开场白变体：避免每轮都是同一句，听起来像模板 */
const LEAD_ONE = [
  '先别急着改代码',
  '先停一下，别急着改',
  '先别动手，我们看一眼',
  '别急着改代码'
];
const LEAD_TWO = ['那就只点一处——', '这次只给你一处关键——', '就看这一处——'];

/** 学生说"学过但忘了"时的回应 */
const FORGOT = [
  '忘了很正常，隔几天不用就会这样，不是你记性差。',
  '这个确实容易忘，我们直接抓关键那一处。',
  '没关系，我把它讲到你这次能记住为止。'
];

class Agent {
  constructor(sid, courseId) {
    this.sid = sid;
    this.kb = new KnowledgeBase(courseId);
    this.course = this.kb.meta;
    this.depth = 1;
    this.grain = 'line';
    this.skippedLines = [];
    this.muted = [];
    this.topic = null; // { kind: 'error'|'concept', id, title }
    this.pending = null; // { errorId, stage: 1|2 }
    this.lastFull = null; // { entryId, retell: 0 }
    this.profile = { learned: [], stuck: {}, turns: 0 };
    this.turns = 0;
    this.status = 'active';
    this.events = [];
  }

  reset() {
    this.depth = 1;
    this.grain = 'line';
    this.skippedLines = [];
    this.muted = [];
    this.topic = null;
    this.pending = null;
    this.lastFull = null;
    this.turns = 0;
    this.profile = { learned: [], stuck: {}, turns: 0 };
    this.status = 'active';
    this.events = [];
  }

  snapshot() {
    return {
      sid: this.sid,
      courseId: this.kb.courseId,
      courseName: (this.kb.meta || {}).name,
      depth: this.depth,
      grain: this.grain,
      depthName: DEPTH_NAME[this.depth],
      grainName: GRAIN_NAME[this.grain],
      skippedLines: this.skippedLines,
      muted: this.muted,
      topic: this.topic,
      turns: this.turns,
      learned: this.profile.learned,
      stuck: Object.entries(this.profile.stuck || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }))
    };
  }

  isMuted(concept) {
    if (!concept) return false;
    return this.muted.some((m) => concept.includes(m) || m.includes(concept));
  }

  /** 某一行是否要跳过讲解：概念被静音，或代码行本身命中静音关键词 */
  lineMuted(line, concept) {
    return this.isMuted(concept) || this.muted.some((m) => line && line.includes(m));
  }

  /** 记录卡点（用于教师周报与学生画像） */
  noteStuck(key) {
    if (!key) return;
    this.profile.stuck[key] = (this.profile.stuck[key] || 0) + 1;
  }

  handle(rawText) {
    const text = String(rawText || '').trim();
    this.turns += 1;
    this.profile.turns = this.turns;
    if (!text) {
      return this.reply('你把问题删掉了，没关系，我在这儿。哪怕只发一句「不会」，也算开口。', 'empty');
    }

    // 0) 提示注入 / 套取设定
    if (INJECTION.test(text)) {
      return this.reply(
        '这套规则我不能改，也不会告诉你内部设定——不是防你，是怕它一改，「档位由你拨」就作废了。\n' +
          '不过你可以直接说想怎么讲：比如「逐行讲」「只给代码」「跳过第 2 行」，这些都是你的权利。',
        'injection'
      );
    }

    // 0.5) 危机信号 → 转介（先接住人，再谈题）
    if (CRISIS.test(text)) {
      this.status = 'crisis';
      return this.reply(
        '这句话我认真接住了。你的感受比这道题重要得多。\n' +
          '我只是个实训答疑助教，接不住这么重的事——请你现在就找一位真人：班主任、辅导员、学校心理中心，或者身边信得过的同学。\n' +
          '如果你愿意，可以先把这道题放一放。想聊的时候，我还在。',
        'crisis'
      );
    }

    // 0.6) 冒充身份索要答案
    if (IMPERSONATE.test(text) && /(答案|代码|给我|直接|后台|权限)/.test(text)) {
      return this.reply(
        '身份我这边没法验证，所以谁来说都不给答案——这不是不信任你，是对所有同学一个标准。\n' +
          '如果你真是老师，可以在教师看板看到全班的匿名数据；想给某个同学更多帮助，让他自己把档位拨到 3 档就行。',
        'impersonate'
      );
    }

    // 0.8) 连"怎么问"都不敢说 —— 先降低开口门槛
    if (/(不敢问|不知道怎么问|不会问|从哪问起|不知道问什么|不敢说)/.test(text)) {
      return this.reply(
        '那就先不用问得漂亮。\n' +
          '你只要做一件事：把屏幕上那句报错，连着英文和数字，整段复制过来——剩下的我来收拾。\n' +
          '如果连报错都没有，就说一句「我在做哪一步卡住了」，我从这儿开始问你。',
        'shy'
      );
    }

    // 1) 代写请求
    if (/(帮我把|直接|做完|代写|抄|给我答案|写作业|帮我写)/.test(text) && /(作业|做完|写|代码|答案)/.test(text)) {      return this.reply(
        '作业得你自己写才算数，这个我不能替你做。' +
          '不过我可以陪你把它啃下来——你只要告诉我：现在卡在哪一步，是读不进来，还是算不出来？',
        'refuse'
      );
    }

    // 2) 情绪
    if (/(太笨|好笨|很笨|学不会|崩溃|烦死|不想学|哭了|丢人|废物)/.test(text)) {
      const back = this.topic ? `我们回来看你说的「${this.topic.title}」。` : '我们从最小的一步开始，先别看整段代码。';
      return this.reply(
        '先停一下。卡壳说明你在正经写代码，这条路每个人都走过，这不叫笨。' + back,
        'emotion'
      );
    }

    // 3) 放弃 → 3 档
    if (/(我放弃了|放弃|算了|不学了|不想做了|摆烂)/.test(text)) {
      this.depth = 3;
      this.status = 'gaveup';
      return this.giveFullAnswer('没问题，这不丢人。放弃是在这儿歇一下，不是走人。');
    }

    // 3.5) 学生说"学过但忘了" → 直接从关键处讲，不再从零铺垫
    if (/(老师讲过|上课讲过|学过|忘了怎么|记不清|忘了这个|听过但没记住)/.test(text)) {
      if (this.depth < 2) this.depth = 2;
      const lead = FORGOT[(this.turns + this.sid.length) % FORGOT.length];
      const entry = this.topic && this.kb.errors.find((e) => e.id === this.topic.id);
      if (entry) {
        const out = this.errorReply(entry);
        out.text = lead + '\n\n' + out.text;
        out.kind = 'forgot';
        return out;
      }
      return this.reply(lead + '\n那就直接抓关键那一处：把你卡住的那一行贴过来，我指着它讲。', 'forgot');
    }

    // 4) 跳过某一行
    const skip = text.match(/跳过第\s*([0-9一二三四五六七八九十]+)\s*行|第\s*([0-9]+)\s*行(?:别|不用|不要)(?:讲)?/);
    if (skip) {
      const n = this.parseNum(skip[1] || skip[2]);
      if (n && !this.skippedLines.includes(n)) this.skippedLines.push(n);
      return this.reply(
        `好，第 ${n} 行代码保留，讲解跳过。` + (this.depth < 3 ? '（要完整代码的时候，我会贴上它但不逐行讲。）' : ''),
        'skip'
      );
    }

    // 5) 以后别讲某概念
    const mute = text.match(/(?:以后|之后|下次)?\s*([\u4e00-\u9fa5A-Za-z_]{1,8})\s*(?:都)?\s*(?:别|不要|不用)再?讲/);
    if (mute && mute[1] && !/我|你|它|这|那|什么/.test(mute[1])) {
      const concept = mute[1].replace(/的$/, '');
      if (!this.muted.includes(concept)) this.muted.push(concept);
      return this.reply(`记住了。接下来这个会话里，「${concept}」不再讲。`, 'mute');
    }

    // 6) 手动调档
    if (/([123])\s*档|只给思路|关键一行|完整代码|逐行讲|只讲卡住|只给代码/.test(text)) {
      if (/只给思路/.test(text)) this.depth = 1;
      else if (/关键一行/.test(text)) this.depth = 2;
      else if (/完整代码/.test(text) && this.depth !== 3) this.depth = 3;
      else if (text.includes('档') && text.match(/([123])\s*档/)) this.depth = Number(text.match(/([123])\s*档/)[1]);
      if (/逐行讲/.test(text)) this.grain = 'line';
      else if (/只讲卡住/.test(text)) this.grain = 'card';
      else if (/只给代码/.test(text)) this.grain = 'code';
      if (this.depth === 3) return this.giveFullAnswer('好，按你拨的档位来：');
    }

    // 7) 懂了 / 没懂（针对上一轮 3 档讲解）
    if (this.lastFull && /(懂了|明白了|会了|跑通|成功|可以了|谢谢)/.test(text) && !/没|不/.test(text.replace(/没问题|不错|不客气/g, ''))) {
      const concept = (this.kb.errors.find((e) => e.id === this.lastFull.entryId) || {}).concept || '这道题';
      if (!this.profile.learned.includes(concept)) this.profile.learned.push(concept);
      this.lastFull = null;
      return this.reply(
        `太好了，${concept} 这一关你过了。我把「已掌握」记下来了。\n` +
          '下一步留给你：把「补考名单」那一列也自己读出来，卡住了再回来找我。',
        'learned'
      );
    }
    if (this.lastFull && /(没懂|还是不会|不明白|没明白|不会|不懂|再说一遍|再讲一遍|再讲一次)/.test(text)) {
      return this.retell();
    }

    // 8) 升级档位
    if (/(再给点提示|提示升级|还是不懂|看不懂|没明白|再多给|再具体|不会写|没思路|下一步)/.test(text)) {
      if (this.depth < 3) this.depth += 1;
      if (this.depth === 3) return this.giveFullAnswer('好，升到 3 档。完整代码给你，一行一行讲：');
      return this.continueGuide();
    }

    // 9) 1 档追问的回答（多轮引导）：太短、且不是在反问，才当成回答
    if (this.pending && this.pending.stage >= 1 && text.length <= 30 && !/[?？]/.test(text)) {
      return this.handleAnswer(text);
    }

    // 10) 报错
    const err = this.kb.matchError(text);
    if (err) {
      this.topic = { kind: 'error', id: err.id, title: err.type };
      this.status = 'active';
      this.noteStuck(err.concept);
      return this.errorReply(err);
    }

    // 11) 概念
    const con = this.kb.matchConcept(text);
    if (con) {
      this.topic = { kind: 'concept', id: con.id, title: con.name };
      this.status = 'active';
      return this.conceptReply(con);
    }

    // 12) 明显跑题
    if (OFFTOPIC.test(text)) {
      return this.reply(
        '这个我帮不上——我是个实训课助教，只会跟着课程资料讲代码和报错。\n' +
          '不过你要是想把「成绩表」这类任务做得更漂亮，随时可以问我。',
        'offtopic'
      );
    }

    // 13) 兜底：不装懂
    const lessons = this.kb.searchLessons(text);
    if (lessons.length) {
      return this.reply(
        `这块知识库里有《${lessons[0].title}》，但我不敢替它下结论。` +
          `你可以把具体题目或报错贴给我——越具体，我越能帮上忙。`,
        'fallback'
      );
    }
    return this.reply(
      '这条我知识库里没收录，我不会编一个答案糊弄你。' +
        '你可以试试：把报错原文整段贴过来，或者说说你用的哪份表格、卡在哪一步。' +
        '（也可以直接问我：pip 是什么、DataFrame 怎么理解。）',
      'fallback'
    );
  }

  parseNum(v) {
    if (!v) return null;
    if (/\d/.test(v)) return Number(v.match(/\d+/)[0]);
    return CN_NUM[v] || null;
  }

  reply(text, kind) {
    const out = { text, kind, meta: this.snapshot() };
    this.events.push({ intent: kind, depth: this.depth, grain: this.grain, at: Date.now() });
    return out;
  }

  /** 当前课程是否是写代码的课程（决定措辞与"三档"呈现方式） */
  get isCodeCourse() {
    return ((this.kb.meta && this.kb.meta.kind) || 'code') === 'code';
  }

  /** 1 档：报错先接住 + 第一问 */
  errorReply(err) {
    const parts = [];
    const ana = this.kb.analogy(err.analogyId);
    const lead1 = this.isCodeCourse
      ? LEAD_ONE[(this.turns + this.sid.length) % LEAD_ONE.length]
      : '先别急着动手';
    if (this.depth === 1) {
      parts.push(`${lead1}。这条报错翻译过来就是：` + err.plain);
      parts.push(FIRST_QUESTION[err.id] || '你先说说：报错前一行的代码是什么？');
      const times = this.profile.stuck[err.concept] || 0;
      if (times >= 3) {
        parts.push(
          `（这是你第 ${times} 次卡在「${err.concept}」上了。要不要直接拨到 2 档？说一句「再给点提示」我就点出关键那一行。）`
        );
      }
      this.pending = { errorId: err.id, stage: 1 };
    } else if (this.depth === 2) {
      const hints = (DEMO[err.id] || []).filter((d) => !this.lineMuted(d.line, d.concept));
      const target = hints[1] || hints[0];
      const lead2 = target
        ? `${LEAD_TWO[(this.turns + this.sid.length) % LEAD_TWO.length]}第 2 行 ${target.line}。`
        : `那就只给你最关键的一步——${err.firstStep}`;
      parts.push(lead2);
      if (ana) parts.push(`${ana.analogy}${ana.explain}`);
      parts.push('说人话：' + err.plain);
      parts.push('只改这一处，别的先别动，跑一次看看报错变没变；变了就把新报错贴给我。');
      this.pending = null;
    } else {
      return this.giveFullAnswer(this.isCodeCourse ? '好，完整代码来了，一行一行讲：' : '好，完整步骤来了，一步一步讲：', err);
    }
    const out = this.reply(parts.join('\n\n'), 'error');
    out.sources = this.sourcesFor(['常见报错库 · ' + err.type], ana ? ['生活类比库 · ' + (ana.concept || '')] : []);
    out.suggestions = this.depth < 3 ? ['再给点提示', '我放弃了', '跳过第2行'] : ['换个问法', '以后路径别讲了'];
    out.code = null;
    return out;
  }

  /** 学生回答 1 档的追问 → 继续引导（不升级档位） */
  handleAnswer(text) {
    const errId = this.pending.errorId;
    const err = this.kb.errors.find((e) => e.id === errId);
    const stage = this.pending.stage;
    const parts = [];
    if (stage === 1) {
      parts.push('嗯，知道了。');
      parts.push(SECOND_QUESTION[errId] || '那你觉得，问题最可能出在哪一行？');
      this.pending.stage = 2;
    } else {
      parts.push('你已经把问题想清楚一大半了。');
      parts.push(
        `剩下就差动手：${err ? err.firstStep : '只改那一处，跑一次看看。'}\n` +
          '如果还是卡住，点下面的「再给点提示」——我只会多给一点，不会一口气给答案。'
      );
      this.pending = { errorId: errId, stage: 1 };
    }
    const out = this.reply(parts.join('\n\n'), 'guide');
    out.sources = err ? this.sourcesFor(['常见报错库 · ' + err.type]) : [];
    out.suggestions = ['再给点提示', '我放弃了'];
    out.code = null;
    return out;
  }

  /** 学生说"再给点提示"但没有具体话题时，继续上一个话题 */
  continueGuide() {
    const entry = this.topic && this.kb.errors.find((e) => e.id === this.topic.id);
    if (entry) return this.errorReply(entry);
    if (this.topic && this.topic.kind === 'concept') {
      const c = this.kb.concepts.find((x) => x.id === this.topic.id);
      if (c) return this.conceptReply(c);
    }
    return this.reply('好，你又开口了一次。这一档我只多给一点点：把你卡住的那一行贴给我，我告诉你它卡在哪。', 'upgrade');
  }

  /** 3 档后说"还是没懂" → 换一种讲法，而不是重复 */
  retell() {
    const entry = this.kb.errors.find((e) => e.id === this.lastFull.entryId);
    if (!entry) return this.reply('换我再想一次：你把完整的报错和代码贴给我，我按另一种方式讲。', 'retell');
    const idx = this.grainIndexShift();
    const parts = [];
    const lines = DEMO[entry.id] || [];
    if (!lines.length) {
      // 非代码课程：换一种组织方式重讲完整步骤
      const tips = [
        '换一种讲法：这次我先说「怎么判断是这个问题」，再说「怎么改」。',
        '再换一个角度：把这一步当成一次核对——先核对，再动手。',
        '最后一个角度：假设你是老师，你会先看哪一处？我们就从那一处开始。'
      ];
      const n = (this.lastFull.retell || 0) % tips.length;
      const out = this.giveFullAnswer(tips[n], entry);
      if (this.lastFull) this.lastFull.retell = n + 1;
      return out;
    }
    if (RETELL[entry.id] && idx === 0) {
      parts.push(RETELL[entry.id][0]);
      this.lastFull.retell = 1;
    } else if (RETELL[entry.id] && idx === 1 && RETELL[entry.id][1]) {
      parts.push(RETELL[entry.id][1]);
      this.lastFull.retell = 2;
    } else {
      parts.push(`换一种讲法：这次我把「${GRAIN_NAME[this.grain]}」换成「只讲卡住的那几步」。`);
    }
    if (this.grain === 'code') {
      parts.push('这次不逐行讲了，只留代码，你对着跑，跑完告诉我哪一行不懂。');
    } else {
      const keyLines = lines
        .map((d, i) => ({ d, n: i + 1 }))
        .filter(({ n }) => !this.skippedLines.includes(n) && !this.lineMuted(lines[n - 1].line, lines[n - 1].concept))
        .slice(0, 2);
      for (const { d, n } of keyLines) parts.push(`第 ${n} 行：${d.line}\n→ ${d.explain}`);
    }
    const out = this.reply(parts.join('\n\n'), 'retell');
    out.code = this.grain === 'code' ? lines.map((d) => d.line).join('\n') : null;
    out.sources = this.sourcesFor(['常见报错库 · ' + entry.type]);
    out.suggestions = ['还是没懂', '我懂了', '换个问法'];
    return out;
  }

  grainIndexShift() {
    const i = GRAIN_CYCLE.indexOf(this.grain);
    this.grain = GRAIN_CYCLE[(i + 1) % GRAIN_CYCLE.length];
    return this.lastFull ? this.lastFull.retell : 0;
  }

  conceptReply(con) {
    const ana = this.kb.analogy(con.analogyId);
    const parts = [];
    if (ana) parts.push(`${ana.analogy}${ana.explain}`);
    if (this.depth === 1) {
      parts.push(`一句话：${con.short}`);
      parts.push('你先自己说说，它大概是干嘛的？说错了也没关系，我按你的理解往下接。');
    } else if (this.depth === 2) {
      parts.push(`再往下一点：${con.term}`);
      parts.push(con.note);
    } else {
      parts.push(`完整讲：${con.term}`);
      parts.push(con.note);
    }
    const out = this.reply(parts.join('\n\n'), 'concept');
    out.sources = this.sourcesFor(
      ['课程教案库 · ' + (this.kb.searchLessons(con.name)[0] || {}).title].filter((s) => !s.includes('undefined')),
      ana ? ['生活类比库 · ' + (ana.concept || '')] : []
    );
    out.suggestions = ['再给点提示', '我放弃了'];
    out.code = null;
    return out;
  }

  /** 3 档：完整代码 + 按粒度讲解 */
  giveFullAnswer(lead, err) {
    const entry = err || (this.topic && this.kb.errors.find((e) => e.id === this.topic.id));
    if (!entry) {
      return this.reply('完整代码我这边还没有可参考的样例，你先告诉我具体的报错或任务，我按这个来。', 'no-code');
    }
    this.lastFull = { entryId: entry.id, retell: 0 };
    this.pending = null;
    const lines = DEMO[entry.id] || [];
    if (!lines.length) {
      // 非代码型课程（Excel / 会计）：用「完整处理步骤」代替代码
      const parts = [lead, '完整步骤给你，一步一步照着做：'];
      (entry.causes || []).forEach((c, i) => {
        if (this.isMuted(c.text)) return;
        parts.push(`${i + 1}. ${c.text}\n   → 怎么查：${c.check}`);
      });
      parts.push(`第一步先做这个：${entry.firstStep}`);
      parts.push('做的过程中哪一步对不上，就把那一步的现象告诉我，我们再往下拆。');
      const out = this.reply(parts.join('\n\n'), 'full');
      out.code = null;
      out.sources = this.sourcesFor(['常见报错库 · ' + entry.type, '课程教案库 · ' + entry.concept]);
      out.suggestions = ['还是没懂', '我懂了', '换个问法'];
      return out;
    }
    const parts = [lead];
    if (this.grain === 'code') {
      parts.push('按你的要求，只给代码，不讲解。');
    } else {
      parts.push('每一行都讲人话：');
    }
    const codeLines = [];
    lines.forEach((d, idx) => {
      const n = idx + 1;
      const skipped = this.skippedLines.includes(n);
      const muted = this.lineMuted(d.line, d.concept);
      codeLines.push(d.line);
      if (this.grain === 'line' && !skipped && !muted) {
        parts.push(`${n}. ${d.line}\n   → ${d.explain}`);
      } else if (this.grain === 'card' && !skipped && !muted && /read_csv|to_numeric|if|print/.test(d.line)) {
        parts.push(`第 ${n} 行是关键：${d.explain}`);
      }
    });
    if (this.skippedLines.length) parts.push(`（第 ${this.skippedLines.join('、')} 行按你说的跳过了讲解。）`);
    parts.push('跑通之后，试着把「补考名单」那一列也自己读出来——这一步留给你。');
    parts.push('（如果还是没懂，直接说「还是没懂」，我换个讲法再讲一遍。）');
    const out = this.reply(parts.join('\n\n'), 'full');
    out.code = codeLines.join('\n');
    out.sources = this.sourcesFor(['常见报错库 · ' + entry.type, '课程代码示例库 · ' + (entry.concept || '')]);
    out.suggestions = ['还是没懂', '我懂了', '以后路径别讲了'];
    return out;
  }

  sourcesFor(...groups) {
    return groups.flat().filter(Boolean);
  }
}

module.exports = { Agent, DEPTH_NAME, GRAIN_NAME };
