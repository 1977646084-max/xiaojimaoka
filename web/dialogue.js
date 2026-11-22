const lines = {
  cat: [
    '喵～你来陪我啦！', '窗边的位置留给我喔。', '打个滚，你就知道我有多开心。',
    '今天的阳光很适合打盹。', '尾巴摇一摇，店长过得好不好？', '呼噜呼噜……再坐一会儿嘛。',
  ],
  assistant: [
    '店长，今天也一起照看猫咖吧！', '杯子已经擦得亮晶晶啦。', '有新订单的话，从「任务」交给我吧。',
    '窗边那只猫又睡着了。', '要不要听一会儿雨声？', '咖啡机和猫咪的呼噜声很配呢。',
  ],
};

const previous = new Map();

export function randomLine(role) {
  const options = lines[role].filter((line) => line !== previous.get(role));
  const line = options[Math.floor(Math.random() * options.length)];
  previous.set(role, line);
  return line;
}
