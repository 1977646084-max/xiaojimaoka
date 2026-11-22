import { randomLine } from './dialogue.js';
import { animateArrival } from './visitors.js';

const get = (selector) => document.querySelector(selector);
const stage = get('.stage');
const menu = get('#menu');
const menuBody = get('#menu-body');
const menuMessage = get('#menu-message');
const toast = get('#toast');
const resident = get('.resident');
let current;
let catalog;
let activeCatId;
let pending = false;
let toastTimer;
const speechTimers = new Map();
let guestTimer;
let shownGuest;
let seenSummary = loadSeenSummary();
let countUntil = 0;
let robotQueue = Promise.resolve();
const stickerNames = { paw: '猫爪', bow: '蝴蝶结' };

const care = {
  clean: ['cat_clean', '洗干净啦！'],
  feed: ['cat_feed', '吃得好饱！'],
  play: ['cat_play', '玩得很开心！'],
  pet: ['cat_pet', '呼噜呼噜～'],
};

function activeCat() {
  const cats = current?.state?.cats ?? [];
  return cats.find((cat) => cat.id === activeCatId) ?? cats[0];
}

function announce(message) {
  clearTimeout(toastTimer);
  toast.textContent = menu.open ? '' : message;
  if (menu.open) menuMessage.textContent = message;
  if (message) toastTimer = setTimeout(() => { toast.textContent = ''; }, 4800);
}

function celebrate() {
  resident.classList.remove('celebrate');
  requestAnimationFrame(() => resident.classList.add('celebrate'));
}
resident.addEventListener('animationend', () => resident.classList.remove('celebrate'));

function updateButtons() {
  const cat = activeCat();
  for (const button of document.querySelectorAll('.rail button, .actor, .adopt-cta, .business-clock')) {
    button.disabled = pending || !current || (button.dataset.action in care && !cat);
  }
}

function actorSprite(actor, id, fallback) {
  const image = get(`${actor} img`);
  const source = id ? `/assets/custom/${id}` : fallback;
  if (image.getAttribute('src') !== source) image.src = source;
}

function render() {
  const state = current?.state;
  const cat = activeCat();
  get('#coins').textContent = state?.coins ?? '—';
  const bond = get('#bond');
  const label = cat ? `${cat.bond} / 100` : '— / 100';
  if (bond.textContent !== label) bond.textContent = label;
  get('#meter').hidden = !cat;
  get('#meter').value = cat?.bond ?? 0;
  actorSprite('.resident', cat?.sprite, '/assets/cat.png');
  actorSprite('.assistant', state?.assistant.sprite, '/assets/assistant.png');
  get('.adopt-cta').hidden = !current || Boolean(cat);
  updateButtons();
}

function apply(snapshot, remote = false) {
  if (current && snapshot.revision < current.revision) return;
  if (current && snapshot.revision === current.revision && snapshot.observedAt < current.observedAt) return;
  const previousCat = activeCat();
  const previous = current;
  current = snapshot;
  const cat = activeCat();
  if (!previous || snapshot.revision !== previous.revision) render();
  updateBusiness(previous?.business);
  updateRobot(previous);
  if (remote && previousCat && cat?.id === previousCat.id && (cat.feed_count ?? 0) > (previousCat.feed_count ?? 0)) {
    speak('cat', '喵～吃饱啦！');
    celebrate();
    announce(`已喂食「${cat.name}」。`);
  }
  updateOpenPanel(previous);
  maybeShowSummary();
}

async function api(route, options) {
  const response = await fetch(route, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

async function refresh() {
  if (pending) return;
  const next = await api('/api/state');
  if (!pending) apply(next, true);
}

async function act(name, args = {}) {
  const update = await api('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cat-Cafe': 'web' },
    body: JSON.stringify({ name, args }),
  });
  apply(update);
  return update.result;
}

async function run(work) {
  if (pending) return;
  pending = true;
  render();
  if (menu.open) menuMessage.textContent = '';
  try {
    await work();
  } catch (error) {
    announce(error.message === 'Failed to fetch' ? '暂时连不上猫咖，请检查 Mac 上的网页服务。' : error.message);
  } finally {
    pending = false;
    updateButtons();
    maybeShowSummary();
  }
}

