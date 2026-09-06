# Quad Lily Studio UI 研究与落地指南

> 设计读法：**一张安静的数字工作台，中间盛开一朵由节奏、节点与触摸驱动的极简莲花。**

研究日期：2026-09-03  
真源项目：`D:\Codex\quad-lily`（分支 `studio-console-v1`）  
自动演示页：`/studio-ui-demo.html`

## 1. 参考案例

| 案例 | URL | 调性 | 可借鉴点 |
|---|---|---|---|
| Teenage Engineering OP-1 | https://teenage.engineering/products/op-1 | 克制、精密、玩具感 | 每次只暴露少量参数；颜色映射功能而非装饰 |
| Ableton Live 12 | https://www.ableton.com/en/live/ | 专业、中性、结构化 | 用明度与分组建层级；颜色留给轨道/状态 |
| Monome Grid | https://monome.org/docs/grid/ | 极简、光反馈、乐器性 | Pad 本身即输入与状态；亮度优于图标堆叠 |
| PulseQuaver | https://valent-in.github.io/pulseq/ | 浏览器原生、轻量 | 工作区切分清晰；打开即创作 |
| Ableton Note | https://www.ableton.com/en/note/manual/ | 触控、演奏导向 | 默认 Pad + 少量宏参数，深层按需展开 |
| Borderlands Granular | https://borderlands-granular.com/app/ | 二维手势、空间化 | 节点在画布中直接操纵声音 |
| Patterning 3 | https://olympianoiseco.com/apps/patterning-3/ | 周期、环形、复节奏 | 空间表达时间；播放头安静可追踪 |
| Novation Components | https://novationmusic.com/components | Web MIDI、状态色 | Pad 色有语义；连接管理退到次级区 |

## 2. 当前问题（对照 Studio 实测）

1. **播放钮交通灯化**：绿/红实心按钮（`#388e3c` / `#b71c1c`）像 2010 年代工具条。
2. **Emoji 作图标**：🎛⏱🎵🎯⚡⌨📚🎹🔌 等占据标题，显得玩具化且降低信息密度。
3. **卡片过碎**：每个参数块都有边框与阴影，层级扁平。
4. **强调色过散**：薄荷绿、pad 色、状态色同时抢注意力。
5. **文字同等醒目**：区块标题、控件、说明缺乏字号/字重/muted 差。

## 3. 落地色板（Lotus 主题为主）

| Token | Hex | 用途 |
|---|---|---|
| `--quad-bg` | `#E8EFE9` | Mint Rail 薄荷绿底 |
| `--quad-surface` | `#DFEAE2` | 侧栏 |
| `--quad-surface-raised` | `#F7FAF7` | 白卡 |
| `--quad-ink` | `#1A2420` | 主文字 / 选中胶囊 |
| `--quad-muted` | `#5F7268` | 次级文字 |
| `--quad-line` | `#C5D5CB` | 分隔 |
| `--quad-stamen` | `#6AA88A` | 焦点强调（薄荷绿） |
| 分类 | 左 4px 色条 | 黄/紫/玫/绿/橄榄 = 节奏·音阶·节点·运动·工具 |

Dark 主题保持炭黑纸面，但同样去掉高饱和交通灯播放色。

## 4. 按钮层级

- **Primary**：当前焦点 Pad 色或 stamen 实心；每区最多一个（Play）。
- **Secondary**：raised 底 + 1px line；模式切换、MIDI。
- **Ghost**：透明；Library / Theme / Info。
- **Danger**：默认 ghost；确认态才用低饱和砖红。
- **Playing**：用 ink 实心或 pad 色，**禁止**荧光绿/红绿灯。

## 5. 信息层级

1. **舞台**：Lily 画布（最大、最亮的运动区）
2. **运输**：Play / Pad 切换（顶栏中心）
3. **参数塔**：时钟 → 音阶 → 节点 → 运动（字号递减、标题 muted）
4. **工具**：Library / Theme / Atlas（ghost）
5. **状态条**：一句英文/中文状态，不抢戏

## 6. 明确反对

- Emoji 作为核心图标
- 高饱和绿/红播放钮
- 过粗边框、每个控件独立「盒子」
- 霓虹渐变 / 拟物金属
- 写实莲花插画（意象应由节点与周期自然形成）
