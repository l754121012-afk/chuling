# 除灵实习生 Phase 0 原型

阶段 0 白盒验证 Demo：用 Three.js + Cannon-es 在浏览器里跑通“搜证 → 除灵 → 跑路 → 结算”完整循环，重点验证“暴怒值张力”和“廉价文具物理喜剧”是否成立。

## 运行

```bash
npm start
```

然后打开 <http://127.0.0.1:4173>。依赖已复制到 `vendor/`，也可以直接运行 `node server.js`。

## 操作

- `WASD` / 方向键：移动
- `Shift`：奔跑（消耗体力）
- 鼠标点击画面：锁定鼠标（`Esc` 释放）
- 鼠标移动：控制镜头方向
- 投掷类道具：右键 / 左键进入瞄准，再按左键或 `F` 射出
- 封印 / 陷阱：左键直接使用
- `F`：使用当前道具
- `E`：互动（捡道具、看线索、躲柜子、推书架、踢垃圾桶、逃出）
- `Q` / `1-6`：切换道具
- `C`：圆珠笔 + 橡皮筋 = 自制弹弓
- `Tab`：打开实习笔记（消耗手机电量）

## 已验证的核心循环

1. 侦察搜证：教室黑板“别踩脚印” + 讲台纸条“它怕订书机”。
2. 准备与执行：静默潜行，趁鬼处于“冷静 / 不悦”，从背后用订书机封印；也可以直接扔文具把灵体值打空（莽夫流）。
3. 逃跑结算：封印成功后鬼进入“狂乱”追捕，出口开启，限时逃出；工资结算会扣除器材费、交通费、损坏赔偿。
4. 暴怒五态：冷静 / 不悦 / 愤怒 / 暴怒 / 狂乱，影响鬼的视野、速度和行为；砸鬼、跑步、破坏设施会涨怒，躲柜子、安静、看线索会降怒。
5. 物理喜剧：道具可投掷、弹跳、粘住；修正带陷阱会黏住鬼；胶水可能粘到自己；剪刀可能插进天花板；书架的赔偿会出现在工资单上。
6. 手持反馈：角色带有可见手臂和手，当前选中的道具会实时显示在手上，切换道具时同步替换。
7. 状态反馈：鬼的五个暴怒阶段分别有灵体变色、光环、警告图标、屏幕红晕和紫火特效；拾取/互动与使用道具时角色有不同动作姿势。
8. 道具标注：可拾取道具带有发光圆环和悬浮图标；投掷类道具拆分“瞄准”和“射出”两步，屏幕准星和角色动作会同步变化。
9. 轨迹预览：投掷类道具瞄准时显示虚线抛物线轨迹和落点标记，方便判断作用距离。
10. 脚印惩罚：踩到鬼留下的脚印会涨暴怒、掉体力，并让鬼听见动静。
11. 备用方案：订书机用错坏掉后，20 秒会刷新备用订书机；也可以直接靠文具打空灵体值通关。
12. 鬼压迫感：鬼基础速度整体提高，愤怒以上会随机瞬时冲刺。
13. 真实倒地：垃圾桶、书架可被踢倒并产生真实物理倒地效果；书架倒下会成为阻挡，垃圾桶可以被掠过。

## 目录结构

```text
src/
  config/            数值配置（对应 Unity ScriptableObject）
    game.js          体力、速度、电量、薪资、噪音半径
    ghost.js         暴怒阶段、鬼属性、台词
    items.js         道具数据、组合表
    level.js         关卡布局、道具点位
    palette.js       占位美术色板
  core/
    EventBus.js      事件总线，系统间解耦
    GameState.js     玩家/关卡运行时状态
    Physics.js       Cannon 物理封装 + 碰撞分组
    PlaceholderAssets.js  占位资产工厂（美术替换入口）
    Utils.js         数学与随机工具
  systems/
    InputSystem.js   键鼠输入
    CameraSystem.js  第三人称相机
    PlayerSystem.js  玩家移动、体力、互动
    GhostSystem.js   鬼 AI、暴怒行为、封印判定
    RageSystem.js    暴怒值状态机
    ItemSystem.js    道具拾取、投掷、陷阱、组合
    ClueSystem.js    线索读取
    UISystem.js      HUD、手机、笔记、结算界面
    AudioSystem.js   WebAudio 合成音效
    SettlementSystem.js  工资结算
  world/
    SchoolScene.js   校园白盒场景与关卡物件
```

## 架构约定

- 系统之间不直接互相依赖，通过 `EventBus` 发送 `toast`、`noise`、`speech`、`rage.changed` 等事件。
- 所有数值集中在 `src/config/`，调暴怒曲线、道具伤害、薪资扣款不需要改逻辑代码。
- 物理引擎通过 `src/core/Physics.js` 统一封装；角色控制器直接写速度，接触摩擦保持很低，避免 Cannon 的摩擦求解把玩家移动吃掉。
- 占位资产统一从 `PlaceholderAssets.js` 生成，每个对象带 `userData.assetKey`，后续换正式美术时替换工厂函数即可。

## 美术替换入口

正式美术接入时只改两个位置：

1. `src/core/PlaceholderAssets.js`：把 `makePlayerMesh()`、`makeGhostMesh()`、`makeItemMesh()`、`makePropMesh()` 换成 GLTF 加载；先预加载并缓存，再按 `assetKey` 返回。
2. `src/config/palette.js`：替换占位色板，或改为读取资源目录配置。

场景物件、道具、鬼和玩家都不应在系统代码里硬编码颜色和形状。

## Unity 移植映射

| 本原型 | Unity 对应 |
| --- | --- |
| `src/config/*.js` | ScriptableObject / 关卡配置表 |
| `EventBus.js` | C# 事件 / 消息总线 |
| `GameState.js` | 全局 GameManager 状态 |
| `Physics.js` | PhysX + Collider / Rigidbody 封装 |
| `PlayerSystem.js` | 角色控制器 + CharacterController 或 Rigidbody |
| `GhostSystem.js` | 鬼的状态机 + NavMesh / 自写 AI |
| `RageSystem.js` | 暴怒值数值 + 状态阶段 |
| `ItemSystem.js` | 道具 ScriptableObject + 投掷物对象池 |
| `UISystem.js` | UGUI / UI Toolkit |
| `PlaceholderAssets.js` | Addressables / AssetBundle 资源注册表 |

## 调试接口

浏览器控制台里可以访问 `window.__game`：

```js
__game.start()          // 开始实习
__game.give('pen', 3)   // 给道具
__game.readClue('note') // 读取线索
__game.setRage(90)      // 直接调暴怒值
__game.win()            // 跳过逃跑，直接结算
__game.lose()           // 触发失败结算
```

## 当前范围与延期项

已做：单关卡白盒、暴怒五态、六种文具、线索推理、静默封印与莽夫流、逃跑计时、工资结算、合成音效、桌面与移动端 UI。

延期：正式低多边形美术、多关卡、随机事件、精彩回放、物理沙盒、职场生存模式、观众投票、手柄支持。
