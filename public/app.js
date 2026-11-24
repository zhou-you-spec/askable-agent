'use strict';

const $ = (s) => document.querySelector(s);
const chat = $('#chat');
const input = $('#input');
const sendBtn = $('#sendBtn');

let sid = localStorage.getItem('askable.sid') || null;
let accessCode = localStorage.getItem('askable.code') || '';
let courseId = localStorage.getItem('askable.course') || '';
let classCode = localStorage.getItem('askable.class') || '';
let busy = false;
let typing = null; // { el, text, done }
let lastState = null;
let thinkingEl = null;

const WELCOME = [
  '晚上九点四十，实训室。屏幕上是一条报错，你看了二十分钟。',
  '在这儿，你可以把问题原样贴过来——不问你是谁，也不会有人笑你。'
];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function scrollDown() {
  chat.scrollTop = chat.scrollHeight;
}

function finishTyping() {
  if (!typing) return;
  clearTimeout(typing.timer);
  typing.el.textContent = typing.text;
  const done = typing.done;
  typing = null;
  if (done) done();
  scrollDown();
}

function typeOut(node, text, done) {
  let i = 0;
  const step = Math.max(1, Math.round(text.length / 80));
  typing = { el: node, text, done, timer: null };
  const tick = () => {
    if (!typing || typing.el !== node) return;
    i = Math.min(text.length, i + step);
    node.textContent = text.slice(0, i);
    scrollDown();
    if (i < text.length) typing.timer = setTimeout(tick, 16);
    else {
      typing = null;
      if (done) done();
      scrollDown();
    }
  };
  tick();
}

chat.addEventListener('click', () => {
  if (typing) finishTyping();
});

function pushUser(text) {
  chat.appendChild(el('div', 'msg user', text));
  scrollDown();
}

/* 它正在想… */
function showThinking() {
  hideThinking();
  thinkingEl = el('div', 'msg bot thinking');
  const d = el('div', 'body dots');
  d.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  thinkingEl.appendChild(d);
  chat.appendChild(thinkingEl);
  scrollDown();
}

function hideThinking() {
  if (thinkingEl) {
    thinkingEl.remove();
    thinkingEl = null;
  }
}

function pushBot(res) {
  hideThinking();
  finishTyping();
  const wrap = el('div', 'msg bot');
  const body = el('div', 'body');
  wrap.appendChild(body);
  chat.appendChild(wrap);
  scrollDown();

  typeOut(body, res.text, () => {
    if (res.code) {
      const pre = el('pre', 'codeblock');
      pre.textContent = res.code;
      wrap.appendChild(pre);
      const cbtn = el('button', 'copybtn', '复制代码');
      cbtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(res.code);
          cbtn.textContent = '已复制';
        } catch (e) {
          cbtn.textContent = '复制失败，手动选一下';
        }
        setTimeout(() => (cbtn.textContent = '复制代码'), 1400);
      };
      wrap.appendChild(cbtn);
    }
    if (res.sources && res.sources.length) {
      wrap.appendChild(el('div', 'sources', '来源：' + res.sources.join(' · ')));
    }
    if (res.suggestions && res.suggestions.length) {
      const s = el('div', 'suggest');
      for (const q of res.suggestions) {
        const b = el('button', '', q);
        b.type = 'button';
        b.onclick = () => ask(q);
        s.appendChild(b);
      }
      wrap.appendChild(s);
    }
    scrollDown();
  });

  if (res.state) paintState(res.state);
}

function pushSys(text) {
  finishTyping();
  chat.appendChild(el('div', 'msg sys', text));
  scrollDown();
}

function paintState(state) {
  lastState = state;
  if (!$('#recordModal').hidden) renderRecord();
  $('#chipDepth').textContent = '当前档位：' + state.depthName;
  $('#chipSkip').textContent = '本次跳过：' + (state.skippedLines.length ? state.skippedLines.map((n) => n + ' 行').join('、') : '无');
  $('#chipMute').textContent = '长期跳过：' + (state.muted.length ? state.muted.join('、') : '无');
  $('#chipLearned').textContent = '已掌握：' + (state.learned && state.learned.length ? state.learned.join('、') : '无');
  document.querySelectorAll('#depthSeg button').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.depth) === state.depth);
  });
  document.querySelectorAll('#grainSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.grain === state.grain);
  });
}

