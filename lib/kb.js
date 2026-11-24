'use strict';
/**
 * 知识库（多课程包）
 * 每个课程一个目录：courses/<id>/{errors,concepts,analogies,lessons}.json
 * 课程索引：courses/index.json
 *
 * 检索策略：先精确类型匹配，再关键词打分；命中即返回来源，未收录则明确说没有。
 */
const fs = require('fs');
const path = require('path');

const COURSES_DIR = path.join(__dirname, '..', 'courses');

/** 课程包缓存：同一课程只读一次磁盘（部署后高频请求不再反复 IO） */
const packCache = new Map();

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadIndex() {
  return readJson(path.join(COURSES_DIR, 'index.json'));
}

function loadPack(courseId) {
  if (packCache.has(courseId)) return packCache.get(courseId);
  const dir = path.join(COURSES_DIR, courseId);
  const pack = {
    errors: readJson(path.join(dir, 'errors.json')),
    concepts: readJson(path.join(dir, 'concepts.json')),
    analogies: readJson(path.join(dir, 'analogies.json')),
    lessons: readJson(path.join(dir, 'lessons.json'))
  };
  packCache.set(courseId, pack);
  return pack;
}

class KnowledgeBase {
  constructor(courseId) {
    this.index = loadIndex();
    const ids = this.index.courses.map((c) => c.id);
    this.courseId = courseId && ids.includes(courseId) ? courseId : this.index.default;
    const pack = loadPack(this.courseId);
    this.errors = pack.errors;
    this.concepts = pack.concepts;
    this.analogies = pack.analogies;
    this.lessons = pack.lessons;
    this.analogyById = new Map(this.analogies.map((a) => [a.id, a]));
    this.meta = this.index.courses.find((c) => c.id === this.courseId);
  }

  analogy(id) {
    return this.analogyById.get(id);
  }

  /** 根据文本里的报错特征找报错条目 */
  matchError(text) {
    for (const entry of this.errors) {
      const hit = entry.patterns.some((p) => text.includes(p));
      if (hit) return entry;
    }
    return null;
  }

  /** 根据问句找概念条目 */
  matchConcept(text) {
    const lower = text.toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const c of this.concepts) {
      const names = [c.name, ...(c.aliases || [])];
      for (const n of names) {
        if (!n) continue;
        const key = String(n).toLowerCase();
        if (lower.includes(key)) {
          const score = key.length;
          if (score > bestScore) {
            best = c;
            bestScore = score;
          }
        }
      }
    }
    return best;
  }

  /** 课程资料检索（供回答标注来源 / 兜底） */
  searchLessons(text) {
    const lower = text.toLowerCase();
    const scored = [];
    for (const l of this.lessons) {
      let score = 0;
      for (const k of l.keywords || []) {
        if (lower.includes(String(k).toLowerCase())) score += 1;
      }
      if (score > 0) scored.push({ item: l, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 2).map((s) => s.item);
  }
}

/** 课程列表（供 API 与前端使用） */
function listCourses() {
  const idx = loadIndex();
  return {
    default: idx.default,
    courses: idx.courses.map((c) => {
      try {
        const pack = loadPack(c.id);
        return {
          ...c,
          counts: {
            errors: pack.errors.length,
            concepts: pack.concepts.length,
            analogies: pack.analogies.length,
            lessons: pack.lessons.length
          }
        };
      } catch (e) {
        return { ...c, counts: { errors: 0, concepts: 0, analogies: 0, lessons: 0 }, broken: true };
      }
    })
  };
}

module.exports = { KnowledgeBase, listCourses };
