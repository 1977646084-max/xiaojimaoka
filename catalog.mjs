const shelves = [
  [10, [
    ['paw-food', '爪印猫粮', 'food'], ['face-food', '猫脸猫粮', 'food'],
    ['fish', '小鱼玩偶'], ['yarn', '毛线球'], ['duck', '小黄鸭'],
    ['feather', '羽毛'], ['cat-cushion', '猫脸抱枕'],
  ]],
  [30, [
    ['cat-bed', '猫咪窝'], ['paw-cushion', '爪印抱枕'], ['books', '一摞书'],
    ['open-book', '摊开的书'], ['laptop', '笔记本电脑'],
  ]],
  [40, [
    ['mug', '猫咪马克杯'], ['flowers', '郁金香'], ['plant', '盆栽'],
    ['box', '礼物盒'], ['cat-plush', '猫咪靠垫'],
  ]],
];

export const shop = shelves.flatMap(([price, items], row) =>
  items.map(([id, name, kind = 'toy']) => ({ id, name, kind, price, row: row + 1 })),
);

export const products = [
  { id: 'cappuccino', name: '卡布奇诺', price: 50 },
  { id: 'butter-coffee', name: '小黄油咖啡', price: 55 },
  { id: 'milk', name: '牛奶', price: 10 },
  { id: 'strawberry-milk', name: '草莓牛奶', price: 15 },
  { id: 'cake', name: '小蛋糕', price: 30 },
];