/* ---------- 课程与班级码 ---------- */
async function loadCourses() {
  const resp = await fetch('/api/courses', { headers: { 'x-access-code': accessCode } });
  if (resp.status === 401) {
    $('#gate').hidden = false;
    return null;
  }
  const data = await resp.json();
  const sel = $('#courseSel');
  sel.innerHTML = '';
  for (const c of data.courses) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
  const valid = data.courses.some((c) => c.id === courseId);
  courseId = valid ? courseId : data.default;
  sel.value = courseId;
  localStorage.setItem('askable.course', courseId);
  sel.onchange = async () => {
    courseId = sel.value;
    localStorage.setItem('askable.course', courseId);
    try {
      const r = await api('/api/session', {});
      sid = r.sid;
      localStorage.setItem('askable.sid', sid);
      paintState(r.state);
      pushSys('已切到「' + r.state.courseName + '」——机制不动，只换了知识库；档位重置为 1 档。');
    } catch (e) {
      /* 访问码分支已在 api() 处理 */
    }
  };
  $('#classInput').value = classCode;
  $('#classInput').onchange = () => {
    classCode = $('#classInput').value.trim();
    localStorage.setItem('askable.class', classCode);
    pushSys(classCode ? '班级码已记录：' + classCode + '（只用于班级维度汇总，不关联个人）' : '已清除班级码。');
  };
  return data;
}

async function api(path, body) {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-access-code': accessCode },
    body: JSON.stringify({ courseId, classCode, ...(body || {}) })
  });
  if (resp.status === 401) {
    $('#gate').hidden = false;
    setTimeout(() => $('#gateInput').focus(), 50);
    throw new Error('需要访问码');
  }
  if (!resp.ok) throw new Error('请求失败 ' + resp.status);
  return resp.json();
}

async function ask(text) {
  const message = String(text !== undefined ? text : input.value).trim();
  if (!message || busy) return;
  busy = true;
  sendBtn.disabled = true;
  finishTyping();
  pushUser(message);
  input.value = '';
  input.style.height = 'auto';
  try {
    const res = await api('/api/chat', { sid, message });
    sid = res.sid;
    localStorage.setItem('askable.sid', sid);
    pushBot(res);
  } catch (e) {
    if (e.message !== '需要访问码') pushSys('网络走神了，再发一次试试。（' + e.message + '）');
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function setState(patch) {
  if (!sid) return;
  api('/api/state', { sid, ...patch }).then((r) => paintState(r.state)).catch(() => {});
}

sendBtn.onclick = () => ask();
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    ask();
  }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
});

document.querySelectorAll('#depthSeg button').forEach((b) => {
  b.onclick = () => {
    setState({ depth: Number(b.dataset.depth) });
    pushSys('你把档位拨到了 ' + b.textContent);
  };
});
document.querySelectorAll('#grainSeg button').forEach((b) => {
  b.onclick = () => {
    setState({ grain: b.dataset.grain });
    pushSys('讲解粒度改为：' + b.textContent);
  };
});

const QUICK = [
  '我不敢问',
  '什么是 pip',
  'FileNotFoundError：读成绩表一直报错',
  '再给点提示',
  '我放弃了',
  '还是没懂',
  '跳过第 2 行',
  '以后 import 都别讲了',
  '帮我把这次作业直接做完吧',
  '我是不是太笨了'
];
const quickBox = $('#quick');
QUICK.forEach((q) => {
  const b = el('button', '', q);
  b.type = 'button';
  b.onclick = () => ask(q);
  quickBox.appendChild(b);
});

/* ---------- 教师周报 ---------- */
async function openReport() {
  const resp = await fetch('/api/report?days=7', { headers: { 'x-access-code': accessCode } });
  if (resp.status === 401) {
    $('#gate').hidden = false;
    return;
  }
  const r = await resp.json();
  $('#reportSample').textContent = r.sample ? '示意数据' : '真实数据';
  $('#reportNote').textContent = r.note || '';

  const bars = $('#reportBars');
  bars.innerHTML = '';
  const max = Math.max(...r.topErrors.map((x) => x.count), 1);
  r.topErrors.forEach((item) => {
    const row = el('div', 'bar');
    row.appendChild(el('span', '', item.name));
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    fill.style.width = Math.round((item.count / max) * 100) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', '', String(item.count)));
    bars.appendChild(row);
  });

  const dep = $('#reportDepth');
  dep.innerHTML = '';
  r.depthDist.forEach((item) => {
    const row = el('div', 'bar');
    row.appendChild(el('span', '', item.level));
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    fill.style.width = item.pct + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', '', item.pct + '%'));
    dep.appendChild(row);
  });

  const trend = $('#reportTrend');
  trend.innerHTML = '';
  const rows = r.trend && r.trend.length ? r.trend : [{ date: '—', count: 0 }];
  const tmax = Math.max(...rows.map((x) => x.count), 1);
  rows.forEach((t) => {
    const col = el('div', 'tcol');
    const bar = el('div', 'tbar');
    bar.style.height = Math.max(4, Math.round((t.count / tmax) * 64)) + 'px';
    bar.title = t.date + '：' + t.count + ' 次';
    col.appendChild(bar);
    col.appendChild(el('span', '', t.date));
    trend.appendChild(col);
  });

  $('#reportAdvice').textContent = r.suggestion;
  $('#reportModal').hidden = false;
}

