# 小机猫咖 v0.5.1

小机猫咖包含横屏像素网页和本地 stdio MCP。网页和 Codex 都在 Mac 上访问同一套游戏逻辑与本地存档。手机和 iPad 可通过同一 Wi-Fi 打开网页。

## 一、在 Mac 启动网页

需要 Node.js 22.13 或更新的 22.x 版本，或 Node.js 24 及以上。解压后在终端执行（以解压到「下载」为例）：

```sh
cd "$HOME/Downloads/xiaoji-cat-cafe"
node --version
node web-server.mjs
```

打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。终端保持打开。退出网页服务可按 Control+C。项目使用 Node.js 自带的模块，解压后可直接运行。若端口被占用，用 `node web-server.mjs --port 8766`。

## 二、本地 stdio MCP

网页和 MCP 一起读写 `save.sqlite`。两边的 `CAT_CAFE_DATA_DIR` 须指向同一个绝对路径，省略时默认用 `~/.xiaoji-cat-cafe`。如果之前自定义过存档目录，继续使用同一目录。建议启动新版前结束旧版服务，避免旧进程继续操作这份存档。

网页启动时可通过环境变量设定现实制作时间，默认 20 秒：

```sh
CAT_CAFE_ORDER_SECONDS=20 node web-server.mjs
```