function element(tag, text, attributes = {}) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
  return item;
}

function button(label, handler, primary = false) {
  const item = element('button', label, { type: 'button', class: primary ? 'primary' : '' });
  item.addEventListener('click', handler);
  return item;
}

function field(label, input) {
  const wrapper = element('label', label);
  wrapper.append(input);
  return wrapper;
}

function form(submitLabel, onSubmit, fields) {
  const item = element('form', '', { class: 'fields' });
  const submit = element('button', submitLabel, { type: 'submit', class: 'primary' });
  item.append(...fields, submit);
  item.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    submit.disabled = true;
    try {
      await run(onSubmit);
    } finally {
      submit.disabled = false;
    }
  });
  return item;
}

function show(title, ...body) {
  delete menu.dataset.panel;
  get('#menu-title').textContent = title;
  menuMessage.textContent = '';
  menuBody.replaceChildren(...body);
  if (!menu.open) menu.showModal();
  menu.scrollTop = 0;
}

function showCats() {
  const state = current.state;
  const cat = activeCat();
  if (!cat) {
    openAdoption();
    return;
  }
  const list = element('ul', '', { class: 'cat-list' });
  for (const friend of state.cats) {
    const item = element('li');
    item.append(button(`${friend.name} · ${friend.coat}`, () => showCatDetails(friend.id)));
    list.append(item);
  }
  const buttons = element('div', '', { class: 'menu-buttons' });
  if (state.cats.length < 5) buttons.append(button('领养新猫咪', openAdoption, true));
  show('猫咪', list, buttons);
}

function showCatDetails(id) {
  activeCatId = id;
  const cat = activeCat();
  const stats = element('dl', '', { class: 'cat-stats' });
  for (const [label, value] of [['饱食度', cat.hunger], ['好感度', cat.bond], ['心情', cat.mood], ['清洁度', cat.cleanliness ?? 70]]) {
    const stat = element('div');
    stat.append(element('dt', label), element('dd', `${value} / 100`));
    stats.append(stat);
  }
  show(cat.name, element('p', `${cat.coat} · ${cat.eyes}眼睛 · ${cat.personality}`), stats, button('返回猫咪列表', showCats));
  menu.dataset.panel = 'cat-detail';
  render();
}

function showCandidates(candidates) {
  const select = element('select', '', { required: '' });
  for (const cat of candidates) {
    select.append(element('option', `${cat.coat} · ${cat.eyes}眼睛 · ${cat.personality}`, { value: cat.id }));
  }
  const name = element('input', '', { type: 'text', required: '', maxlength: '24', placeholder: '例如：布丁' });
  show('领养猫咪', form('确认领养', async () => {
    if (!current.state.candidates.some((cat) => cat.id === select.value)) {
      await loadCandidates();
      menuMessage.textContent = '候选名单已更新，请再选一次。';
      return;
    }
    const result = await act('cat_adopt', { cat_id: select.value, name: name.value });
    activeCatId = result.cat.id;
    menu.close();
    render();
    celebrate();
    announce(`${result.cat.name} 来到猫咖啦！`);
  }, [field('选择猫咪', select), field('给猫咪取名', name)]));
}

async function loadCandidates() {
  const candidates = current.state.candidates.length ? current.state.candidates : await act('cat_candidates');
  showCandidates(candidates);
}

function openAdoption() {
  if (!current.state) {
    const shopName = element('input', '', { type: 'text', required: '', maxlength: '32', value: '小机猫咖' });
    show('开店领养', form('查看待领养猫咪', async () => {
      if (!current.state) await act('cafe_create', { shop_name: shopName.value, assistant_name: '小机' });
      await loadCandidates();
    }, [field('猫咖名字', shopName)]));
    return;
  }
  run(loadCandidates);
}

