'use strict';

const { products } = require('./catalog.js');

const opening = 10 * 60;
const closing = 22 * 60;
const visitOverhead = 10;
const visitDelay = 4000;
const orderSeconds = 30;
const randomInt = (from, to) => from + Math.floor(Math.random() * (to - from + 1));
const pick = (items) => items[randomInt(0, items.length - 1)];
const pad = (value) => String(value).padStart(2, '0');
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const petReviews = ['咪咪好乖，下次还来！', '哈吉米，哈吉米拿没撸多。', '嗦成芒果核之后还给了你。'];
const productReviews = ['呀米呀米。', '豪喝！', '这里是天堂吗，竟然有如此美味的东西。', '管家，十分钟内我要这个甜品师的所有信息。'];

function guestCount(level) {
  return 3 + Math.floor((level - 1) / 5);
}

function newGuests(day, level) {
  const count = guestCount(level);
  let budget = closing - opening - count * visitOverhead;
  const stagger = count * 20 <= budget ? 20 : 0;
  return Array.from({ length: count }, (_, index) => {
    const remaining = count - index - 1;
    const share = Math.floor(budget / (remaining + 1));
    const available = Math.min(budget - remaining * stagger, Math.max(index === 0 ? 50 : stagger, share * 2));
    let petMinutes = 0;
    if (available >= 30 && (index === 0 || Math.random() < .67)) {
      const reservedProduct = index === 0 && available >= 50 ? 20 : 0;
      petMinutes = 30 * randomInt(1, Math.min(6, Math.floor((available - reservedProduct) / 30)));
    }
    const maxUnits = Math.min(3, Math.floor((available - petMinutes) / 20));
    const units = maxUnits && (index === 0 || !petMinutes || Math.random() < .8) ? randomInt(1, maxUnits) : 0;
    const lines = [];
    for (let unit = 0; unit < units; unit += 1) {
      const product = pick(products);
      const line = lines.find(({ id }) => id === product.id);
      if (line) line.units += 1;
      else lines.push({ id: product.id, units: 1 });
    }
    budget -= petMinutes + units * 20;
    return {
      id: `${day}-${index + 1}`,
      name: '客人 ' + pad(index + 1),
      petMinutes,
      lines,
      minutes: visitOverhead + petMinutes + units * 20,
      reviews: [...(petMinutes ? [{ kind: '撸猫', text: pick(petReviews) }] : []),
        ...(units ? [{ kind: '产品', text: pick(productReviews) }] : [])],
      status: 'waiting',
    };
  });
}

function orderLines(guest) {
  return guest.lines.map(({ id, units }) => ({
    ...products.find((product) => product.id === id), units,
  }));
}

function productTotal(guest) {
  return orderLines(guest).reduce((sum, item) => sum + item.price * item.units, 0);
}

function summarize(day, progress) {
  const served = day.guests.filter((guest) => guest.status === 'served');
  const petRequests = served.filter((guest) => guest.petMinutes > 0).map(({ name, petMinutes }) => ({
    name, minutes: petMinutes, income: petMinutes / 30 * 10,
  }));
  const sales = products.map((product) => {
    const units = served.flatMap((guest) => guest.lines)
      .filter((line) => line.id === product.id).reduce((sum, line) => sum + line.units, 0);
    return { ...product, units, income: units * product.price };
  }).filter((product) => product.units);
  const productRevenue = sales.reduce((sum, item) => sum + item.income, 0);
  const petRevenue = petRequests.reduce((sum, item) => sum + item.income, 0);
  return {
    key: `day-${day.number}`, date: `第 ${day.number} 天`,
    time: clock(day.minute), reason: day.reason,
    guests: day.guests.length, served: served.length, missed: day.guests.length - served.length,
    petRequests, petMinutes: petRequests.reduce((sum, item) => sum + item.minutes, 0),
    sales, productRevenue, petRevenue, revenue: productRevenue + petRevenue,
    xp: day.xpEarned, level: progress.level,
    reviews: served.flatMap((guest) => guest.reviews.map((review) => ({ name: guest.name, ...review }))),
  };
}

function migrateBusiness(state) {
  if (state.business?.clock === 'game') return;
  const legacy = state.business?.lastSummary;
  state.business = {
    clock: 'game', day: null, progress: { level: 1, xp: 0 },
    lastSummary: legacy ? {
      ...legacy, key: `legacy-${legacy.date}`, time: '22:00', reason: '旧版营业记录',
      petRequests: legacy.petRequests.map(({ name, hours }) => ({ name, minutes: hours * 60, income: 0 })),
      petMinutes: legacy.petHours * 60, productRevenue: legacy.revenue, petRevenue: 0, reviews: [],
    } : null,
  };
}

function closeDay(state, reason) {
  const day = state.business.day;
  day.reason = reason;
  day.closed = true;
  state.business.lastSummary = summarize(day, state.business.progress);
}