兼容 stdio 的 MCP 客户端应启动 `node server.mjs` 子进程。下面是 Codex 的 `~/.codex/config.toml` 示例。按 `command -v node` 和项目实际路径修改，保留整体结构。保存后重启客户端。见 [Codex MCP 配置文档](https://developers.openai.com/codex/mcp)。

```toml
[mcp_servers.xiaoji_cat_cafe]
command = "/opt/homebrew/bin/node"
args = ["/Users/你的用户名/Downloads/xiaoji-cat-cafe/server.mjs"]

[mcp_servers.xiaoji_cat_cafe.env]
CAT_CAFE_DATA_DIR = "/Users/你的用户名/.xiaoji-cat-cafe"
CAT_CAFE_ORDER_SECONDS = "20"
CAT_CAFE_MCP_MODE = "play"
```

`CAT_CAFE_ORDER_SECONDS` 接受 1–3600 的整数。两边设置相同才会为新接订单使用相同的时长。已接单保留已写入的截止时间。`CAT_CAFE_MCP_MODE=read-only` 只公开查询工具。后台仍会按原截止时间结算已经开始制作的订单。

### 测试 MCP

- 运行 `npm test`。这会启动网页与两个 stdio 测试进程，使用独立的临时存档验证查询、权限、接单、结算与猫咪状态同步。
- 手动测试时，先在网页领养、开业。用 MCP 客户端调用 `get_shop_status`、`get_orders` 和 `get_cats`。从 `get_orders` 取状态为 `waiting` 的 `order_id`，调用 `accept_order`。网页会显示小机的倒计时。
- 对同一 ID 调用 `process_order`。到期前返回剩余时间，到期后返回已结算状态。然后在网页手动打烊，用 `get_business_summary` 核对总结。
- `care_for_cat` 的 `action` 为 `feed`、`play`、`clean`、`pet` 或 `rest`。喂食和玩耍须有可用库存，并可指定 `item_id`。多只猫时传入 `cat_id`。
- `interact_with_robot` 的 `action` 为 `chat`、`poke`、`feed`、`stick` 或 `remove_sticker`。投喂的 `item` 为 `coffee` 或 `snack`，贴纸为 `paw` 或 `bow`。聊天可带 `message`，也可给互动指定当前 `order_id`。

## 三、照顾猫咪

1. 网页点「领养一只猫」，确认店名，选一只候选猫、取名并确认。
2. 点「猫咪」并选择名字，就能查看这只猫的饱食度、好感度、心情和清洁度。左上角的爱心显示当前猫咪的好感度，场景里的猫咪和小机可以点击聊天。
3. 在「商店」购买猫粮和道具。三排商品单价依次是 **10、30、40 金币**。两款猫粮都用于喂食，其它道具可在「玩耍」里使用。每消耗一个道具增加 5 点好感度，上限 100。
4. 买过猫粮之后，可以在网页「喂食」，也可以在 Codex 发「帮我喂猫」。两种方式都扣一份库存、增加 25 点饱食度。店里只有一只猫时，`cat_feed` 可省略猫咪 ID。有多只猫时，可以说「帮我喂布丁」。

饱食度和清洁度每过一个现实小时各减 0.5 点，最低为零。暂停营业或关闭网页期间也按现实时间计算。

## 四、营业和打烊

- 首次领养猫咪后自动开业。之后用场景左侧的「开业」开始新一天，游戏时间回到 10:00。场景左侧的「打烊」可以提前结束营业。
- 客人依次接待。在「任务」里将当前客人的产品订单交给小机。没有产品订单的客人由小机自动接待。每次接待完成后，游戏时钟增加 5 分钟入店点单、撸猫时长、每件产品 20 分钟和 5 分钟离店。
- 撸猫按 30 分钟计费，每 30 分钟 10 金币。当天的客人会安排在 10:00–22:00 之内。高等级排队人数较多时，部分客人只到店短坐，以便在营业时间内接待完毕。
- 卡布奇诺 50、小黄油咖啡 55、牛奶 10、草莓牛奶 15、小蛋糕 30，单位都是金币。
- 到 22:00 或接待完所有客人会自动打烊。手动打烊只结算已接待完成的客人，制作中的未到期订单和排队订单会取消。夜景和总结会自动显示，包含产品与撸猫收入、经验和顾客评语。
- 猫咖从 Lv.1 开始，最高 Lv.200。每接待一位客人获得 0.5 经验，升一级需要当前等级乘以 10 的经验。Lv.1 每天接待 3 位客人，此后每升满 5 级，下一次开业多接待一位。
- 制作期间点击小机可聊天摸鱼、戳戳、递咖啡或零食、贴猫爪和蝴蝶结。可随时手动取下贴纸。互动不会暂停倒计时，也不会消耗金币或库存。
- 同一营业日接单期间第 100 次互动会触发当天的「辞职申请中……」。首次达成会留下永久成就，气泡在打烊时消失。
- 设置里的「角色素材」可替换小机和单只猫咪的立绘，也可以恢复默认。素材保存在同一份 SQLite 存档，支持 PNG、JPEG、GIF、WebP，单张最大 2 MB。

## 手机或 iPad 横屏

让设备和 Mac 连上同一个可信 Wi-Fi。在 Mac 的「系统设置 → Wi-Fi → 详细信息 → TCP/IP」查看 IP 地址。假设是 `192.168.1.23`，在 Mac 停掉默认网页进程，然后执行：

```sh
node web-server.mjs --host 192.168.1.23
```

在手机或 iPad 的 Safari 打开 `http://192.168.1.23:8765`，再转成横屏。若防火墙询问，允许该网页进程接收本地连接。此模式下同网段且能访问该地址的设备共用这份猫咖进度。

## 存档

两个进程默认共用 `~/.xiaoji-cat-cafe/save.sqlite`。`save.json` 是 v0.1 的存档，首次初始化 SQLite 时会从同目录导入，原 JSON 文件留作备份。旧版 SQLite 存档可直接继续使用。v0.4 的营业日、进行中的订单及其截止时间、金币、经验、猫咪和自定义立绘保持原样。

可用 `CAT_CAFE_DATA_DIR` 指向另一份存档，例如：

```sh
CAT_CAFE_DATA_DIR="$HOME/Documents/cat-cafe-test-save" node web-server.mjs
```

在 `config.toml` 中同步填写同一目录的绝对路径：

```toml
[mcp_servers.xiaoji_cat_cafe.env]
CAT_CAFE_DATA_DIR = "/Users/你的用户名/Documents/cat-cafe-test-save"
```

修改后重启网页服务和 Codex，再开始测试。


## 后续开发

聊天回复目前由 `robot.mjs` 的本地预设入口提供。远程 MCP 可复用 `game.mjs` 的工具定义和执行入口，未来需要加远程传输、鉴权和按玩家隔离的存档。云端部署、ChatGPT 直接安装、真实 AI 对话及无人值守托管均留待后续。