function showSettings() {
  const state = current.state;
  if (!state) {
    openAdoption();
    return;
  }
  const name = element('input', '', { required: '', maxlength: '32', value: state.assistant.name });
  const role = element('input', '', { required: '', maxlength: '32', value: state.assistant.role });
  const actors = [spriteChoice('小机素材', 'assistant')];
  if (state.cats.length) {
    const select = element('select');
    for (const cat of state.cats) select.append(element('option', cat.name, { value: cat.id }));
    select.value = activeCat().id;
    actors.push(spriteChoice('猫咪素材', 'cat', select));
  }
  const achievement = state.robot?.achievement;
  const record = achievement ? [element('p', `已解锁成就「${achievement.name}」· 第 ${achievement.day} 天`)] : [];
  show('猫咖设置', element('p', state.shop_name), ...record, form('保存设置', async () => {
    await act('cafe_rename_assistant', { name: name.value, role: role.value });
    menu.close();
    announce('设置已保存。');
  }, [field('小机名字', name), field('小机职位', role)]),
  element('h2', '角色素材', { class: 'report-section' }),
  element('p', '支持 PNG、JPEG、GIF、WebP，单张最大 2 MB。'), ...actors);
}

function spriteChoice(label, target, select) {
  const group = element('section', '', { class: 'sprite-settings' });
  const file = element('input', '', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', required: '' });
  const update = async (image) => {
    if (image?.size > 2 * 1024 * 1024) throw new Error('图片最大为 2 MB。');
    const query = new URLSearchParams({ target });
    if (select) query.set('cat_id', select.value);
    const result = await api(`/api/sprites?${query}`, {
      method: image ? 'PUT' : 'DELETE', headers: { 'X-Cat-Cafe': 'web' }, body: image ?? undefined,
    });
    apply(result);
    file.value = '';
    announce(image ? '角色素材已保存。' : '已恢复默认素材。');
  };
  if (select) group.append(field('选择猫咪', select));
  group.append(form('应用素材', () => update(file.files[0]), [field(label, file)]),
    button('恢复默认', () => run(() => update(null))));
  return group;
}

function speak(role, line) {
  const bubble = get(`#${role}-speech`);
  get(`#${role}-line`).textContent = line;
  bubble.hidden = false;
  clearTimeout(speechTimers.get(role));
  speechTimers.set(role, setTimeout(() => { bubble.hidden = true; }, 5800));
}

function productLine(product, label = `${product.name} × ${product.units}`) {
  const row = element('span', '', { class: 'product-line' });
  row.append(element('i', '', { class: 'pixel-product', 'data-product': product.id, 'aria-hidden': 'true' }), element('span', label));
  return row;
}

function showGuest(guest) {
  clearTimeout(guestTimer);
  const bubble = get('#guest-speech');
  const needs = [];
  if (guest.petMinutes) needs.push(element('div', `想撸猫 ${guest.petMinutes} 分钟 · ${guest.petMinutes / 30 * 10} 金币`));
  if (guest.lines.length) {
    const order = element('div');
    order.append(...guest.lines.map((product) => productLine(product)));
    needs.push(order);
  }
  if (!needs.length) needs.push(element('div', '想进店坐一会儿。'));
  bubble.replaceChildren(element('b', guest.name), ...needs);
  bubble.hidden = false;
  shownGuest = guest.id;
  for (const visitor of get('#guests').children) visitor.setAttribute('aria-pressed', String(visitor.dataset.guest === shownGuest));
  guestTimer = setTimeout(hideGuest, 8500);
}

function hideGuest() {
  clearTimeout(guestTimer);
  get('#guest-speech').hidden = true;
  for (const visitor of get('#guests').children) visitor.setAttribute('aria-pressed', 'false');
  shownGuest = undefined;
}

function updateBusiness(previous) {
  const { business } = current;
  stage.dataset.night = String(business.phase === 'closed');
  const clock = get('#business-clock');
  const hasCat = business.phase !== 'before';
  const open = business.phase === 'open';
  clock.hidden = !hasCat;
  const label = `${business.time} · ${open ? '营业中' : '已打烊'}`;
  if (clock.textContent !== label) clock.textContent = label;
  get('.business-toggle').hidden = !hasCat;
  get('#business-toggle-label').textContent = open ? '打烊' : '开业';
  countUntil = business.work ? performance.now() + business.work.remainingMs : 0;
  renderJob();
  get('#assistant-resign').hidden = !business.resigning;
  get('#robot-tools').hidden = !business.work;
  get('#robot-idle').hidden = Boolean(business.work);
  if (business.work?.orderId !== previous?.work?.orderId) {
    get('#robot-choices').hidden = true;
    get('#robot-message').hidden = true;
  }
  const level = get('#level-status');
  level.hidden = !hasCat;
  const { progress } = business;
  level.textContent = progress.needed ? `Lv.${progress.level} · ${progress.xp}/${progress.needed} 经验` : 'Lv.200 · 满级';

  const old = previous?.guests ?? [];
  if (signature(old) === signature(business.guests)) return;
  const visitors = get('#guests');
  visitors.replaceChildren(...business.guests.map((guest) => {
    const dot = button('', () => showGuest(guest));
    dot.className = 'guest';
    dot.dataset.guest = guest.id;
    dot.setAttribute('aria-label', `查看${guest.name}的需求`);
    dot.setAttribute('aria-pressed', String(shownGuest === guest.id));
    const number = Number(guest.id.split('-').at(-1));
    dot.append(element('i', '', { class: `guest-sprite palette-${(number - 1) % 7}`, 'aria-hidden': 'true' }));
    return dot;
  }));
  const head = business.guests[0];
  if (!head) {
    hideGuest();
    return;
  }
  if (previous?.day !== business.day || previous?.phase !== 'open') {
    const day = business.day;
    animateArrival(stage, visitors, get('#arrival-layer')).then(() => {
      if (current.business.day === day && current.business.guests[0]?.id === head.id) showGuest(head);
    });
  } else if (old[0]?.id !== head.id) {
    showGuest(head);
  }
}

function renderJob() {
  if (!current) return;
  const { business } = current;
  const job = get('#assistant-job');
  job.hidden = business.phase === 'before';
  const seconds = Math.max(0, Math.ceil((countUntil - performance.now()) / 1000));
  const label = business.work ? `接单中…… ${seconds} 秒`
    : business.serving ? '小机 · 接待中' : business.phase === 'open' ? '小机 · 等待接单' : '小机 · 已下班';
  job.classList.toggle('working', Boolean(business.work));
  if (job.textContent !== label) job.textContent = label;
}

function loadSeenSummary() {
  try {
    return localStorage.getItem('cat-cafe-seen-summary-v04');
  } catch {
    return null;
  }
}

function maybeShowSummary() {
  const report = current?.business.lastSummary;
  if (!report || !current.business.day || current.business.phase !== 'closed' || pending || report.key === seenSummary
      || (menu.open && menu.dataset.panel !== 'tasks')) return;
  showSummary(report);
}

function showSummary(report) {
  seenSummary = report.key;
  try {
    localStorage.setItem('cat-cafe-seen-summary-v04', seenSummary);
  } catch {
    // The report is already saved on the server.
  }
  const sales = element('ul', '', { class: 'report-lines' });
  for (const product of report.sales) {
    const row = element('li');
    row.append(productLine(product), element('b', `+${product.income} 金币`));
    sales.append(row);
  }
  if (!report.sales.length) sales.append(element('li', '当天没有完成产品销售。'));
  const pets = element('ul', '', { class: 'report-lines' });
  for (const visitor of report.petRequests) {
    const row = element('li');
    row.append(element('span', `${visitor.name} · ${visitor.minutes} 分钟`), element('b', `+${visitor.income} 金币`));
    pets.append(row);
  }
  if (!report.petRequests.length) pets.append(element('li', '当天没有撸猫需求。'));
  const reviews = element('ul', '', { class: 'report-lines' });
  for (const review of report.reviews) reviews.append(element('li', `${review.name} · ${review.kind}「${review.text}」`));
  show('一日营业总结',
    element('p', `${report.date} · ${report.time} · ${report.reason}`),
    element('p', `接待 ${report.served}/${report.guests} 位 · 总收入 ${report.revenue} 金币${report.xp === undefined ? '' : ` · 经验 +${report.xp} · Lv.${report.level}`}`),
    element('h2', `产品收入 · ${report.productRevenue} 金币`, { class: 'report-section' }), sales,
    element('h2', `撸猫收入 · ${report.petRevenue} 金币 · 共 ${report.petMinutes} 分钟`, { class: 'report-section' }), pets,
    element('h2', '顾客评语', { class: 'report-section' }), reviews.childElementCount ? reviews : element('p', '今日没有评语。'),
    button('关闭总结', () => menu.close(), true));
}

const signature = (items) => items.map(({ id, status }) => id + (status ?? '')).join('|');

function updateOpenPanel(previous) {
  if (!menu.open || !previous) return;
  const panel = menu.dataset.panel;
  const scroll = menu.scrollTop;
  const focus = document.activeElement?.dataset.focus;
  if (panel === 'tasks' && (previous.business.phase !== current.business.phase
      || previous.business.time !== current.business.time || previous.business.serving !== current.business.serving
      || signature(previous.business.orders) !== signature(current.business.orders))) showTasks();
  else if (panel === 'shop' && (previous.state?.coins !== current.state?.coins
      || JSON.stringify(previous.state?.inventory) !== JSON.stringify(current.state?.inventory))) showShop();
  else if (panel === 'cat-detail' && previous.state?.cats !== current.state?.cats
      && previous.revision !== current.revision) showCatDetails(activeCatId);
  else return;
  const target = [...menu.querySelectorAll('[data-focus]')].find((item) => item.dataset.focus === focus);
  target?.focus({ preventScroll: true });
  menu.scrollTop = scroll;
}

function showTasks() {
  const { business } = current;
  const cats = current.state?.cats ?? [];
  const rows = element('ul', '', { class: 'order-list' });
  const notice = business.phase === 'open'
    ? (business.orders.length ? '将当前客人的订单交给小机。' : '小机正在接待这位客人。')
    : '开业后从游戏时间 10:00 开始营业。';
  for (const order of business.orders) {
    const details = element('div');
    details.append(...order.lines.map((product) => productLine(product)));
    const item = element('li', '', { class: 'order' });
    item.append(element('b', `${order.name} · ${order.total} 金币`, { class: 'order-name' }), details);
    if (order.status === 'waiting') {
      const assign = button('交给小机', () => run(async () => {
        const result = await act('business_assign_order', { order_id: order.id });
        menu.close();
        announce(result.message);
      }), true);
      assign.dataset.focus = order.id;
      item.append(assign);
    } else {
      item.append(element('p', '小机正在接待', { class: 'order-state' }));
    }
    rows.append(item);
  }
  const footer = element('div', '', { class: 'menu-buttons' });
  if (business.lastSummary) footer.append(button('查看营业总结', () => showSummary(business.lastSummary)));
  const prices = element('ul', '', { class: 'report-lines' });
  for (const product of catalog.products) {
    const row = element('li');
    row.append(productLine(product, product.name), element('span', `${product.price} 金币`));
    prices.append(row);
  }
  const priceList = element('details', '', { class: 'business-prices' });
  priceList.append(element('summary', '营业菜单'), prices);
  const adopted = cats.length > 0;
  const fed = cats.some((cat) => cat.feed_count > 0 || cat.hunger > 70);
  const checklist = element('details', '', { class: 'business-prices' });
  checklist.append(element('summary', '照顾猫咪'),
    element('p', `${adopted ? '✓' : '○'} 领养一只猫`),
    element('p', `${fed ? '✓' : '○'} 给猫咪喂一次食`));
  if (!adopted) checklist.append(button('现在去领养', openAdoption, true));
  else if (!fed) checklist.append(button('喂一次猫', () => takeCare('feed'), true));
  const status = business.phase === 'open'
    ? `${business.time} · 第 ${business.day} 天 · 已接待 ${business.served}/${business.guestCount} 位`
    : `等级 ${business.progress.level} · 下次开业接待 ${business.progress.nextGuests} 位`;
  show('营业任务', element('p', status), element('p', notice), rows, priceList, checklist, footer);
  menu.dataset.panel = 'tasks';
}

function showShop() {
  const state = current.state;
  const cash = state?.coins ?? 0;
  const shelves = [1, 2, 3].map((row) => {
    const entries = catalog.shop.filter((item) => item.row === row);
    const shelf = element('section', '', { class: 'shop-shelf' });
    const grid = element('div', '', { class: 'shop-grid' });
    for (const item of entries) {
      const card = element('div', '', { class: 'shop-item' });
      const buy = button('购买', () => run(async () => {
        const result = await act('shop_buy', { item_id: item.id });
        announce(result.message);
      }));
      buy.setAttribute('aria-label', `购买${item.name}，${item.price} 金币`);
      buy.dataset.focus = item.id;
      buy.disabled = !state || cash < item.price;
      card.append(element('img', '', { src: `/assets/shop-${item.id}.png`, alt: '' }),
        element('b', item.name), element('small', `库存 ${state?.inventory?.[item.id] ?? 0}`), buy);
      grid.append(card);
    }
    shelf.append(element('h2', `第 ${row} 排 · 每件 ${entries[0].price} 金币`), grid);
    return shelf;
  });
  show('猫咖商店', element('p', `持有 ${cash} 金币 · 猫粮用于喂食，其他物品用于玩耍。`), ...shelves);
  menu.dataset.panel = 'shop';
}

function doCare(action, cat, itemId) {
  const [tool, reaction] = care[action];
  const args = { cat_id: cat.id };
  if (itemId) args.item_id = itemId;
  return run(async () => {
    const result = await act(tool, args);
    if (menu.open) menu.close();
    speak('cat', reaction);
    celebrate();
    announce(action === 'feed' ? `已喂食「${cat.name}」。` : result.message ?? `${cat.name}：${reaction}`);
  });
}

function takeCare(action) {
  const cat = activeCat();
  if (!cat) return;
  if (action !== 'feed' && action !== 'play') return doCare(action, cat);
  const isFood = action === 'feed';
  const kind = isFood ? 'food' : 'toy';
  const title = isFood ? '喂食' : '玩耍';
  const inventory = current.state.inventory ?? {};
  const stocked = catalog.shop.filter((item) => item.kind === kind && inventory[item.id] > 0);
  if (!stocked.length) {
    show(title, element('p', isFood ? '库存里没有猫粮。' : '库存里没有玩耍道具。'), button('打开商店', showShop, true));
    return;
  }
  const select = element('select', '', { required: '' });
  for (const item of stocked) select.append(element('option', `${item.name} · 剩余 ${inventory[item.id]}`, { value: item.id }));
  const chooser = element('form', '', { class: 'fields' });
  chooser.append(field(`${title}对象 · ${cat.name}`, select),
    element('button', isFood ? '喂一份' : '消耗一个道具', { type: 'submit', class: 'primary' }));
  chooser.addEventListener('submit', (event) => {
    event.preventDefault();
    doCare(action, cat, select.value);
  });
  show(title, chooser);
}

function showAssistantActions() {
  const options = get('#assistant-actions');
  options.hidden = !options.hidden;
  get('.assistant').setAttribute('aria-expanded', String(!options.hidden));
  speak('assistant', current.business.work ? '卖力打工中……' : randomLine('assistant'));
}

function updateRobot(previous) {
  const robot = current.state?.robot;
  const before = previous?.state?.robot;
  const stickers = robot?.stickers ?? [];
  if (stickers.join() !== (before?.stickers ?? []).join()) {
    const art = get('#assistant-stickers');
    art.replaceChildren(...stickers.map((item) => element('span', '', { 'data-sticker': item })));
    const removals = get('#robot-removals');
    removals.hidden = !stickers.length;
    removals.replaceChildren(...stickers.map((item) => button(`取下${stickerNames[item]}`,
      () => robotAction('remove_sticker', item))));
  }
  const effect = robot?.effect;
  if (previous && effect && before?.effect?.sequence !== effect.sequence) {
    speak('assistant', effect.line);
    showRobotMood(effect.mood);
  }
  if (previous && !previous.business.resigning && current.business.resigning) {
    announce(robot?.achievement?.day === current.business.day
      ? `解锁成就「${robot.achievement.name}」` : '小机开始写辞职申请。');
  }
}

function robotAction(action, item, message) {
  const args = { action };
  if (item) args.item = item;
  if (message) args.message = message;
  const orderId = current.business.work?.orderId;
  if (action !== 'remove_sticker' && orderId) args.order_id = orderId;
  robotQueue = robotQueue.then(async () => {
    try {
      await act('interact_with_robot', args);
    } catch (error) {
      announce(error.message);
    }
  });
}

function robotChat() {
  get('#robot-choices').hidden = true;
  const box = get('#robot-message');
  box.hidden = false;
  box.querySelector('input').focus();
  robotAction('chat');
}

function robotChoices(kind) {
  get('#robot-message').hidden = true;
  const group = get('#robot-choices');
  const choices = kind === 'feed' ? [['coffee', '递咖啡'], ['snack', '递零食']]
    : [['paw', '贴猫爪'], ['bow', '贴蝴蝶结']];
  group.replaceChildren(...choices.map(([id, label]) => button(label, () => robotAction(kind, id))));
  group.hidden = false;
}

function showRobotMood(mood) {
  const layer = get('#assistant-fx');
  const image = element('img', '', { src: `/assets/mood-${mood}.png`, alt: '' });
  layer.replaceChildren(image);
  setTimeout(() => image.remove(), 1250);
}

function assistantEffect(kind) {
  const layer = get('#assistant-fx');
  const sprites = (kind === 'heart' ? ['heart'] : ['exclaim', 'question']).map((effect) =>
    element('img', '', { src: `/assets/${effect}-effect.png`, alt: '' }),
  );
  layer.replaceChildren(...sprites);
  setTimeout(() => sprites.forEach((sprite) => sprite.remove()), 1250);
}

function toggleBusiness() {
  run(async () => {
    const result = await act(current.business.phase === 'open' ? 'business_close' : 'business_open');
    announce(result.message);
  });
}

function catChat() {
  const cat = activeCat();
  const warnings = [];
  if (cat?.hunger === 0) warnings.push('饿死了喵');
  if (cat?.cleanliness === 0) warnings.push('好脏好脏喵。');
  speak('cat', warnings.length ? warnings.join(' ') : randomLine('cat'));
}

const actions = {
  cats: showCats,
  'cat-chat': catChat,
  'assistant-chat': showAssistantActions,
  'assistant-hug': () => assistantEffect('heart'),
  'assistant-bother': () => assistantEffect('question'),
  'robot-chat': robotChat,
  'robot-interact': (target) => robotAction(target.dataset.robot),
  'robot-choices': (target) => robotChoices(target.dataset.choices),
  'business-toggle': toggleBusiness,
  adoption: openAdoption,
  settings: showSettings,
  tasks: showTasks,
  shop: showShop,
  save: () => show('本地存档', element('p', current.state ? '每次操作都会自动保存。关闭后再打开猫咖即可继续。' : '开店后自动保存进度。')),
  back: () => {
    if (menu.open) menu.close();
    else if (activeCat()) get('[data-action="cats"]').focus();
    else get('.adopt-cta').focus();
  },
};

stage.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  const action = target?.dataset.action;
  if (!action || pending || !current) return;
  if (action in care) takeCare(action);
  else actions[action]?.(target);
});
get('#robot-message').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  const message = input.value.trim();
  if (!message) return;
  robotAction('chat', null, message);
  input.value = '';
});
get('.close').addEventListener('click', () => menu.close());
menu.addEventListener('close', maybeShowSummary);

async function sync() {
  try {
    if (!catalog) catalog = await api('/api/catalog');
    await refresh();
    if (toast.textContent === '暂时连不上猫咖，请检查 Mac 上的网页服务。') announce('');
  } catch {
    if (!current) announce('暂时连不上猫咖，请检查 Mac 上的网页服务。');
  }
}

render();
sync();
setInterval(renderJob, 200);
setInterval(() => { if (!document.hidden) sync(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
