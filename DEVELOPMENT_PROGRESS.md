# Quad Lily 开发进展存档

- **当前里程碑**：v0.31 + 好友试用后续（多编队 / 素材预览 / 调度优化）
- **`package.json`**：仍为 `0.31.0`（未另开小版本号；行为已明显前进）
- **分支**：`feat/friend-beta`
- **最近更新**：2026-09-05
- **生产站**：https://quadlily.netlify.app（本地 CLI 生产部署已上线；GitHub 远端推送可能受网络影响滞后）

---

## 本阶段目标

在 v0.31「好友试用」基础上，把组合玩法做成**可并存的编队单位**，补齐素材库视觉反馈，并压掉播放时不稳定的调度毛刺，让听感更顺。

---

## v0.31 基线（已归档，2026-09-04）

详见下方历史摘要；完整条目保留在提交 `0c6e13c` 对应内容。

| 模块 | 要点 |
|------|------|
| 轨迹 | 圆形 / 线段 / **绘制 Draw** / **闪烁 Flash** |
| 认证 | 中文登录注册、昵称必填、Google OAuth spinner、底栏 v0.31 |
| Studio | 可折叠侧栏、SoftSelect、外接音色、画布工具条、Space=当前 Pad |
| 组合雏形 | Ctrl 多选 + 相位错开的各自运动 |

---

## 2026-09-04 → 09-05 增量（本轮）

### 1. 两套组合逻辑（必须分清）

| 逻辑 | 入口 | 行为 |
|------|------|------|
| **批量各自运动** | 轨迹模式 + Ctrl 多选 | 每节点自己的圆/线/闪烁，`phaseOffset = i/N` |
| **共享编队** | 「组合音符」面板选形状 | 多音符合成 **一个** 圆形 / 线段 / 闪烁单位，落在 `pad.formations[]` |

相关：`quad/groupMotion.ts`、`motionRuntime.ts`（编队优先覆盖单节点 motion）。

### 2. 多编队单位（G1 / G2 / …）

- Pad 从单字段 `formation` 升级为 **`formations: LilyNoteFormation[]`**（旧存档自动迁移）
- `allocateFormationId` → G1、G2、G3…；成员互斥（一音只属一队）
- 画布多枢纽；侧栏「已有编队」切换；可解散
- 选中枢纽后用「轨迹模式」调编队半径 / 周期
- 枢纽可拖动，整组平移

相关：`core.ts` 解析、`QuadLilyApp.tsx`、`QuadLilyCanvas.tsx`、`StudioSidebar`。

### 3. 编队控件约束

- 编队焦点下：**支持整组静音 / 隐藏**；**不支持双音符**（按钮隐藏，生成编队时清掉成员 `endpointPitch`）
- 单节点仍可双音符；素材里双音符继续以 `endpointPitch` 持久化

### 4. 素材库预览

- 缩略图绘制编队轨迹、成员围合、G 枢纽
- 双音符节点有小标记
- `quad/library/preview.ts` + `LibraryDrawer` PadPreview

### 5. 播放调度更顺（性能 / 抖动，不改传播语义）

听感上的「固定缝」仍来自设计：`propagationStepMs = intervalMs / 4`（未改产品步进）。

本轮优化的是**不稳定卡顿**：

| 改动 | 说明 |
|------|------|
| Audio look-ahead | 音符提前约 60ms 唤醒，按 `AudioContext` 绝对时间起振 |
| MIDI timestamp | `send(..., timestamp)` 对齐理论触发点 |
| 周期重启准点 | 仅音符允许 look-ahead，下一圈不被提前 |
| 视觉减负 | `cyclePhase` 过小变化不整树 setState；轨迹采样缓存 |

相关：`cycleRunner.ts`、`quadSynthEngine.ts`、`midiBus.ts`、`motionRuntime.ts`、`QuadLilyApp.tsx`。

### 6. 默认音色

