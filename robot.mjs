const pick = (lines) => lines[Math.floor(Math.random() * lines.length)];
export const stickerIds = ['paw', 'bow'];
export const achievementName = '到底谁才是这家店的老板？';

const pokeReplies = [
  ['curious', '嗯？店长，找我吗？'],
  ['protest', '抗议！我在接单呢。'],
  ['helpless', '好啦好啦，我知道店长在旁边。'],
  ['angry', '再戳下去，咖啡拉花都要抖歪啦！'],
];

function replyToChat(message = '') {
  if (/咖啡/.test(message)) return '咖啡正做着呢，店长可以先帮我闻闻香味。';
  if (/猫/.test(message)) return '猫咪在垫子边等你呢，等我下班也过去。';
  return pick(['店长，下班后再接着聊吧。', '我一边打奶泡，一边听你说。', '这单做好以后，一起去看猫吧！']);
}

function respond(robot, day, { action, item, message }, now) {
  switch (action) {
    case 'chat':
      return { mood: 'curious', line: replyToChat(message) };
    case 'poke': {
      const prior = robot.pokeDay === day.number && now - robot.lastPokeAt <= 5000 ? robot.pokeStreak : 0;
      robot.pokeDay = day.number;
      robot.lastPokeAt = now;
      robot.pokeStreak = prior + 1;
      const index = robot.pokeStreak >= 7 ? 3 : robot.pokeStreak >= 4 ? 2 : robot.pokeStreak >= 2 ? 1 : 0;
      const [mood, line] = pokeReplies[index];
      return { mood, line };
    }
    case 'feed':
      return { mood: 'happy', line: item === 'coffee' ? '谢谢店长！这杯咖啡来得正好。' : '零食收到！留一半给下班的小机。' };
    case 'stick':
      if (!robot.stickers.includes(item)) robot.stickers.push(item);
      return { mood: 'curious', line: pick(item === 'paw'
        ? ['是谁把猫爪印按到我身上的？', '小机也有猫爪啦。']
        : ['蝴蝶结歪了吗？帮我看看。', '要戴着这个给客人送咖啡吗？']) };
    case 'remove_sticker':
      robot.stickers = robot.stickers.filter((sticker) => sticker !== item);
      return { mood: 'relieved', line: '贴纸取下来啦。' };
  }
}

export function interactWithRobot(state, args, now, working) {
  const { action, item, message } = args;
  if (!['chat', 'poke', 'feed', 'stick', 'remove_sticker'].includes(action)) return { error: '找不到这个小机互动。' };
  if (action === 'feed' && !['coffee', 'snack'].includes(item)) return { error: '请选择咖啡或零食。' };
  if (['stick', 'remove_sticker'].includes(action) && !stickerIds.includes(item)) return { error: '请选择猫爪或蝴蝶结。' };
  if (message?.length > 200) return { error: '聊天内容不能超过 200 字。' };
  if (!working && action !== 'remove_sticker') return { error: '小机正在等订单。开始接单后再来互动。' };
  if (action === 'remove_sticker' && !state.robot?.stickers?.includes(item)) return { error: '这张贴纸没有贴在小机身上。' };

  const robot = state.robot ??= { stickers: [] };
  const day = state.business.day;
  const reaction = respond(robot, day, args, now);
  const effect = {
    ...reaction, action, item, sequence: (robot.effect?.sequence ?? 0) + 1,
    day: day?.number,
  };
  if (working) {
    day.disruptions = (day.disruptions ?? 0) + 1;
    if (day.disruptions === 100) {
      day.resigning = true;
      effect.resignation = true;
      if (!robot.achievement) {
        robot.achievement = { name: achievementName, day: day.number };
        effect.unlocked = true;
      }
    }
  }
  robot.effect = effect;
  return effect;
}
