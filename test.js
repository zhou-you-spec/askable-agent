'use strict';
/** 10 条验收用例：npm test / node test.js（需先启动 node server.js） */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let sid = null;
const results = [];

async function api(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}

async function say(text) {
  const r = await api('/api/chat', { sid, message: text });
  sid = r.sid;
  return r;
}

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  const s = await api('/api/session', {});
  sid = s.sid;
  check('会话号随机且不含身份信息', /^s_[0-9a-f]{12}$/.test(sid), sid);

  // 1 报错 → 1 档 只给思路，绝不出现代码
  let r = await say("读成绩表一直报错 FileNotFoundError: File b'成绩.csv' does not exist");
  check('① 报错先接住 / 不给代码', r.state.depth === 1 && !r.code && !/```/.test(r.text) && /翻译/.test(r.text));

  // 2 再给点提示 → 2 档 关键一行，仍不给完整代码
  r = await say('再给点提示');
  check('② 升级由学生说了算 → 2 档', r.state.depth === 2 && !r.code, r.state.depthName);

  // 3 我放弃了 → 3 档 完整代码
  r = await say('我放弃了');
  check('③ 亲口放弃才给完整代码', r.state.depth === 3 && !!r.code && r.code.includes('read_csv'));

  // 4 概念 → 先给生活类比
  r = await say('什么是 pip');
  check('④ 概念先给类比', /应用商店/.test(r.text) && !r.code);

  // 5 代写 → 温和拒绝
  r = await say('帮我把这次作业直接做完吧');
  check('⑤ 拒绝代写并引导', /不能替你|自己写/.test(r.text));

  // 6 情绪 → 先共情
  r = await say('我是不是太笨了');
  check('⑥ 先接住情绪', /不叫笨|每个人都走过/.test(r.text));

  // 7 跳过第 2 行 → 状态记忆
  r = await say('跳过第 2 行');
  check('⑦ 记住跳过第 2 行', r.state.skippedLines.includes(2) && /保留/.test(r.text));

  // 8 以后 import 别讲了 → 长期静音
  r = await say('以后 import 都别讲了');
  check('⑧ 记住长期跳过的概念', r.state.muted.some((m) => /import/.test(m)));

  // 9 IndentationError → 四段式
  r = await say('IndentationError: expected an indented block');
  check('⑨ 报错四段式（说人话/原因/先查这个）', /缩进/.test(r.text));

  // 10 知识库外的内容 → 不编造
  r = await say('什么是区块链共识机制');
  check('⑩ 查不到就直说没收录', /没收录|不会编/.test(r.text));

  // 附加：档位护栏
  await api('/api/state', { sid, depth: 1 });
  r = await say('df = pd.read_csv 这个怎么写');
  check('⑪ 1 档护栏：回复中不出现代码', !r.code && !/read_csv\(/.test(r.text.replace(/第 .* 行 log/g, '')));

  // 附加：教师周报
  const rep = await fetch(BASE + '/api/report').then((x) => x.json());
  check('⑫ 教师周报可出（聚合或示意）', !!rep.topErrors && Array.isArray(rep.depthDist));

  const passed = results.filter((x) => x.ok).length;
  console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error('测试异常：', e);
  process.exit(1);
});
