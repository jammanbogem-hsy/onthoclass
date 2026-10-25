const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const origin = process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';

async function setup(browser, agent) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__quizText = [];
    window.__quizAtlas = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      if (source instanceof HTMLImageElement && source.src.includes('iso-building.webp') && !window.__quizAtlas.includes('iso-building')) window.__quizAtlas.push('iso-building');
      return draw.call(this, source, ...args);
    };
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (['완료', '해결!', '함께 완료'].includes(text) && window.__quizText.length < 200) window.__quizText.push(text);
      return fill.call(this, text, ...args);
    };
  });
  // All business APIs are isolated fixtures, including on a production-origin smoke run.
  await page.route('**/api/jamworld/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/agent') && agent) return agent(route);
    if (path.endsWith('/agent/status')) return route.fulfill({ json: { providers: { openai: { configured: true, model: 'fixture' } } } });
    return route.fulfill({ json: path.endsWith('/me') ? { role: null, status: { db: true, files: true, imageGeneration: false, imageModel: '' } } : { assets: [], canManage: false } });
  });
  await page.goto(origin + '/jamworldmake/?view=worlds');
  await page.getByRole('button', { name: '＋ 새 월드', exact: true }).click();
  await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click();
  await page.locator('.ed-center canvas').waitFor();
  const id = new URL(page.url()).searchParams.get('id');
  const mapId = await page.evaluate(id => {
    const key = 'jamworld.guest.projects.v1', projects = JSON.parse(localStorage.getItem(key)), project = projects.find(p => p.id === id);
    const mapKey = 'jamworld.guest.map.v1.' + project.mapIds[0], doc = JSON.parse(localStorage.getItem(mapKey));
    Object.assign(doc, { name: '퀴즈 연습', spawn: { x: 12, y: 12 }, objects: [
      { id: 'board1', assetId: 'act.quiz', x: 12, y: 11, rot: 0 },
      { id: 'board2', assetId: 'act.quiz', x: 16, y: 11, rot: 90 },
      { id: 'portal1', assetId: 'act.portal', x: 14, y: 12, rot: 0 },
    ], zones: [], interactions: [
      { id: 'q1', type: 'quiz', x: 12, y: 11, question: '둘 중 큰 수는?', choices: ['1', '2'], answer: 1 },
      { id: 'q2', type: 'quiz', x: 16, y: 11, question: '하늘의 색은?', choices: ['파랑', '빨강'], answer: 0 },
      { id: 'p1', type: 'portal', x: 14, y: 12, targetMapId: doc.id + '-other', targetId: 'p2' },
    ] });
    const other = structuredClone(doc);
    Object.assign(other, { id: doc.id + '-other', name: '다른 맵', spawn: { x: 6, y: 7 }, objects: [
      { id: 'portal2', assetId: 'act.portal', x: 6, y: 6, rot: 0 },
      { id: 'board1', assetId: 'act.quiz', x: 8, y: 7, rot: 0 },
    ], interactions: [
      { id: 'p2', type: 'portal', x: 6, y: 6, targetMapId: doc.id, targetId: 'p1' },
      { id: 'q1', type: 'quiz', x: 8, y: 7, question: '다른 맵의 새 문제', choices: ['1', '2'], answer: 0 },
    ] });
    localStorage.setItem(mapKey, JSON.stringify(doc));
    localStorage.setItem('jamworld.guest.map.v1.' + other.id, JSON.stringify(other));
    project.mapIds.push(other.id); localStorage.setItem(key, JSON.stringify(projects));
    localStorage.setItem('moa.view', 'td');
    return doc.id;
  }, id);
  return { page, errors, id, mapId };
}

