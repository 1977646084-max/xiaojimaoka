# 小机猫咖 · Operit ToolPkg

从 Operit 的「导入包」选择 `xiaoji-cat-cafe-operit.toolpkg`，启用小机猫咖，然后在工具箱打开猫咖。进入后可以创建店铺、领养猫咪、买猫粮、喂猫，并在订单页把客人的订单交给小机。

界面使用 Compose DSL。像素小机和猫咪用 Canvas 绘制。字体字号以固定 sp 声明。

## 工具入口

`main.js` 导出猫咖工具函数和参数描述。UI 使用包内的 `ToolPkg.ipc` 调用同一个主包执行器。所有操作在主包中串行读写存档，无需 HTTP、MCP 服务或独立进程。

| 函数 | 用途 |
| --- | --- |
| `get_shop_status()` | 读取金币、营业状态、游戏时间、小机工作进度 |
| `get_cats()` | 读取猫咪与饱食度、清洁度、好感度 |
| `shop_catalog()` / `shop_buy({ item_id })` | 查询、购买猫粮或玩具 |
| `care_for_cat({ action, cat_id, item_id })` | 喂食、玩耍、清洁、摸摸、休息 |
| `get_orders()` / `accept_order({ order_id })` | 查询订单、开始倒计时 |
| `process_order({ order_id })` | 查询制作进度并结算到期订单 |
| `interact_with_robot({ action, item, message, order_id })` | 聊天、戳戳、投喂、加或移除贴纸 |
| `get_business_summary()` | 读取最近的营业总结 |

`care_for_cat` 的喂食动作用 `feed`，只有一只猫时可省略 `cat_id`。订单到期按游戏规则结算。关闭 UI 后，在下次读取或操作时补算到期订单。

官方 Operit 当前只把子包的工具加入 AI 列表。这个包遵照主包约束发布，因此官方客户端可用工具箱界面，聊天调用还需要一个能把主包导出函数发布为 AI 工具的宿主。可在官方加载器中查看主包的 `tools = emptyList()` 和对子包工具的加载逻辑。 [Operit 源码](https://github.com/AAswordman/Operit/blob/7a39941bad80209973c535046a18195c5da9e647/app/src/main/java/com/ai/assistance/operit/core/tools/packTool/ToolPkgParser.kt#L1409-L1424)

## 存档

`ToolPkg.getConfigDir()` 决定保存目录。存档使用 `cafe-save-0.json` 和 `cafe-save-1.json` 轮替写入。首次读取可识别同目录中旧格式的 `save.json` 并保留原文件。Mac 网页版的 SQLite 存档需要单独导出为兼容 JSON 才能导入。