- 游客 / 无本地记忆时默认 **Crystal Pluck**（`DEFAULT_SOUND_PRESET_ID = 'crystal-pluck'`）
- 已有 `localStorage` 音色偏好的老用户不受影响

### 7. 发布状态

- 本地提交含：`112dbe1`（多编队 / 预览 / 调度）等；分支可能 **ahead of origin**
- Netlify 生产：https://quadlily.netlify.app（以最近一次 `netlify deploy --prod` 为准）

---

## 设计取舍（更新）

1. **编队是 Pad 持久实体**；Ctrl 多选批量运动仍是会话态写回各节点 `motion`。
2. **编队 vs 单节点轨迹**：编队成员播放时以编队形状为准；解散后可再各自设轨迹。
3. **传播时间轴仍是阶梯**（`interval/4`），不是按距离连续波速；流畅优化先动调度，产品密度另议。
4. **Space ≠ 全局播放**：全局仍走 Global Play；Space 只控当前 Pad。
5. **版本号**：功能已超过纯 v0.31 文案；正式发版时可升 `0.32.0` 并打 tag。

---

## 已知限制 / 下一步候选

- [ ] 传播密度可调（如 `/8`、按距离传播、同距齐发）— 产品决策后再改
- [ ] 编队之间的触发 / 联动玩法尚未做
- [ ] 组合闪烁目标随拖动后的刷新策略可再打磨
- [ ] GitHub 推送在部分网络环境下失败，需本机/代理补 `git push`
- [ ] 正式发版：对齐 `package.json`、登录底栏版本号、git tag
- [ ] `atmosphere-test.html` 等实验页可按需保留或移出生产路径

---

## 快捷操作备忘

| 键 | 作用 |
|----|------|
| Space | 当前 Pad 播放 / 暂停 |
| 1 / 4 | 单 Pad / 四 Pad 视图 |
| D | 绘制待命 / 取消 |
| F | 闪烁待命 / 取消 |
| Esc | 取消轨迹待命 |
| Ctrl / ⌘ + 点击 | 多选（批量各自运动 / 编队选音） |

---

## 存档说明

- **v0.31** 基线：`0c6e13c` / 2026-09-04
- **本轮增量**：以 2026-09-05 章节为准；大版本可再拆 `DEVELOPMENT_PROGRESS-v0.32.md`

---

## 2026-09-05 Quad-only 仓库收拢（本地待验收）

- 应用入口只加载 `QuadLilyApp`；`/`、`/desk` 及历史路径均不再加载 GEMIDI Lab、Legacy Desk 或 Cycle Lab。
- 移除旧 Gemini HTML 生成器、58 个 experiments、Atmosphere、Arranger、Pattern、Legacy Desk 与 Cycle Lab 页面源码。
- 音阶、MIDI、FM-1 与音高解析依赖已收拢到 `quad/`；保留 Library API、Quad 文档、品牌素材和 Studio 演示页。
- 移除 `@google/genai`、`tone` 以及 experiments 构建复制步骤；包名改为 `quad-lily`。
- 为避免破坏已有浏览器存档和云端 Library 数据，`gemidi.*` localStorage/schema key、`x-gemidi-library-key` 请求头及 Blob store 名暂时保留，后续只能做带迁移的改名。
- 最终本地生产构建：核心 JS 约 `451.31 kB`（gzip `139.32 kB`），另有 `24.35 kB`（gzip `7.78 kB`）按需块；相较混合入口总 JS 约减少一半。
- 本节修改尚未提交、推送或部署；先通过本地生产预览验收，再更新 GitHub 与 Netlify。

---

## 2026-09-05 Onboarding v3（Draft 预览待验收）