test('Correct answers replace the board, prevent reopening, survive view/portal changes and remain individual', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  let debugPage;
  try {
    const { page, errors, id, mapId } = await setup(browser);
    debugPage = page;
    const saved = await page.evaluate(mapId => localStorage.getItem('jamworld.guest.map.v1.' + mapId), mapId);
    await page.goto(origin + '/jamworldmake/?view=play&id=' + id);
    const quiz = page.getByRole('dialog', { name: '퀴즈', exact: true });
    await page.getByRole('button', { name: '퀴즈 풀기', exact: true }).click();
    await quiz.getByRole('button', { name: '1. 1', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__moaPerf().quizzes.completed), {});
    await quiz.getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: '퀴즈 풀기', exact: true }).click();
    await quiz.getByRole('button', { name: '2. 2', exact: true }).click();
    await quiz.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '완료', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.__moaPerf().quizzes), { completed: { q1: '완료' }, correct: ['q1'], attempts: 2 });
    await page.locator('.play canvas').click();
    await page.keyboard.press('e'); await page.keyboard.press('Space');
    assert.equal(await quiz.count(), 0, 'Keyboard interaction must also respect completion');
    await page.waitForFunction(() => window.__quizText.includes('완료'));
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(180); await page.keyboard.up('ArrowLeft');
    await page.screenshot({ path: '/tmp/jamworld-quiz-complete-td.png' });
    await page.evaluate(() => { window.__quizText = []; });
    await page.getByRole('button', { name: '입체로 보기', exact: true }).click();
    await page.waitForFunction(() => window.__moaPerf().view === 'iso' && window.__quizText.includes('완료') && window.__quizAtlas.includes('iso-building'));
    await page.screenshot({ path: '/tmp/jamworld-quiz-complete-iso.png' });
    await page.getByRole('button', { name: '위에서 보기', exact: true }).click();

    // Actually traverse both portal directions; the two maps intentionally reuse q1/board1 IDs.
    await page.locator('.play canvas').click();
    await page.keyboard.down('ArrowRight');
    await page.waitForURL(url => url.searchParams.get('map') === mapId + '-other');
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(() => window.__moaPerf().quizzes.attempts === 0);
    assert.deepEqual(await page.evaluate(() => window.__moaPerf().quizzes.completed), {});
    await page.waitForFunction(() => document.querySelector('[data-testid="quiz-score"]')?.textContent.includes('0/1'));
    assert.match(await page.getByTestId('quiz-score').innerText(), /0\/1/);
    await page.waitForTimeout(950);
    await page.keyboard.down('ArrowUp');
    await page.waitForURL(url => url.searchParams.get('map') === mapId);
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => window.__moaPerf().quizzes.completed.q1 === '완료');
    await page.waitForFunction(() => document.querySelector('[data-testid="quiz-score"]')?.textContent.includes('1/2'));
    assert.match(await page.getByTestId('quiz-score').innerText(), /1\/2/);
    assert.equal(await page.evaluate(mapId => localStorage.getItem('jamworld.guest.map.v1.' + mapId), mapId), saved);

    await page.reload();
    await page.waitForFunction(() => window.__moaPerf()?.player);
    assert.deepEqual(await page.evaluate(() => window.__moaPerf().quizzes.completed), {}, 'New play sessions start fresh');
    assert.deepEqual(errors, []);
  } catch (e) {
    console.error(e);
    if (debugPage) { await debugPage.screenshot({ path: '/tmp/jamworld-quiz-failure.png' }); console.error(await debugPage.locator('body').innerText()); }
    throw e;
  } finally { await browser.close(); }
});

test('Agent custom-completion commands are probed, repaired, applied and run through the isolated worker', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    let calls = 0;
    const source = 'World.onQuiz(r=>{if(r.correct){World.completeQuiz(r.id,"해결!");World.completeQuiz("q2","함께 완료");}});';
    const { page, errors, id } = await setup(browser, async route => {
      calls++;
      if (calls === 2) assert.match(route.request().postDataJSON().prompt, /없는문제/);
      await route.fulfill({ json: { provider: 'openai', model: 'fixture', latencyMs: 1, summary: '맞힌 문제와 다음 문제를 완료로 바꿉니다.', ops: [{ op: 'setScript', source: calls === 1 ? 'World.onQuiz(r=>{if(r.correct)World.completeQuiz("없는문제");});' : source }] } });
    });
    await page.goto(origin + '/jamworldmake/?view=editor&id=' + id);
    await page.getByLabel('맵 도우미 요청').fill('정답을 맞히면 해결!로 바꾸고 다음 물음표도 함께 완료로 표시해줘');
    await page.getByRole('button', { name: '도우미에게 부탁하기' }).click();
    await page.getByTestId('agent-preview').waitFor();
    assert.equal(calls, 2, 'Missing quiz IDs must be rejected before applying and sent back for repair');
    await page.getByTestId('agent-preview').getByRole('button', { name: '적용', exact: true }).click();
    await page.getByRole('button', { name: /저장 후 플레이/ }).click();
    const quiz = page.getByRole('dialog', { name: '퀴즈', exact: true });
    await page.getByRole('button', { name: '퀴즈 풀기', exact: true }).click();
    await quiz.getByRole('button', { name: '2. 2', exact: true }).click();
    await quiz.getByRole('button', { name: '확인', exact: true }).click();
    await page.waitForFunction(() => window.__moaPerf().quizzes.completed.q1 === '해결!' && window.__moaPerf().quizzes.completed.q2 === '함께 완료');
    assert.deepEqual(await page.evaluate(() => window.__moaPerf().quizzes.correct), ['q1']);
    assert.equal(await page.getByRole('button', { name: '완료', exact: true }).isDisabled(), true);
    await page.waitForFunction(() => window.__quizText.includes('해결!') && window.__quizText.includes('함께 완료'));
    await page.getByRole('button', { name: '입체로 보기', exact: true }).click();
    await page.waitForFunction(() => window.__moaPerf().view === 'iso' && window.__quizAtlas.includes('iso-building'));
    await page.screenshot({ path: '/tmp/jamworld-quiz-agent-complete.png' });
    assert.equal(await page.locator('.play-script-notice').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