function startGuest(guest, at) {
  guest.status = 'serving';
  guest.readyAt = at + (guest.lines.length ? orderSeconds * 1000 : visitDelay);
}

function startAutomaticGuest(day, at) {
  const guest = day.guests[day.cursor];
  if (guest?.status === 'waiting' && !guest.lines.length) startGuest(guest, at);
}

function addExperience(progress) {
  if (progress.level >= 200) return 0;
  progress.xp += .5;
  if (progress.xp >= progress.level * 10) {
    progress.xp -= progress.level * 10;
    progress.level += 1;
  }
  return .5;
}

function needsAdvance(state, now) {
  if (state.business?.clock !== 'game') return true;
  const day = state.business.day;
  if (!day || day.closed) return false;
  const guest = day.guests[day.cursor];
  return guest?.status === 'serving' && guest.readyAt <= now;
}

function advanceBusiness(state, now) {
  if (!needsAdvance(state, now)) return false;
  migrateBusiness(state);
  const { day, progress } = state.business;
  if (!day || day.closed) return true;
  let guest = day.guests[day.cursor];
  while (guest?.status === 'serving' && guest.readyAt <= now) {
    guest.status = 'served';
    day.minute += guest.minutes;
    state.coins += productTotal(guest) + guest.petMinutes / 30 * 10;
    day.xpEarned += addExperience(progress);
    day.cursor += 1;
    if (day.minute >= closing || day.cursor === day.guests.length) {
      closeDay(state, day.minute >= closing ? '营业时间到' : '已接待今日所有客人');
      break;
    }
    startAutomaticGuest(day, guest.readyAt);
    guest = day.guests[day.cursor];
  }
  return true;
}

function openBusiness(state, now) {
  if (!state.cats.length) return { error: '先领养一只猫，领养后会自动开业。' };
  const { day, progress } = state.business;
  if (day && !day.closed) return { error: '猫咖已经在营业了。' };
  const number = (day?.number ?? 0) + 1;
  state.business.day = {
    number, minute: opening, cursor: 0, closed: false, xpEarned: 0,
    guests: newGuests(number, progress.level),
  };
  startAutomaticGuest(state.business.day, now);
  return { message: `第 ${number} 天开业，游戏时间 10:00。` };
}

function closeBusiness(state) {
  const day = state.business.day;
  if (!day || day.closed) return { error: '猫咖现在没有营业。' };
  closeDay(state, '店长提前打烊');
  return { message: '今天打烊啦。', summary: state.business.lastSummary };
}

function businessView(state, now = Date.now()) {
  const data = state?.business?.clock === 'game' ? state.business : null;
  const day = data?.day;
  const active = day && !day.closed;
  const next = active ? day.guests[day.cursor] : null;
  const guests = active ? day.guests.slice(day.cursor).map((guest) => ({
    id: guest.id, name: guest.name, petMinutes: guest.petMinutes, lines: orderLines(guest),
  })) : [];
  const orders = next?.lines.length ? [{
    id: next.id, name: next.name, lines: orderLines(next), total: productTotal(next), status: next.status,
  }] : [];
  const orderLog = (day?.guests ?? []).flatMap((guest, index) => {
    if (!guest.lines.length) return [];
    const status = guest.status === 'served' ? 'served'
      : day.closed ? 'cancelled'
      : index > day.cursor ? 'queued' : guest.status;
    return [{
      id: guest.id, name: guest.name, lines: orderLines(guest), total: productTotal(guest), status,
      ...(status === 'serving' && { remainingMs: Math.max(0, guest.readyAt - now) }),
    }];
  });
  const { level, xp } = data?.progress ?? { level: 1, xp: 0 };
  return {
    day: day?.number ?? 0, phase: active ? 'open' : state?.cats.length ? 'closed' : 'before',
    time: clock(day?.minute ?? opening),
    guests, orders, orderLog, serving: next?.status === 'serving',
    work: next?.lines.length && next.status === 'serving'
      ? { orderId: next.id, readyAt: next.readyAt, remainingMs: Math.max(0, next.readyAt - now) }
      : null,
    resigning: Boolean(active && day.resigning),
    served: day?.cursor ?? 0, guestCount: day?.guests.length ?? guestCount(level),
    progress: { level, xp, needed: level === 200 ? null : level * 10, nextGuests: guestCount(level) },
    lastSummary: data?.lastSummary ?? null,
  };
}

function assignOrder(state, id, now) {
  const day = state.business.day;
  if (!day || day.closed) return { error: '猫咖现在没有营业。' };
  const guest = day.guests[day.cursor];
  if (guest.id !== id || !guest.lines.length) return { error: '请等当前这位客人接待完成。' };
  if (guest.status !== 'waiting') return { error: '这位客人的订单已经交给小机了。' };
  startGuest(guest, now);
  return { id, name: guest.name, message: '订单已经交给小机。' };
}

module.exports = { guestCount, needsAdvance, advanceBusiness, openBusiness, closeBusiness, businessView, assignOrder };
