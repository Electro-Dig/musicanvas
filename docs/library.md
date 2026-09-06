# Quad Lily Library

Quad Lily 的 Library 分成三层：

1. **我的素材**：保存当前 Pad 或完整四 Pad 工作区。写入顺序是本机优先、云端随后，因此断网不会丢掉刚保存的图案。
2. **公共 Pattern**：随代码版本发布、经过验证且可直接载入的基础图案与四 Pad 场景。
3. **编曲配方**：曲式、对话、能量和节奏的结构建议。它们是可以继续改写的创作起点，目前只用于阅读和创作提示，不会假装成可直接播放的 Pad。

## 云端模型

- 个人素材通过 Netlify Function 写入站点级 Netlify Blobs。
- 浏览器第一次打开 Library 时会生成一个 `gml_…` Library Key；服务端只使用其 SHA-256 哈希作为命名空间。
- Library Key 就是个人库凭证。换设备时复制并粘贴同一把 Key 即可读取同一套素材；不要公开它。
- 单条素材最大 512 KiB。服务端不接受客户端直接指定 Blob 路径。
- 本地开发页面会连接正式 Netlify API；部署后改为同源 `/api/library`。

## GitHub 的角色

GitHub 保存程序、公共 Pattern 和模板版本，适合审阅、回滚和协作；个人实时素材不直接写 GitHub，因为每次写入都会变成一次提交，也需要带写权限的凭证。个人素材因此使用 Netlify Blobs，本机 localStorage 作为即时后备。

## 当前公共库

可播放 Pad：

- Fixed Spine / 固定主干
- Tension Rings / 张力环
- Rigid Orbit / 刚性星座
- Pendulum Question / 左右问答
- Draw Stations / 站点谱

可播放四 Pad 场景：

- Phase Staircase Quartet / 相位阶梯四重奏（周期比 1 : 1.5 : 2 : 3）
- Anchor & Shadow / 锚点与影子

结构配方：

- ABAC Form / 基本曲式
- AABA Return / 回归曲式
- Call & Response / 呼应对话
- Build & Drop / 蓄力与释放
- Basic Drum Skeleton / 基础鼓组骨架
- Tresillo Cell / 3+3+2 律动
- Four-on-the-Floor / 四拍层次

每条配方都包含 notation、相对 cycles 与操作提示。`cycles` 表示在当前 Lily Pad 时间系统里建议保持的循环数，不等同于固定小节数；实际使用时可以按听感缩放、重排或只取其中一步。

## 加载安全

Library 素材使用带版本号的 JSON wrapper。载入前会校验类型、大小、节点数量、音阶、唯一中心节点与运动轨迹；载入后所有 Transport 先停止并发送 MIDI All Notes Off，再由使用者主动试听。
