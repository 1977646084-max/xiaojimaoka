const get = (selector) => document.querySelector(selector);
const menu = get('#menu');
const menuBody = get('#menu-body');
const menuMessage = get('#menu-message');
const toast = get('#toast');
const resident = get('.resident');
let current;
let activeCatId;
let pending = false;
let toastTimer;

const care = {
  clean: ['cat_clean', '洗干净啦！'],
  feed: ['cat_feed', '吃得好饱！'],
  play: ['cat_play', '玩得很开心！'],
  pet: ['cat_pet', '呼噜呼噜～'],
  rest: ['cat_rest', '睡了个好觉。'],
};

function activeCat() {
  const cats = current?.state?.cats ?? [];
  return cats.find((cat) => cat.id === activeCatId) ?? cats[0];
}

function announce(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
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
  for (const button of document.querySelectorAll('.rail button, .resident, .adopt-cta')) {
    button.disabled = pending || !current || (button.dataset.action in care && !cat);
  }
}

function render() {
  const state = current?.state;
  const cat = activeCat();
  get('#coins').textContent = state?.coins ?? '—';
  const fullness = get('#fullness');
  const label = cat ? `${cat.hunger} / 100` : '— / 100';
  if (fullness.textContent !== label) fullness.textContent = label;
  get('#meter').hidden = !cat;
  get('#meter').value = cat?.hunger ?? 0;
  const assistant = state?.assistant?.name;
  get('#assistant-line').textContent = cat ? `${assistant}在这儿！` : '选一只猫吧！';
  get('#cat-line').textContent = cat ? `${cat.name} · 喵～` : '喵～';
  get('.adopt-cta').hidden = !current || Boolean(cat);
  updateButtons();
}

function apply(snapshot, remote = false) {
  if (current && snapshot.revision < current.revision) return;
  const previous = activeCat();
  current = snapshot;
  const cat = activeCat();
  render();
  if (remote && previous && cat?.id === previous.id && (cat.feed_count ?? 0) > (previous.feed_count ?? 0)) {
    get('#cat-line').textContent = `${cat.name} · 吃饱了！`;
    celebrate();
    announce(`${cat.name} 已喂食，饱食度 ${cat.hunger} / 100`);
  }
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
  if (!pending && (!current || next.revision !== current.revision)) apply(next, true);
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
  const select = element('select');
  for (const friend of state.cats) select.append(element('option', friend.name, { value: friend.id }));
  select.value = cat.id;
  select.addEventListener('change', () => {
    activeCatId = select.value;
    render();
    showCats();
    menu.querySelector('select')?.focus();
  });
  const buttons = element('div', '', { class: 'menu-buttons' });
  if (state.cats.length < 5) buttons.append(button('领养新猫咪', openAdoption, true));
  const detail = element('p', `饱食度 ${cat.hunger} / 100 · 心情 ${cat.mood} / 100 · 亲密度 ${cat.bond} / 100 · 清洁度 ${cat.cleanliness ?? 70} / 100`);
  show('猫咪', field('正在照顾', select), element('p', `${cat.coat} · ${cat.eyes}眼睛 · ${cat.personality}`), detail, buttons);
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
  show('猫咖设置', element('p', state.shop_name), form('保存设置', async () => {
    await act('cafe_rename_assistant', { name: name.value, role: role.value });
    menu.close();
    announce('设置已保存。');
  }, [field('小机名字', name), field('小机职位', role)]));
}

function showTasks() {
  const cats = current.state?.cats ?? [];
  const adopted = cats.length > 0;
  const fed = cats.some((cat) => cat.feed_count > 0 || cat.hunger > 70);
  const actions = element('div', '', { class: 'menu-buttons' });
  if (!adopted) actions.append(button('现在去领养', openAdoption, true));
  if (adopted && !fed) actions.append(button('喂一次猫', () => {
    menu.close();
    takeCare('feed');
  }, true));
  show('猫咖任务', element('p', `${adopted ? '✓ 已完成' : '○ 待完成'}　领养一只猫`),
    element('p', `${fed ? '✓ 已完成' : '○ 待完成'}　给猫咪喂一次食`), actions);
}

function takeCare(action) {
  const cat = activeCat();
  if (!cat) return;
  const [tool, reaction] = care[action];
  run(async () => {
    const result = await act(tool, { cat_id: cat.id });
    get('#cat-line').textContent = reaction;
    celebrate();
    announce(result.message ?? `${cat.name}：${reaction}`);
  });
}

const actions = {
  cats: showCats,
  adoption: openAdoption,
  settings: showSettings,
  tasks: showTasks,
  save: () => show('本地存档', element('p', current.state ? '每次操作都会自动保存。关闭后再打开猫咖即可继续。' : '开店后自动保存进度。')),
  shop: () => show('猫咖商店', element('p', '一份猫粮需要 5 猫猫币。选择「喂食」即可购买并喂给当前猫咪。'),
    button('去喂食', () => {
      menu.close();
      if (activeCat()) get('[data-action="feed"]').focus();
      else openAdoption();
    }, true)),
  back: () => {
    if (menu.open) menu.close();
    else if (activeCat()) get('[data-action="cats"]').focus();
    else get('.adopt-cta').focus();
  },
};

get('.stage').addEventListener('click', (event) => {
  const action = event.target.closest('button')?.dataset.action;
  if (!action || pending || !current) return;
  if (action in care) takeCare(action);
  else actions[action]?.();
});
get('.close').addEventListener('click', () => menu.close());

async function sync() {
  try {
    await refresh();
  } catch {
    if (!current) announce('暂时连不上猫咖，请检查 Mac 上的网页服务。');
  }
}

render();
sync();
setInterval(() => { if (!document.hidden) sync(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