- 首次引导由 4 步升级为 5 步：播放与音色、音符增删与参数、运动自动化、批量与共享编队、账号与图案库。
- 引导存储键升级为 `gemidi.quad-lily.onboarding.v3`，看过旧版的用户会重新看到新版一次。
- 每段动画按 13 / 14 / 16 / 16 / 15 秒独立循环；支持步骤圆点直达、上一步、跳过与 `prefers-reduced-motion`。
- 演示画面直接按当前 Lotus Studio 重建：真实运输区、Pad A 工具条、参数卡、ROOT / N01 / G1、传播环、轨迹与图案库。
- 性能策略：产品内使用 React / SVG / CSS 确定性动画，不加载五段 MP4、音频、WebGL 或额外运行时；主 JS 相对清理后基线增加约 `7.87 kB`，gzip 增加约 `1.76 kB`。
- 验证：全量 `184 / 184` 测试通过；Vite 生产构建通过；HTTPS Draft `/desk?onboarding=1` 返回 200，线上构建包含 v3 指纹、五步文案与强制回放入口。
- Draft 预览：`https://6a9b0cf15170b90e6249d790--quadlily.netlify.app/desk?onboarding=1`
- 尚未推送 GitHub，尚未执行 Netlify `--prod`；等待视觉与文案验收后再决定正式部署。

---

## 2026-09-05 Onboarding v4（真实截图图文版，本地待发布）

- 根据视觉复核，移除五段自动播放动画，改为无需等待的五步静态图文教学卡。
- 素材来自 Quad Lily 本地真实页面的 1680 × 960 浏览器截图，不使用生成模型重绘 UI；ImageGen 版本仅保存在 `design-comparison/` 作为构图对照，因为它会重绘图标与控件文字。
- 为五步分别建立 `start / notes / motion / groups / library` 确定性截图状态：音符步骤不提前出现轨迹或 G1，轨迹步骤不出现编队，组合步骤才展示 G1。
- 每个说明卡使用物理裁切后的独立 PNG，并保留一条完整界面定位带；图片始终按原比例完整显示，不再依靠背景位移、溢出或随机缩放。
- 每步采用 2–3 个局部放大模块，桌面端在 1440 × 900 内无需滚动即可看完；窄屏改为纵向布局。Library 的错误/离线列表不进入教学画面。
- 标注层贴合 Lotus Studio：珊瑚粉细描边、深墨绿编号胶囊、薄荷半透明卡片和异形圆角，不把说明文字烙入截图，方便继续修订。
- 引导键升级为 `gemidi.quad-lily.onboarding.v4`；保留 `?onboarding=1` 强制回放、`?onboardingStep=1..5` 直达复核与 `?onboarding=0&guide=<mode>` 截图采集开关。
- 全量 `185 / 185` 测试通过；生产构建通过。核心 JS `457.34 kB`（gzip `141.46 kB`），CSS `169.47 kB`（gzip `27.42 kB`）；19 张引导裁图合计约 `0.33 MB`，按当前步骤按需请求，无动画计时器、视频解码或 WebGL 负担。
- 尚未推送 GitHub、尚未执行 Netlify `--prod`。Draft 上传等待用户对现有 Quad Lily 测试站的再次明确授权。

---

## 2026-09-05 Onboarding v5（真实整页标注版，本地待验收）

- 根据实际观看反馈，撤下每步多张局部裁图，改为 `start / notes / motion / groups / library` 每步一张完整真实界面图，保持五步教学顺序不变。
- 五张母图均从 `?onboarding=0&guide=<mode>` 的确定性 Quad Lily 页面重新抓取；标注使用得意黑、深棕圆角说明卡、珊瑚色箭头与目标环，不使用生成模型重绘界面。
- 编辑母版保持 3840 × 2160；网站资源从母版直接导出为 1920 × 1080 PNG，在约 1120 px 的实际弹窗宽度下保留清晰度，同时避免直接解码 4K 图片带来的内存与首次显示延迟。
- 五张网站图片合计约 1.18 MB，当前步骤只挂载一张，并采用浏览器异步解码；相较 v4 的多图拼贴减少 DOM、说明卡组件和同屏图片请求。
- 引导键升级为 `gemidi.quad-lily.onboarding.v5`，已看过旧版的用户会重新看到本版一次；`?onboarding=1&onboardingStep=1..5` 仍可直达复核。
- 已在 1440 × 900 实际浏览器尺寸逐步截图复核，五步均完整显示，无空白、裁切或弹窗内滚动；全量测试与生产构建通过。
- 尚未推送 GitHub、尚未部署 Netlify；先使用本地 4182 测试链接验收。