$('#reportBtn').onclick = openReport;
$('#closeReport').onclick = () => ($('#reportModal').hidden = true);
$('#reportModal').addEventListener('click', (e) => {
  if (e.target.id === 'reportModal') $('#reportModal').hidden = true;
});

$('#exportCsv').onclick = async () => {
  const resp = await fetch('/api/report.csv?days=7', { headers: { 'x-access-code': accessCode } });
  if (!resp.ok) return;
  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'weekly-report.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

/* ---------- 首次引导 ---------- */
let onboardIdx = 0;
const slides = document.querySelectorAll('#onboard .slide');
const dots = document.querySelectorAll('#onboard .dots i');

function showSlide(i) {
  onboardIdx = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, k) => (s.hidden = k !== onboardIdx));
  dots.forEach((d, k) => d.classList.toggle('on', k === onboardIdx));
  $('#onboardNext').textContent = onboardIdx === slides.length - 1 ? '开始吧' : '下一步';
}

function openOnboard() {
  showSlide(0);
  $('#onboard').hidden = false;
}

$('#onboardNext').onclick = () => {
  if (onboardIdx < slides.length - 1) showSlide(onboardIdx + 1);
  else {
    localStorage.setItem('askable.onboarded', '1');
    $('#onboard').hidden = true;
  }
};
$('#helpBtn').onclick = openOnboard;

/* ---------- 语音输入：说不出口的时候，说出来也行 ---------- */
(function voiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#micBtn');
  if (!SR) {
    if (btn) btn.remove();
    return;
  }
  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let listening = false;

  btn.onclick = () => {
    if (listening) {
      rec.stop();
      return;
    }
    try {
      rec.start();
      listening = true;
      btn.classList.add('on');
      pushSys('我在听。说出来就行，说完我会自动发出去。');
    } catch (e) {
      pushSys('麦克风没打开，先检查一下浏览器的麦克风权限。');
    }
  };
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    if (text) ask(text);
  };
  rec.onend = () => {
    listening = false;
    btn.classList.remove('on');
  };
  rec.onerror = () => {
    listening = false;
    btn.classList.remove('on');
    pushSys('没听清。再说一次，或者直接打字也行。');
  };
})();

/* ---------- 我的记录 ---------- */
function renderRecord() {
  const s = lastState || { learned: [], stuck: [] };
  const boxL = $('#recordLearned');
  const boxK = $('#recordStuck');
  if (!boxL || !boxK) return;
  boxL.innerHTML = '';
  boxK.innerHTML = '';
  const learned = s.learned || [];
  const stuck = s.stuck || [];
  if (!learned.length) boxL.appendChild(el('span', 'tag empty', '还没有——慢慢来，第一次弄懂就会记在这儿'));
  else learned.forEach((x) => boxL.appendChild(el('span', 'tag ok', x)));
  if (!stuck.length) boxK.appendChild(el('span', 'tag empty', '暂时没有反复卡住的点'));
  else stuck.forEach((x) => boxK.appendChild(el('span', 'tag', x.name + ' ×' + x.count)));
}

$('#recordBtn').onclick = () => {
  renderRecord();
  $('#recordModal').hidden = false;
};
$('#closeRecord').onclick = () => ($('#recordModal').hidden = true);
$('#recordModal').addEventListener('click', (e) => {
  if (e.target.id === 'recordModal') $('#recordModal').hidden = true;
});

/* ---------- 启动 ---------- */
async function boot() {
  try {
    const data = await loadCourses();
    if (!data) return;
    const r = await api('/api/session', { sid });
    sid = r.sid;
    localStorage.setItem('askable.sid', sid);
    paintState(r.state);
    WELCOME.forEach(pushSys);
    pushSys('当前课程：' + r.state.courseName + '（换课程只换知识库，机制不变）');
  } catch (e) {
    if (e.message !== '需要访问码') pushSys('服务端没连上，请确认 npm start 已运行。');
  }
}

$('#gateBtn').onclick = () => {
  const v = $('#gateInput').value.trim();
  if (!v) {
    $('#gateErr').textContent = '请输入演示码 demo';
    return;
  }
  localStorage.setItem('askable.code', v);
  location.reload();
};
$('#gateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#gateBtn').click();
});

boot();
