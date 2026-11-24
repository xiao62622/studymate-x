const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwrightPath = process.env.STUDYMATE_PLAYWRIGHT_PATH || 'playwright-core';
try { require.resolve(playwrightPath); } catch (_) { playwrightPath = 'C:/Users/34829/.codex/tools/rea-6.9.0/package/node_modules/playwright-core'; }
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'studymate.user.js'), 'utf8');
const clip = fs.readFileSync(path.join(root, 'demo.mp4'));
const origin = 'https://mooc1.chaoxing.com';
const study = `${origin}/mycourse/studentstudy?courseId=1&clazzid=A`;
const nextCourse = `${origin}/mycourse/studentstudy?courseId=2&clazzid=A`;
const saved = (options = {}) => ({
  v: 1, settings: { playback: { autoPlay: false, autoNext: false, autoCourse: false, ...options } },
  courses: [
    { id: 'one', name: '光学', cxCourseId: '1', cxClazzId: 'A', log: [], href: study },
    { id: 'two', name: '力学', cxCourseId: '2', cxClazzId: 'A', log: [], href: nextCourse }
  ], books: [], cards: [], focus: { sessions: [] }
});
const media = (count = 1) => Array.from({ length: count }, (_, i) => `<video id="v${i}" width="240" height="140" controls muted playsinline preload="auto" src="/clip.mp4"></video>`).join('');
function fixture({ chapters = 3, frame = false, frames = false, locked = false, noNav = false, noMedia = false, noClick = false, home = false, wisdom = false } = {}) {
  const list = noNav ? '' : Array.from({ length: chapters }, (_, i) => wisdom ?
    `<li class="video ${i === 0 ? 'current_play' : ''}" id="lesson${i}"><span class="catalogue_title">第 ${i + 1} 节</span></li>` :
    `<div class="posCatalog_select ${i === 0 ? 'posCatalog_active' : ''} ${locked && i === 1 ? 'locked' : ''}" id="lesson${i}"><span class="posCatalog_name">第 ${i + 1} 节</span></div>`).join('');
  const html = `<!doctype html><html data-studymate-platform="${wisdom ? 'zhs' : 'cx'}" data-studymate-role="${home ? 'courseHome' : 'study'}"><head><title>光学</title></head><body>
    <input id="curCourseId" value="1"><input id="curClazzId" value="A"><input id="curChapterId" value="lesson0">
    <h1 class="chapter-title">第 1 节</h1><nav>${list}</nav>
    ${noMedia ? '' : frame || frames ? `<iframe id="player" src="https://player.chaoxing.com/frame${frames ? '?nested=1' : ''}"></iframe>${frames ? '<iframe id="other" src="https://other.chaoxing.com/frame"></iframe>' : ''}` : media()}
    <script>
      window.clicks = 0;
      document.querySelectorAll('.posCatalog_select,li.video').forEach(el => el.onclick = () => {
        window.clicks++; if (${noClick}) return;
        document.querySelectorAll('.posCatalog_select,li.video').forEach(row => row.classList.remove('posCatalog_active','current_play'));
        el.classList.add('${wisdom ? 'current_play' : 'posCatalog_active'}');
        document.querySelector('#curChapterId').value = el.id;
        document.querySelector('h1').textContent = el.textContent;
        document.querySelectorAll('video').forEach(v => v.load());
      });
    </script><script src="/studymate.user.js"></script></body></html>`;
  return html;
}
const getState = page => page.evaluate(() => JSON.parse(localStorage.getItem('studymate:v1')));
const status = page => page.locator('#studymate-host .playback-status');
const note = page => page.locator('#studymate-host .playback-note');
const button = (page, text) => page.locator('#studymate-host').getByRole('button', { name: text, exact: true });
const checkbox = (page, text) => page.locator('#studymate-host').getByLabel(text, { exact: true });
let browser, passed = 0;
async function setup(html, options = {}, url = study) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  await context.addInitScript(seed => {
    try {
      if (!localStorage.getItem('studymate:v1')) localStorage.setItem('studymate:v1', JSON.stringify(seed));
      window.GM_getValue = (key, fallback) => localStorage.getItem(key) || fallback;
      window.GM_setValue = (key, value) => localStorage.setItem(key, value);
    } catch (_) {}
  }, saved(options));
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/studymate.user.js') return route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: script });
    if (u.pathname === '/clip.mp4') return route.fulfill({ contentType: 'video/mp4', body: clip });
    if (u.pathname === '/frame') {
      const inner = u.searchParams.has('nested') ? '<iframe src="https://nested.chaoxing.com/frame"></iframe>' : media();
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${inner}<script src="/studymate.user.js"></script></body></html>` });
    }
    if (u.pathname === '/same-frame') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><body><iframe src="/same-player"></iframe></body></html>' });
    if (u.pathname === '/same-player') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><body>${media()}</body></html>` });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('pageerror:', error.stack));
  await page.goto(url); await page.waitForTimeout(200); await page.waitForSelector('#studymate-host', { state: 'attached', timeout: 5000 });
  await page.waitForTimeout(1000);
  return { context, page, errors };
}
async function test(name, fn) {
  await fn(); passed++; console.log(`PASS ${name}`);
}
async function ready(page) { await page.waitForFunction(() => document.querySelector('video')?.readyState > 0); }
async function finish(page) {
  await ready(page);
  await page.evaluate(async () => {
    const v = document.querySelector('video'); v.currentTime = v.duration - 0.12; await v.play();
  });
  await page.waitForFunction(() => document.querySelector('video').ended);
}
(async () => {
  browser = await chromium.launch({ executablePath: process.env.STUDYMATE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  await test('旧备份迁移、自动开关默认关闭、播放和手动暂停', async () => {
    const { context, page, errors } = await setup(fixture()); await ready(page);
    assert.equal(await page.locator('video').evaluate(v => v.paused), true);
    await checkbox(page, '自动播放').check();
    await page.waitForFunction(() => !document.querySelector('video').paused);
    assert.equal((await getState(page)).settings.playback.autoPlay, true);
    await page.locator('video').evaluate(v => v.pause()); await page.waitForTimeout(2200);
    assert.equal(await page.locator('video').evaluate(v => v.paused), true);
    await button(page, '播放 / 继续').click(); await page.waitForFunction(() => !document.querySelector('video').paused);
    await button(page, '停止自动').click();
    assert.equal(await page.locator('video').evaluate(v => v.paused), true);
    assert.deepEqual((await getState(page)).settings.playback, { autoPlay: false, autoNext: false, autoCourse: false });
    assert.deepEqual(errors, []); await context.close();
  });
  await test('默认 1 倍速且移除 0.5 倍速，AI API 配置可保存', async () => {
    const { context, page, errors } = await setup(fixture());
    const speed = page.locator('#studymate-host select').first();
    assert.equal(await speed.inputValue(), '1');
    assert.deepEqual(await speed.locator('option').allTextContents(), ['0.75×', '1×', '1.25×', '1.5×', '2×', '3×', '4×']);
    await page.locator('#studymate-host').getByRole('button', { name: 'AI API', exact: true }).click();
    const apiFields = page.locator('#studymate-host .field');
    await apiFields.filter({ hasText: '服务商' }).locator('select').selectOption('claude');
    await apiFields.filter({ hasText: 'API Key' }).locator('input').fill('test-key');
    await apiFields.filter({ hasText: '模型' }).locator('input').fill('claude-test');
    await page.locator('#studymate-host').getByRole('button', { name: '保存配置', exact: true }).click();
    const data = await getState(page);
    assert.equal(data.settings.ai.provider, 'claude');
    assert.equal(data.settings.ai.apiKey, 'test-key');
    assert.equal(data.settings.ai.model, 'claude-test');
    assert.match(data.settings.ai.endpoint, /anthropic\.com\/v1\/messages/);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('4 倍速锁定并抵抗播放器重置', async () => {
    const { context, page, errors } = await setup(fixture()); await ready(page);
    const speed = page.locator('#studymate-host select').first();
    await speed.selectOption('4');
    await page.waitForFunction(() => document.querySelector('video').playbackRate === 4);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      const setter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate').set;
      // Simulate the platform player applying its own 1× default through the
      // native prototype setter, bypassing the userscript's instance lock.
      setter.call(v, 1);
    });
    await page.waitForTimeout(1200);
    const rates = await page.locator('video').evaluate(v => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
      return { exposed: v.playbackRate, native: descriptor.get.call(v) };
    });
    assert.equal(rates.exposed, 4);
    assert.equal(rates.native, 4);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('AI API 测试连接使用用户脚本跨域通道', async () => {
    const { context, page, errors } = await setup(fixture());
    await page.evaluate(() => {
      window.__gmRequests = [];
      window.GM_xmlhttpRequest = options => {
        window.__gmRequests.push({ url: options.url, method: options.method, data: options.data, headers: options.headers });
        setTimeout(() => options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '连接成功' } }] }) }), 0);
        return { abort() {} };
      };
    });
    assert.equal(await page.evaluate(() => typeof GM_xmlhttpRequest), 'function');
    await page.locator('#studymate-host').getByRole('button', { name: 'AI API', exact: true }).click();
    const apiFields = page.locator('#studymate-host .field');
    await apiFields.filter({ hasText: '服务商' }).locator('select').selectOption('custom');
    await apiFields.filter({ hasText: 'API 地址' }).locator('input').fill('https://api.example.test/v1/chat/completions');
    await apiFields.filter({ hasText: 'API Key' }).locator('input').fill('test-key');
    await apiFields.filter({ hasText: '模型' }).locator('input').fill('test-model');
    await page.locator('#studymate-host').getByRole('button', { name: '测试连接', exact: true }).click();
    await page.locator('#studymate-host .course').filter({ hasText: '连接成功' }).waitFor();
    const request = await page.evaluate(() => window.__gmRequests[0]);
    assert.equal(request.url, 'https://api.example.test/v1/chat/completions');
    assert.equal(request.method, 'POST');
    assert.equal(JSON.parse(request.data).model, 'test-model');
    assert.equal(request.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(errors, []); await context.close();
  });
  async function configureAnswerModel(page, provider) {
    await page.evaluate(() => {
      window.answerRequests = [];
      window.GM_xmlhttpRequest = options => {
        window.answerRequests.push(JSON.parse(options.data));
        setTimeout(() => options.onload({ status: 200, responseText: JSON.stringify({
          content: [{ text: '测试模型的解答' }]
        }) }), 0);
      };
    });
    await button(page, 'AI API').click();
    await page.locator('#studymate-host .field select').selectOption(provider);
    await checkbox(page, 'API Key').fill('test-key');
    await checkbox(page, '模型').fill('test-model');
    await button(page, '保存配置').click();
    await button(page, '答题').click();
  }
  await test('嵌套章节测验读取正常与自定义字体，自动解答去重且不填写', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    await page.evaluate(() => {
      window.GM_getResourceText = () => '{"12345678":20809}';
      window.Typr = {
        parse: () => [{}],
        U: { codeToGlyph: (_, code) => code === 21526 ? 1 : 0, glyphToPath: () => ({ cmds: ['M'], crds: [0, 0] }) }
      };
      window.md5 = () => '12345678';
    });
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await frame.evaluate(() => {
      document.head.insertAdjacentHTML('beforeend', '<style>/* .font-cxsecret base64,AQ== */</style>');
      document.body.innerHTML = `
        <div class="TiMu"><div class="fontLabel">【单选题】<span class="font-cxsecret">吖是波吗？</span></div>
          <div class="before-after"><input type="radio">A. 是</div><div class="before-after">B. 否</div></div>
        <div class="TiMu" hidden><div class="fontLabel">隐藏题目</div></div>
        <div class="TiMu"><div class="fontLabel">看图</div><ul class="Zy_ulTop"><li><img style="width:20px;height:20px"></li></ul></div>`;
    });
    await configureAnswerModel(page, 'openai');
    const panel = page.locator('#studymate-host');
    await panel.getByText('已检测到 2 道题', { exact: true }).waitFor();
    await panel.getByText('这道题包含图片，可用截图问答。').waitFor();
    assert.deepEqual(await page.evaluate(() => answerRequests), []);
    await checkbox(page, '自动解答检测到的题目').check();
    await panel.getByText('测试模型的解答').waitFor();
    await page.waitForTimeout(1900);
    const requests = await page.evaluate(() => answerRequests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].messages.at(-1).content, '【单选题】光是波吗？\nA. 是\nB. 否');
    assert.equal(await frame.locator('input[type=radio]').isChecked(), false);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('嵌套播放器只解答可见且已加载选项的视频弹题', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await configureAnswerModel(page, 'openai');
    await checkbox(page, '自动解答检测到的题目').check();
    await frame.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="ans-timelineobjects" style="visibility:hidden">
          <div class="ans-videoquiz"><div class="tkTopic">
            <div class="tkTopic_title">判断题</div>
            <div class="tkTopic_con"><div class="tkItem">
              <div class="tkItem_title">真空中的光速大于声速。</div>
              <ul class="tkItem_ul"></ul>
            </div></div>
            <div class="tkTopic_oper"><button id="videoquiz-submit">提交</button></div>
          </div></div>
        </div>`);
      document.querySelector('#videoquiz-submit').onclick = () => { window.quizSubmitted = true; };
    });
    const quiz = frame.locator('.ans-timelineobjects');
    const panel = page.locator('#studymate-host');
    await page.waitForTimeout(1000);
    assert.equal(await panel.getByText('当前页面未检测到题目').count(), 1);
    await quiz.evaluate(el => { el.style.visibility = 'visible'; });
    await page.waitForTimeout(1900);
    assert.deepEqual(await page.evaluate(() => answerRequests), []);
    await quiz.locator('.tkItem_ul').evaluate(el => {
      el.innerHTML = `
        <li class="ans-videoquiz-opt"><label><input type="radio" name="ans-videoquiz-opt">A、对</label></li>
        <li class="ans-videoquiz-opt"><label><input type="radio" name="ans-videoquiz-opt">B、错</label></li>`;
    });
    await panel.getByText('测试模型的解答').waitFor();
    await quiz.evaluate(el => { el.style.visibility = 'hidden'; });
    await panel.getByText('当前页面未检测到题目').waitFor();
    await quiz.evaluate(el => { el.style.visibility = 'visible'; });
    await panel.getByText('测试模型的解答').waitFor();
    await page.waitForTimeout(1900);
    const requests = await page.evaluate(() => answerRequests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].messages.at(-1).content, '【判断题】真空中的光速大于声速。\nA、对\nB、错');
    assert.equal(await quiz.locator('input:checked').count(), 0);
    assert.equal(await frame.evaluate(() => !!window.quizSubmitted), false);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('视频弹题保留已有解答，关闭自动提交取消倒计时，关闭定时提交立即提交一次', async () => {
    const { context, page, errors } = await setup(fixture({ noMedia: true }));
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="ans-timelineobjects"><div class="ans-videoquiz">
          <div class="tkTopic_title">判断题</div><div class="tkTopic_con"><div class="tkItem">
            <div class="tkItem_title">真空中的光速大于声速。</div><ul class="tkItem_ul">
              <li class="ans-videoquiz-opt"><input type="radio" id="vqa" name="quiz"><label for="vqa">A、对</label></li>
              <li class="ans-videoquiz-opt"><input type="radio" id="vqb" name="quiz"><label for="vqb">B、错</label></li>
            </ul></div></div><button id="videoquiz-submit">提交</button>
        </div></div>`);
      window.submissions = 0;
      document.querySelector('#videoquiz-submit').onclick = () => { window.submissions++; };
      window.GM_xmlhttpRequest = options => {
        window.answerRequests.push(JSON.parse(options.data));
        options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: '```json\n{"answers":["A"],"explanation":"光在真空中可以传播。"}\n```' } }]
        }) });
      };
    });
    const autoSubmit = checkbox(page, '自动填充并提交答案');
    const timedSubmit = checkbox(page, '定时提交');
    const delay = checkbox(page, '填充后等待（秒）');
    assert.equal(await autoSubmit.isChecked(), false);
    assert.equal(await timedSubmit.isChecked(), false);
    await button(page, '解答此题').click();
    const panel = page.locator('#studymate-host');
    await panel.getByText('光在真空中可以传播。', { exact: false }).waitFor();
    assert.equal(await page.locator('#vqa').isChecked(), false);
    assert.equal(await page.evaluate(() => window.submissions), 0);
    await timedSubmit.check();
    assert.equal(await delay.inputValue(), '30');
    await delay.fill('2');
    await delay.press('Tab');
    await autoSubmit.check();
    await panel.getByText('答案已填充，将在 00:02 后提交。').waitFor();
    assert.equal(await page.locator('#vqa').isChecked(), true);
    await autoSubmit.uncheck();
    await page.waitForTimeout(2800);
    assert.equal(await page.evaluate(() => window.submissions), 0);
    await autoSubmit.check();
    await panel.getByText('答案已填充，将在 00:02 后提交。').waitFor();
    assert.equal(await page.evaluate(() => window.submissions), 0);
    await timedSubmit.uncheck();
    assert.equal(await page.evaluate(() => window.submissions), 1);
    assert.equal((await getState(page)).settings.autoSubmit, true);
    await page.locator('.ans-videoquiz').evaluate(el => { el.hidden = true; });
    await panel.getByText('当前页面未检测到题目').waitFor();
    await page.locator('.ans-videoquiz').evaluate(el => { el.hidden = false; });
    await panel.getByText('光在真空中可以传播。', { exact: false }).waitFor();
    assert.deepEqual(await page.evaluate(() => [window.submissions, answerRequests.length]), [1, 1]);
    await page.reload();
    await autoSubmit.waitFor();
    assert.equal(await autoSubmit.isChecked(), true);
    assert.equal(await timedSubmit.isChecked(), false);
    await timedSubmit.check();
    assert.equal(await delay.inputValue(), '2');
    assert.deepEqual(errors, []); await context.close();
  });
  await test('视频弹题提交后停播满 15 秒才重读题面并提交新答案', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await configureAnswerModel(page, 'openai');
    await frame.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="ans-timelineobjects"><div class="ans-videoquiz">
          <div class="tkTopic_title">判断题</div><div class="tkTopic_con"><div class="tkItem">
            <div class="tkItem_title">真空中的光速大于声速。</div><ul class="tkItem_ul">
              <li class="ans-videoquiz-opt"><label><input type="radio" name="quiz" value="A">A、对</label></li>
              <li class="ans-videoquiz-opt"><label><input type="radio" name="quiz" value="B">B、错</label></li>
            </ul></div></div><button id="videoquiz-submit">提交</button>
        </div></div>`);
      window.submissions = [];
      document.querySelector('#videoquiz-submit').onclick = () => {
        const answer = document.querySelector('input:checked').value;
        window.submissions.push({ answer, at: Date.now() });
        if (answer === 'A') {
          document.querySelector('.ans-videoquiz').hidden = true;
          document.querySelector('video').play();
        }
      };
    });
    await page.evaluate(() => {
      window.GM_xmlhttpRequest = options => {
        window.answerRequests.push(JSON.parse(options.data));
        const choice = window.answerRequests.length === 1 ? 'B' : 'A';
        options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ answers: [choice], explanation: '测试' }) } }]
        }) });
      };
    });
    await checkbox(page, '自动填充并提交答案').check();
    await button(page, '解答此题').click();
    await frame.waitForFunction(() => submissions.length === 1);
    await frame.waitForFunction(() => submissions.length === 2 && !document.querySelector('video').paused, null, { timeout: 20000 });
    const [first, retry] = await frame.evaluate(() => submissions);
    assert.equal(first.answer, 'B');
    assert.equal(retry.answer, 'A');
    assert.ok(retry.at - first.at >= 15000);
    assert.deepEqual(await page.evaluate(() => answerRequests.length), 2);
    assert.match(await page.evaluate(() => answerRequests[1].messages.at(-1).content), /此前选择：B/);
    assert.deepEqual(errors, []); await context.close();
  });
  async function verifyVideoQuizFeedback(rewind) {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await configureAnswerModel(page, 'openai');
    await frame.evaluate(async rewind => {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="ans-timelineobjects">
          <div class="ans-videoquiz">
            <div class="tkTopic_title">判断题</div><div class="tkTopic_con"><div class="tkItem">
              <div class="tkItem_title">真空中的光速大于声速。</div><ul class="tkItem_ul">
                <li class="ans-videoquiz-opt"><label><input type="radio" name="quiz" value="A">A、对</label></li>
                <li class="ans-videoquiz-opt"><label><input type="radio" name="quiz" value="B">B、错</label></li>
              </ul></div></div><button id="videoquiz-submit">提交</button>
          </div>
          <div id="feedback" hidden><p id="spanNot">回答错误</p>
            ${rewind ? '<button id="knowledgeBack">回看</button>' : '<button id="videoquiz-continue">继续学习</button>'}
          </div>
        </div>`);
      const video = document.querySelector('video');
      await video.play();
      video.pause();
      video.currentTime = 1.5;
      window.submissions = [];
      window.continues = 0;
      const quiz = document.querySelector('.ans-videoquiz');
      const overlay = quiz.parentElement;
      document.querySelector('#videoquiz-submit').onclick = () => {
        const answer = document.querySelector('input:checked').value;
        submissions.push(answer);
        quiz.remove();
        if (answer === 'A') video.play();
        else document.querySelector('#feedback').hidden = false;
      };
      document.querySelector('#feedback button').onclick = () => {
        continues++;
        video.currentTime += rewind ? -0.5 : 0.5;
      };
      window.showQuizAgain = () => {
        video.pause();
        overlay.prepend(quiz);
      };
    }, rewind);
    await page.evaluate(() => {
      window.GM_xmlhttpRequest = options => {
        answerRequests.push(JSON.parse(options.data));
        const answer = answerRequests.length === 1 ? 'B' : 'A';
        options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ answers: [answer], explanation: '' }) } }]
        }) });
      };
    });
    await checkbox(page, '自动填充并提交答案').check();
    await button(page, '解答此题').click();
    await frame.waitForFunction(() => continues === 1);
    await frame.waitForTimeout(1100);
    assert.deepEqual(await frame.evaluate(() => [submissions, continues, document.querySelector('video').paused]), [['B'], 1, true]);
    const time = await frame.evaluate(() => {
      document.querySelector('#feedback').hidden = true;
      return document.querySelector('video').currentTime;
    });
    await frame.waitForFunction(time => {
      const video = document.querySelector('video');
      return !video.paused && video.currentTime > time + 0.1;
    }, time);
    if (rewind) {
      await frame.evaluate(() => showQuizAgain());
      await frame.waitForFunction(() => submissions.length === 2 && !document.querySelector('video').paused);
      assert.deepEqual(await frame.evaluate(() => submissions), ['B', 'A']);
      assert.match(await page.evaluate(() => answerRequests[1].messages.at(-1).content), /此前选择：B/);
    }
    assert.deepEqual(errors, []); await context.close();
  }
  await test('视频弹题答错后继续处理已隐藏题干的反馈，并在弹层关闭后续播', () => verifyVideoQuizFeedback(false));
  await test('视频弹题答错后按平台要求回看，重新弹题时重答', () => verifyVideoQuizFeedback(true));
  await test('嵌套章节测验在最后一题填好后才开始倒计时，归零后提交并确认一次', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await frame.evaluate(() => {
      document.body.innerHTML = `<form id="workForm">
        <div class="TiMu" id="single"><div class="fontLabel">【单选题】光速与声速哪个大？</div>
          <ul class="Zy_ulTop"><li><div class="before-after" aria-checked="false">A. 光速</div></li>
          <li><div class="before-after" aria-checked="true">B. 声速</div></li></ul></div>
        <div class="TiMu" id="multi"><div class="fontLabel">【多选题】找出质数</div>
          <ul class="Zy_ulTop"><li><label><input type="checkbox" value="A">A. 2</label></li>
          <li><label><input type="checkbox" value="B" checked>B. 4</label></li>
          <li><label><input type="checkbox" value="C">C. 5</label></li></ul></div>
        <div class="TiMu"><div class="fontLabel">【填空题】光和声的传播介质</div>
          <textarea id="blank1"></textarea><input type="text" id="blank2"></div>
        <button type="button" onclick="btnBlueSubmit()">提交</button></form>`;
      document.querySelectorAll('#single [aria-checked]').forEach(option => {
        option.onclick = () => document.querySelectorAll('#single [aria-checked]').forEach(other => {
          other.setAttribute('aria-checked', String(other === option));
        });
      });
      window.btnBlueSubmit = () => {
        top.submittedAt = top.performance.now();
        top.submitClicks++;
        top.filledAnswers = [document.querySelector('#single [aria-checked="true"]').textContent,
          Array.from(document.querySelectorAll('#multi input:checked'), el => el.value),
          document.querySelector('#blank1').value, document.querySelector('#blank2').value];
        setTimeout(() => { top.document.querySelector('#workpop').hidden = false; }, 100);
      };
    });
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      window.submitClicks = 0;
      window.confirmClicks = 0;
      document.body.insertAdjacentHTML('beforeend', '<div id="workpop" hidden><button onclick="submitCheckTimes()">确认提交</button></div>');
      window.submitCheckTimes = () => { window.confirmClicks++; document.querySelector('#workpop').hidden = true; };
      window.respond = [];
      window.GM_xmlhttpRequest = options => {
        const payload = JSON.parse(options.data);
        window.answerRequests.push(payload);
        window.respond.push(answers => options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ answers, explanation: '测试解析' }) } }]
        }) }));
      };
    });
    await checkbox(page, '定时提交').check();
    const delay = checkbox(page, '填充后等待（秒）');
    await delay.fill('2');
    await delay.press('Tab');
    await checkbox(page, '自动填充并提交答案').check();
    await checkbox(page, '自动解答检测到的题目').check();
    await page.waitForFunction(() => window.respond.length === 1);
    await page.evaluate(() => respond[0](['A']));
    await page.waitForFunction(() => window.respond.length === 2);
    assert.match(await frame.locator('#single [aria-checked="true"]').textContent(), /^A/);
    await page.evaluate(() => respond[1](['A', 'C']));
    await page.waitForFunction(() => window.respond.length === 3);
    await page.waitForTimeout(2300);
    const panel = page.locator('#studymate-host');
    assert.equal(await panel.getByText(/答案已填充，将在/).count(), 0);
    assert.equal(await page.evaluate(() => submitClicks), 0);
    await frame.locator('#blank2').evaluate(field => field.onchange = () => { top.filledAt = top.performance.now(); });
    await page.evaluate(() => respond[2](['真空', '空气']));
    await panel.getByText('答案已填充，将在 00:02 后提交。').waitFor();
    assert.deepEqual(await page.evaluate(() => [submitClicks, confirmClicks]), [0, 0]);
    await panel.getByText('已确认提交，请查看平台结果。').waitFor();
    assert.ok(await page.evaluate(() => submittedAt - filledAt >= 2000));
    await page.waitForTimeout(1000);
    assert.deepEqual(await page.evaluate(() => [submitClicks, confirmClicks, filledAnswers]),
      [1, 1, ['A. 光速', ['A', 'C'], '真空', '空气']]);
    await page.reload();
    assert.equal(await checkbox(page, '定时提交').isChecked(), true);
    assert.equal(await delay.inputValue(), '2');
    assert.deepEqual(errors, []); await context.close();
  });
  await test('超星 before-after 选项支持自然语言答案，并调用页面提交函数', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await frame.evaluate(() => {
      document.body.innerHTML = `<div class="TiMu"><div class="fontLabel">【判断题】测试题</div>
        <ul class="Zy_ulTop"><li><div class="before-after" aria-label="对选择" aria-checked="false">A. 对</div></li>
        <li><div class="before-after" aria-label="错选择" aria-checked="false">B. 错</div></li></ul></div>`;
      document.querySelectorAll('.before-after').forEach(option => option.onclick = () => {
        document.querySelectorAll('.before-after').forEach(other => other.setAttribute('aria-checked', String(other === option)));
      });
      window.btnBlueSubmit = () => { top.submitClicks++; };
      window.submitCheckTimes = () => { top.confirmClicks++; };
    });
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      window.submitClicks = 0;
      window.confirmClicks = 0;
      window.GM_xmlhttpRequest = options => options.onload({ status: 200, responseText: JSON.stringify({
        choices: [{ message: { content: '答案：A。因为题目描述正确。' } }]
      }) });
    });
    await checkbox(page, '自动填充并提交答案').check();
    await checkbox(page, '自动解答检测到的题目').check();
    await page.locator('#studymate-host').getByText('答案：A', { exact: false }).waitFor();
    await page.waitForFunction(() => window.submitClicks === 1 && window.confirmClicks === 1);
    assert.equal(await frame.locator('.before-after').first().getAttribute('aria-checked'), 'true');
    assert.equal(await frame.locator('.before-after').nth(1).getAttribute('aria-checked'), 'false');
    assert.deepEqual(errors, []); await context.close();
  });
  await test('已提交章节测验在答题前直接进入下一节', async () => {
    const quiz = '<div class="quiz-status">章节测验已完成</div>' +
      '<div class="TiMu"><div class="fontLabel">【单选题】已提交的题目</div>' +
      '<ul class="Zy_ulTop"><li><label><input type="radio" value="A">A. 选项</label></li></ul></div>';
    const { context, page, errors } = await setup(
      fixture({ noMedia: true }).replace('<script src="/studymate.user.js">', quiz + '<script src="/studymate.user.js">')
    );
    await configureAnswerModel(page, 'openai');
    await checkbox(page, '自动解答检测到的题目').check();
    await page.waitForFunction(() => window.clicks === 1);
    assert.equal(await page.evaluate(() => answerRequests.length), 0);
    assert.equal(await page.locator('#curChapterId').inputValue(), 'lesson1');
    assert.deepEqual(errors, []); await context.close();
  });
  await test('章节测验等待迟到的题目和平台提交结果，只切换一次', async () => {
    const { context, page, errors } = await setup(fixture({ noMedia: true }));
    await context.route('**/api/work', route => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<div id="quiz"><p>加载题目中</p><p hidden>已完成</p></div>'
    }));
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      window.GM_xmlhttpRequest = options => {
        answerRequests.push(JSON.parse(options.data));
        options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ answers: ['光速'], explanation: '' }) } }]
        }) });
      };
      document.body.insertAdjacentHTML('beforeend', '<div class="ans-job-finished"><iframe src="/api/work"></iframe></div>');
    });
    await page.frameLocator('iframe[src="/api/work"]').locator('#quiz').waitFor();
    const frame = page.frames().find(item => item.url().endsWith('/api/work'));
    await checkbox(page, '自动解答检测到的题目').check();
    await page.waitForTimeout(2300);
    assert.deepEqual(await page.evaluate(() => [clicks, answerRequests.length]), [0, 0]);
    await frame.evaluate(() => {
      const quiz = document.querySelector('#quiz');
      quiz.innerHTML = '<form><div class="TiMu"><div class="fontLabel">请填写答案</div><textarea></textarea></div><button>提交</button></form>';
      window.submittedAnswer = '';
      quiz.querySelector('form').onsubmit = event => {
        event.preventDefault();
        submittedAnswer = quiz.querySelector('textarea').value;
        quiz.innerHTML = '<p class="ceyan_name">章节测验</p><p>正在提交</p>';
      };
    });
    await frame.waitForFunction(() => submittedAnswer === '光速');
    await page.waitForTimeout(2300);
    assert.deepEqual(await page.evaluate(() => [clicks, answerRequests.length]), [0, 1]);
    await frame.evaluate(() => {
      document.querySelector('#quiz').innerHTML = '<p class="quiz-status">章节测验已提交</p>';
    });
    await page.waitForFunction(() => clicks === 1);
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => clicks), 1);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('章节测验遇到无效选项或关掉自动提交时保持待提交', async () => {
    const quiz = `<form><div class="TiMu"><div class="fontLabel">【单选题】选择正确选项</div>
      <ul class="Zy_ulTop"><li><label><input type="radio" name="answer" value="A">A. 2</label></li>
        <li><label><input type="radio" name="answer" value="B">B. 4</label></li></ul></div>
      <button type="submit">提交</button></form>`;
    const { context, page, errors } = await setup(fixture({ noMedia: true }).replace('<script src="/studymate.user.js">', quiz + '<script src="/studymate.user.js">'));
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      window.submissions = 0;
      document.querySelector('form').onsubmit = event => { event.preventDefault(); window.submissions++; };
      window.GM_xmlhttpRequest = options => {
        window.respond = answer => options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ answers: [answer], explanation: '' }) } }]
        }) });
      };
    });
    const autoSubmit = checkbox(page, '自动填充并提交答案');
    await autoSubmit.check();
    await button(page, '解答此题').click();
    await page.evaluate(() => window.respond('D'));
    const panel = page.locator('#studymate-host');
    await panel.getByText('模型答案与题目不匹配。').waitFor();
    assert.equal(await page.locator('form input:checked').count(), 0);
    await button(page, '重试').click();
    await autoSubmit.uncheck();
    await page.evaluate(() => window.respond('B'));
    await panel.getByText('答案：B').waitFor();
    assert.equal(await page.locator('form input:checked').count(), 0);
    assert.equal(await page.evaluate(() => submissions), 0);
    await autoSubmit.check();
    await page.waitForFunction(() => window.submissions === 1);
    assert.equal(await page.locator('form input[value="B"]').isChecked(), true);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('空答复间隔五秒重试，补答漏题并复查被清空的答案后提交一次', async () => {
    const { context, page, errors } = await setup(fixture({ noMedia: true }));
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `<form>
        <div class="TiMu"><div class="fontLabel">第一题</div><textarea></textarea></div>
        <div class="TiMu"><div class="fontLabel">第二题</div><textarea></textarea></div>
        <div class="TiMu"><div class="fontLabel">第三题</div><textarea>手动答案</textarea></div>
        <button type="submit">提交</button></form>`);
      const form = document.querySelector('form');
      const [first, second] = form.querySelectorAll('textarea');
      second.onchange = () => { first.value = ''; };
      window.submissions = [];
      form.onsubmit = event => {
        event.preventDefault();
        submissions.push(Array.from(form.querySelectorAll('textarea'), field => field.value));
      };
      window.attempts = {};
      window.GM_xmlhttpRequest = options => {
        const title = JSON.parse(options.data).messages.at(-1).content;
        const times = (attempts[title] ||= []);
        times.push(performance.now());
        let answer = { answers: [title + '答案'], explanation: '' };
        if (title === '第二题' && times.length === 2) answer.answers = [];
        const response = title === '第二题' && times.length === 1 ? '' :
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] });
        options.onload({ status: 200, responseText: response });
      };
    });
    await checkbox(page, '自动填充并提交答案').check();
    await button(page, '解答此题').first().click();
    await page.locator('#studymate-host').getByText('AI 返回空答复，5 秒后重试…').waitFor();
    assert.deepEqual(await page.evaluate(() => submissions), []);
    await page.waitForFunction(() => submissions.length > 0);
    await page.waitForTimeout(1000);
    const { attempts, submissions } = await page.evaluate(() => ({ attempts, submissions }));
    assert.deepEqual(submissions, [['第一题答案', '第二题答案', '手动答案']]);
    assert.equal(attempts['第一题'].length, 1);
    assert.equal(attempts['第三题'], undefined);
    const retry = attempts['第二题'];
    assert.equal(retry.length, 3);
    assert.ok(retry[1] - retry[0] >= 4999 && retry[2] - retry[1] >= 4999);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('超星通用确认弹窗会等待补答，并且只在确认提交时点击一次', async () => {
    const { context, page, errors } = await setup(fixture({ noMedia: true }));
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      function addQuestion(title) {
        const block = document.createElement('div');
        block.className = 'TiMu';
        block.innerHTML = '<div class="fontLabel"></div><textarea></textarea>';
        block.firstChild.textContent = title;
        document.body.appendChild(block);
      }
      addQuestion('原题');
      window.submitClicks = 0;
      window.confirmations = [];
      window.btnBlueSubmit = () => {
        submitClicks++;
        addQuestion('新增题');
        document.body.insertAdjacentHTML('beforeend', `
          <div id="workpop">
            <p id="popcontent">确认提交?</p>
            <div class="popBottom">
              <a href="#" id="popok" role="button" aria-label="确定">提交</a>
              <a href="#" id="popno" role="button">取消</a>
            </div>
          </div>`);
        document.querySelector('#popok').addEventListener('click', event => {
          event.preventDefault();
          confirmations.push(Array.from(document.querySelectorAll('.TiMu textarea'), field => field.value));
        });
      };
      window.GM_xmlhttpRequest = options => {
        const title = JSON.parse(options.data).messages.at(-1).content;
        const reply = () => options.onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ answers: [title], explanation: '' }) } }]
        }) });
        if (title === '新增题') window.finishNewAnswer = reply;
        else reply();
      };
    });
    await checkbox(page, '自动填充并提交答案').check();
    await button(page, '解答此题').click();
    await page.waitForFunction(() => !!window.finishNewAnswer);
    await page.waitForTimeout(1100);
    assert.deepEqual(await page.evaluate(() => confirmations), []);
    await page.locator('#popcontent').evaluate(element => { element.textContent = '其他操作提示'; });
    await page.evaluate(() => finishNewAnswer());
    await page.waitForFunction(() => document.querySelectorAll('.TiMu textarea')[1].value === '新增题');
    await page.waitForTimeout(1000);
    assert.deepEqual(await page.evaluate(() => confirmations), []);
    await page.locator('#popcontent').evaluate(element => { element.textContent = '确认提交?'; });
    await page.waitForFunction(() => confirmations.length > 0);
    await page.waitForTimeout(1000);
    assert.deepEqual(await page.evaluate(() => [submitClicks, confirmations]), [1, [['原题', '新增题']]]);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('截图框选只发送裁切后的图片，图片上传适配 Claude', async () => {
    const { context, page, errors } = await setup(fixture({ noMedia: true }));
    await configureAnswerModel(page, 'openai');
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400; canvas.height = 200;
        const graphics = canvas.getContext('2d');
        const stream = canvas.captureStream(20);
        graphics.fillStyle = 'blue'; graphics.fillRect(0, 0, 400, 200);
        window.captureTrack = stream.getVideoTracks()[0];
        return stream;
      };
    });
    const panel = page.locator('#studymate-host');
    await button(page, '截取题目').click();
    const canvas = panel.locator('dialog canvas');
    await canvas.waitFor();
    const rect = await canvas.boundingBox();
    await page.mouse.move(rect.x + 21, rect.y + 24);
    await page.mouse.down();
    await page.mouse.move(rect.x + 140, rect.y + 80);
    await page.mouse.up();
    await button(page, '使用选区').click();
    const image = panel.getByAltText('待发送的题目截图');
    await image.waitFor();
    const dimensions = await image.evaluate(el => [el.naturalWidth, el.naturalHeight]);
    assert.ok(dimensions[0] >= 118 && dimensions[0] <= 121);
    assert.ok(dimensions[1] >= 55 && dimensions[1] <= 58);
    assert.equal(await page.evaluate(() => captureTrack.readyState), 'ended');
    await button(page, '询问 AI').click();
    await panel.getByText('测试模型的解答').waitFor();
    const openai = await page.evaluate(() => answerRequests[0]);
    assert.equal(openai.messages.at(-1).content[1].image_url.url, await image.getAttribute('src'));
    await configureAnswerModel(page, 'claude');
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=';
    await panel.locator('input[type=file]').setInputFiles({ name: 'question.png', mimeType: 'image/png', buffer: Buffer.from(tinyPng, 'base64') });
    await page.waitForFunction(() => document.querySelector('#studymate-host').shadowRoot.querySelector('.answer-image').src.startsWith('data:image/png'));
    await button(page, '询问 AI').click();
    await panel.getByText('测试模型的解答').waitFor();
    const claude = await page.evaluate(() => answerRequests[0]);
    assert.deepEqual(claude.messages[0].content[1], {
      type: 'image', source: { type: 'base64', media_type: 'image/png', data: tinyPng }
    });
    await page.evaluate(() => {
      window.imageAttempts = 0;
      window.GM_xmlhttpRequest = options => {
        imageAttempts++;
        options.onload({ status: 200, responseText: '{"content":[]}' });
      };
    });
    await button(page, '询问 AI').click();
    await page.waitForFunction(() => imageAttempts === 2);
    await button(page, '取消重试').click();
    await page.waitForTimeout(5100);
    assert.equal(await page.evaluate(() => imageAttempts), 2);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('自然结束只切换一节、切换后继续播放、实际状态持久化', async () => {
    const { context, page, errors } = await setup(fixture());
    await checkbox(page, '播完下一节').check(); await finish(page);
    await page.locator('video').evaluate(v => { v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('ended')); });
    await page.waitForFunction(() => document.querySelector('#lesson1').classList.contains('posCatalog_active'));
    await page.waitForFunction(() => !document.querySelector('video').paused);
    await button(page, '停止自动').click();
    assert.equal(await page.evaluate(() => window.clicks), 1);
    assert.equal((await getState(page)).courses[0].log.length, 0, '单个视频结束不代表整章任务完成');
    assert.ok((await getState(page)).courses[0].playback);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('锁定章节不点击、不越过、不误切课程', async () => {
    const { context, page } = await setup(fixture({ locked: true }), { autoPlay: true, autoNext: true, autoCourse: true });
    await finish(page); await page.waitForTimeout(4200);
    assert.equal(await page.evaluate(() => window.clicks), 0);
    assert.equal(new URL(page.url()).searchParams.get('courseId'), '1');
    await button(page, '下一节').click(); assert.match(await note(page).innerText(), /尚未开放/);
    await context.close();
  });
  await test('目录未知时停下，不把视频结束认作末节', async () => {
    const { context, page } = await setup(fixture({ noNav: true }), { autoPlay: true, autoNext: true, autoCourse: true });
    await finish(page); await page.waitForTimeout(4200);
    assert.equal(new URL(page.url()).searchParams.get('courseId'), '1');
    assert.match(await note(page).innerText(), /未识别/); await context.close();
  });
  await test('末节切换下一门，课程队列不循环', async () => {
    const { context, page } = await setup(fixture({ chapters: 1 }), { autoPlay: true, autoNext: true, autoCourse: true });
    await finish(page); await page.waitForURL(nextCourse);
    // The fixture keeps course 1's hidden input; set current course to 2 to emulate the destination.
    await page.locator('#curCourseId').evaluate(el => { el.value = '2'; });
    await button(page, '下一门课程').click();
    assert.equal(page.url(), nextCourse); assert.match(await note(page).innerText(), /末门/);
    await context.close();
  });
  await test('跨域嵌套播放器精准控制，不广播播放其他视频', async () => {
    const { context, page, errors } = await setup(fixture({ frames: true }));
    const nested = page.frames().find(f => new URL(f.url()).hostname === 'nested.chaoxing.com');
    const other = page.frames().find(f => new URL(f.url()).hostname === 'other.chaoxing.com');
    await nested.waitForFunction(() => document.querySelector('video').readyState > 0);
    await page.locator('#studymate-host select').first().selectOption('4');
    await nested.waitForFunction(() => document.querySelector('video').playbackRate === 4);
    await nested.evaluate(() => {
      const v = document.querySelector('video');
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate').set.call(v, 1);
    });
    await nested.waitForTimeout(1200);
    assert.equal(await nested.locator('video').evaluate(v => Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate').get.call(v)), 4);
    await checkbox(page, '自动播放').check();
    await nested.waitForFunction(() => !document.querySelector('video').paused);
    assert.equal(await nested.locator('video').evaluate(v => v.playbackRate), 4);
    assert.equal(await other.locator('video').evaluate(v => v.paused), true);
    await button(page, '暂停').click(); await nested.waitForFunction(() => document.querySelector('video').paused);
    await page.waitForTimeout(1800);
    assert.equal(await nested.locator('video').evaluate(v => v.paused), true);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('播放被浏览器拒绝时提示且不反复重试', async () => {
    const { context, page } = await setup(fixture()); await ready(page);
    await page.locator('video').evaluate(v => { window.playCalls = 0; v.play = () => { window.playCalls++; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }; });
    await checkbox(page, '自动播放').check(); await page.waitForTimeout(3200);
    assert.match(await note(page).innerText(), /浏览器限制/);
    assert.ok(await page.evaluate(() => window.playCalls) <= 2); await context.close();
  });
  await test('停止自动取消待执行切换', async () => {
    const { context, page } = await setup(fixture(), { autoPlay: true, autoNext: true });
    await finish(page); await button(page, '停止自动').click(); await page.waitForTimeout(3800);
    assert.equal(await page.evaluate(() => window.clicks), 0); await context.close();
  });
  await test('智慧树目录可切换', async () => {
    const { context, page } = await setup(fixture({ wisdom: true }));
    await button(page, '下一节').click();
    await page.waitForFunction(() => document.querySelector('#lesson1').classList.contains('current_play'));
    await context.close();
  });
  await test('平台入口点击不生效时提示，不循环点击', async () => {
    const { context, page } = await setup(fixture({ noClick: true }), { autoPlay: true, autoNext: true });
    await finish(page); await page.waitForTimeout(14500);
    assert.equal(await page.evaluate(() => window.clicks), 1);
    assert.match(await note(page).innerText(), /页面未变化/); await context.close();
  });
  await test('无视频时不显示播放成功', async () => {
    const { context, page } = await setup(fixture({ noMedia: true }));
    await button(page, '播放 / 继续').click();
    assert.match(await status(page).innerText(), /等待视频/); assert.match(await note(page).innerText(), /未检测/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('#studymate-host .wrap').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
    await context.close();
  });
  await test('document-start 时 DOM 尚未创建仍正常启动', async () => {
    const { context, page, errors } = await setup(fixture({ noMedia: true }));
    await context.addInitScript(script);
    await page.reload(); await page.waitForSelector('#studymate-host', { state: 'attached' });
    assert.deepEqual(errors, []); await context.close();
  });
  await test('旧版课程重新导入补全入口、不重复新增', async () => {
    const html = fixture({ noMedia: true }).replace('data-studymate-role="study"', 'data-studymate-role="courseList"')
      .replace('<nav>', '<div class="course" courseid="1"><b class="course-name">光学</b><a href="/visit/stucoursemiddle?courseid=1&amp;clazzid=A&amp;cpi=9">打开</a></div><nav>');
    const { context, page } = await setup(html);
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('studymate:v1'));
      delete data.courses[0].href; localStorage.setItem('studymate:v1', JSON.stringify(data));
    });
    await page.reload(); await page.waitForTimeout(1200);
    await page.locator('#studymate-host').getByRole('button', { name: '导入全部（1）', exact: true }).click();
    const data = await getState(page);
    assert.equal(data.courses.length, 2);
    assert.equal(data.courses[0].href, `${origin}/visit/stucoursemiddle?courseid=1&clazzid=A&cpi=9`);
    await context.close();
  });
  await test('本页多个视频依次播放完再切章节', async () => {
    const { context, page } = await setup(fixture().replace(media(), media(2)), { autoPlay: true, autoNext: true });
    await finish(page);
    await page.waitForFunction(() => !document.querySelector('#v1').paused);
    assert.equal(await page.evaluate(() => window.clicks), 0);
    await page.locator('#v1').evaluate(async v => { v.currentTime = v.duration - 0.12; await v.play(); });
    await page.waitForFunction(() => window.clicks === 1);
    await button(page, '停止自动').click(); await context.close();
  });
  await test('仅开启自动播放也会接续本页视频，并重试临时起播失败', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), media(2)), { autoPlay: true });
    await page.locator('#v1').evaluate(video => {
      const play = video.play.bind(video);
      window.playCalls = 0;
      video.play = () => {
        if (++window.playCalls < 3) return Promise.reject(new DOMException('loading', 'AbortError'));
        return play();
      };
    });
    await finish(page);
    await page.waitForFunction(() => !document.querySelector('#v1').paused);
    assert.deepEqual(await page.evaluate(() => [window.playCalls, window.clicks]), [3, 0]);
    await button(page, '停止自动').click();
    assert.deepEqual(errors, []); await context.close();
  });
  await test('保存的自动播放设置刷新后生效、课程主页进入首节', async () => {
    const html = fixture({ home: true, noMedia: true }).replace('posCatalog_active', '');
    const { context, page } = await setup(html, { autoPlay: true });
    await page.waitForFunction(() => window.clicks === 1);
    await context.close();
  });
  await test('同域两层框架未注入脚本也能播放暂停', async () => {
    const { context, page, errors } = await setup(fixture().replace(media(), '<iframe src="/same-frame"></iframe>'));
    const frame = page.frames().find(f => f.url().endsWith('/same-player'));
    await frame.waitForFunction(() => document.querySelector('video').readyState > 0);
    await checkbox(page, '自动播放').check();
    await frame.waitForFunction(() => !document.querySelector('video').paused);
    await button(page, '暂停').click(); await frame.waitForFunction(() => document.querySelector('video').paused);
    await page.waitForTimeout(1800);
    assert.equal(await frame.locator('video').evaluate(v => v.paused), true);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('未预加载的播放器从 readyState 0 自动开始加载播放', async () => {
    const { context, page, errors } = await setup(fixture().replace('preload="auto"', 'preload="none"'), { autoPlay: true });
    await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 0);
    assert.deepEqual(errors, []); await context.close();
  });
  console.log(`\n${passed} browser checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