### v5 视觉复核调整

- 桌面引导弹窗最大宽度由 1160 px 收敛到 1020 px，更接近右侧内置浏览器的阅读尺度。
- 图片内说明使用更大的得意黑字号；关键控件采用矩形高清“局部特写条”，不使用放大镜图标或圆形镜片。
- 原按钮只保留细目标环；箭头由原位置连到特写条边缘，箭头尖端不再覆盖按钮本体。
- 五步重新收敛为 2–3 组核心标注，避免缩小弹窗后出现信息堆叠。
- 二次复核后，桌面弹窗进一步收敛到 820 px；图内得意黑标题和正文同步放大约 10%–15%。
- 第 2 步特写完整覆盖节点信息、音高操作与传播范围；第 4 步分别完整展示已有编队/音符顺序面板和 G1 三成员整圈；第 5 步改为左右两组独立图文，登录仅保留在说明文案中。
# Onboarding 有序阅读动线调整（本地待验收）

- 五步引导内的提示统一使用 `01 / 02 / 03` 顺序编号，不再混用 `TIP`、`ROOT` 等非顺序标签。
- 第一步改为“四个画布、音色选择与 MIDI 接口”，图片按画布切换、播放与音色、MIDI 的顺序从左至右阅读。
- 第二步改为“随意增删音符，并自定义音符细节”：左上增删、右上 ROOT、下方节点信息编辑，节点信息特写位于说明卡下方。
- 第三步按“左上先选中音符 → 右下选择轨迹模式”重新布置，避免阅读动线来回跳跃。
- 第四步保留从左至右的组合与统一编队运动布局，主文案收敛为批量组合及统一轨迹模式。
- 第五步改为真实操作链：左侧从工作台点击图案库，右侧在 Seed Bank 保存或载入素材，并提示导入导出和登录同步。
- 发布图片仍为单步单张 1920×1080 PNG；弹窗宽度维持约 820px，未增加运行时裁图、动画或额外解码负担。

---

## 2026-09-05 音乐画布品牌与首屏性能更新

- 面向用户的品牌统一为“音乐画布 / MusiCanvas”；保留 `quad-lily`、`gemidi.*` 等内部兼容标识，避免破坏历史浏览器存档与云端素材。
- 官方入口更新为 `https://musicanvas.art/desk?onboarding=1`，新域名加入 Netlify Function CORS 白名单；本地开发的 Library API 也改用该生产域名。
- 五张引导图维持 1920 × 1080，不降低显示尺寸；从 PNG 转为高质量 WebP，并对第一张做 HTML preload、当前步骤高优先级加载、下一步骤预加载。
- 五张图总量由约 1.43 MB 降至约 452 KB，减少约 68%；原 PNG 继续保留作为 README 与编辑母版。
- Studio 侧栏“音符顺序 / 编队形状”统一使用字段标签字号；画布左下角 BPM、音量、调性、节点数统一基线与行高。
- 删除对 Netlify 注入徽标无效的 CSS 隐藏规则。该徽标运行在隔离 frame 内，需在 Netlify 的 `Project configuration > General > Powered by Netlify badge` 关闭。
- 验证：全量 `186 / 186` 测试通过；Vite 生产构建通过。核心 JS `454.13 kB`（gzip `140.38 kB`），CSS `169.52 kB`（gzip `27.37 kB`）。
