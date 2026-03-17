# Voooice 开发计划

## 阶段一：品牌重塑 — 产品更名 VocalText → Voooice

### 1.1 前端代码更名（31个文件）

**配置文件：**
- `index.html` — title 和 meta description
- `capacitor.config.ts` — appName、appId (`com.voooice.app`)、scheme
- `server/package.json` / `package-lock.json` — name 和 description

**i18n 国际化：**
- `src/i18n/locales/zh-CN.ts` — app.name、privacy 相关文案
- `src/i18n/locales/en-US.ts` — 同上
- `src/i18n/index.ts` — localStorage key (`voooice-locale`)

**存储层：**
- `src/utils/storage.ts` — IndexedDB 数据库名 (`VoooiceDB`)
- `public/sw.js` — Service Worker 缓存名

**组件层（所有含品牌名的组件）：**
- `src/App.tsx` — document.title
- `src/components/AuthScreen.tsx`
- `src/components/SpeakView.tsx` — 导出文件名前缀
- `src/components/MultiRoleDialogueView.tsx`
- `src/components/ApiDocsView.tsx` — API 文档中的品牌名
- `src/components/SettingsView.tsx`
- `src/components/PrivacyConsentModal.tsx`
- `src/components/AudiobookView.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/voicebank/shared.tsx`

**服务层：**
- `src/utils/audioExport.ts` — 导出文件名前缀
- `src/services/authService.ts` — localStorage key 前缀、API 路径
- `src/services/azureVoiceProvider.ts`
- `src/services/cloudSyncService.ts`
- `src/services/paymentService.ts`

**后端：**
- `tts-server/app/main.py` — 服务描述
- `tts-server/app/models/schemas.py`
- `tts-server/run.py`
- `server/index.js`
- `server/db.js`
- `server/middleware/auth.js`

**法律文档：**
- `public/terms.html` — 服务条款中的品牌名
- `public/privacy.html` — 隐私政策中的品牌名

**文档：**
- `README.md`
- `tts-server/README.md`

**域名/邮箱替换：**
- `vocaltext.app` → `voooice.app`
- `support@vocaltext.app` → `support@voooice.app`
- `privacy@vocaltext.app` → `privacy@voooice.app`
- `api.vocaltext.app` → `api.voooice.app`

> 注意：IndexedDB 数据库名变更会导致旧数据不可访问，需添加迁移逻辑（从旧 DB 读取并写入新 DB）。

---

## 阶段二：P0 生存级改进

### 2.1 声音银行 MVP 快速录制模式

**目标：** 降低声纹创建门槛，从 50 条录音降为"3分钟快速模式"（8 条核心语句）

**改动文件：**
- `src/components/voicebank/shared.tsx` — 新增 `QUICK_PROMPTS`（8条）常量，在 `ALL_PROMPTS` 基础上标记 `isQuick`
- `src/components/voicebank/GuidedRecordingTab.tsx` — 添加模式切换 UI（快速/完整），根据模式过滤 prompts

**具体实现：**
1. 在 `shared.tsx` 中从 50 条 prompts 中精选 8 条覆盖：日常对话(2)、情感表达(2)、叙述性内容(2)、清晰度练习(1)、个性化(1)
2. GuidedRecordingTab 顶部添加模式选择器（快速3分钟 / 完整高清）
3. 快速模式完成后提示"升级到完整模式可获得更精确的声纹"
4. 两种模式共享同一套录音逻辑和 IndexedDB 存储

### 2.2 TTS Server 真实推理能力

**目标：** 替换当前 sine wave placeholder，接入开源 TTS 模型

**改动文件：**
- `tts-server/app/main.py` — 模型加载和初始化
- `tts-server/app/routes/synthesis.py` — 替换 placeholder 为真实推理
- `tts-server/requirements.txt` — 添加模型依赖

**具体实现：**
1. 集成 Edge-TTS（微软免费 TTS API）作为零配置默认后端：
   - 无需 GPU、无需模型下载
   - 支持中/英/日/韩多语言
   - 支持情感和语速调节
2. 保留 XTTS-v2 / Fish Speech / ChatTTS 作为高级选项（需 GPU）
3. `/v1/tts` 端点逻辑：Edge-TTS（默认）→ 本地模型（如可用）
4. `/v1/health` 返回当前可用的推理引擎列表

### 2.3 移动端 PWA 适配

**目标：** 确保核心录音流程在手机端可用

**改动文件：**
- `index.html` — 添加 PWA manifest 链接（如缺失）
- `public/manifest.json` — 更新品牌名为 Voooice
- `src/App.tsx` — 响应式布局检测
- 关键组件的 Tailwind 响应式类调整

**具体实现：**
1. 检查并完善 PWA manifest（图标、主题色、display: standalone）
2. 为 GuidedRecordingTab 的录音界面添加移动端友好的大按钮布局
3. 底部 Tab 栏在移动端使用固定定位 + 安全区域适配
4. 录音页面在移动端隐藏非必要 UI，突出核心录制按钮

---

## 阶段三：P1 增长级改进

### 3.1 社交分享 — 声音明信片

**目标：** 创建可分享的声音卡片，作为天然增长引擎

**新增文件：**
- `src/components/VoiceCardView.tsx` — 声音明信片创作视图

**改动文件：**
- `src/App.tsx` — 添加 voiceCard 路由
- `src/i18n/locales/zh-CN.ts` / `en-US.ts` — 新增声音明信片文案
- `src/types/index.ts` — 新增 VoiceCard 类型

**具体实现：**
1. 用户选择声纹 → 输入祝福文字 → 选择模板（生日/节日/日常）
2. 后端合成语音 + 前端生成精美卡片图片（Canvas API）
3. 生成可分享链接/图片，支持 Web Share API 一键分享
4. 接收者打开链接后可播放语音 + 查看卡片
5. 卡片底部带 Voooice 品牌水印和下载引导

### 3.2 Marketplace 后端接入

**目标：** 将 mock 数据替换为真实 API

**改动文件：**
- `src/services/marketplaceService.ts` — 接入真实 API
- `src/components/MarketplaceView.tsx` — 添加加载/错误状态
- `server/index.js` — 添加 marketplace 路由（如使用 Node 后端）

**具体实现：**
1. 设计 Marketplace API 端点：
   - `GET /api/marketplace/voices` — 列表（分页、搜索、过滤）
   - `GET /api/marketplace/voices/:id` — 详情
   - `POST /api/marketplace/voices/:id/preview` — 试听
   - `POST /api/marketplace/voices/:id/purchase` — 购买
   - `POST /api/marketplace/voices` — 上架自己的声音
2. MarketplaceView 添加：加载骨架屏、错误重试、空状态
3. 保留 mock 数据作为 API 不可用时的 fallback

### 3.3 AI 辅助有声书创作

**目标：** 为 AudiobookView 添加智能辅助功能

**改动文件：**
- `src/components/AudiobookView.tsx` — 添加 AI 辅助按钮和逻辑
- `src/services/aiAssistantService.ts` — 新增 AI 服务

**具体实现：**
1. 自动角色识别：分析文本中的对话，自动识别说话人并分配角色
2. 自动情感标注：根据上下文语义为每段文字推荐情感类型
3. 智能分章节：根据内容结构自动建议章节分割点
4. 接入方式：调用 LLM API（Claude/GPT）进行文本分析，返回结构化标注结果

---

## 阶段四：P2 壁垒级改进

### 4.1 声音授权协议系统

**目标：** 建立声音使用权限管理机制

**新增文件：**
- `src/components/VoiceLicenseView.tsx` — 授权管理界面

**改动文件：**
- `src/types/index.ts` — 新增 VoiceLicense 类型
- `src/services/voiceCloneService.ts` — 合成前检查授权

**具体实现：**
1. 声纹所有者可设置使用权限（私有/公开/付费授权）
2. 授权记录链：谁在什么时间获得了什么权限
3. 合成时校验授权状态
4. 为未来区块链/NFT 声纹铺设数据结构

### 4.2 B 端 API 开放平台

**目标：** Studio 版 API 面向开发者开放

**改动文件：**
- `src/components/ApiDocsView.tsx` — 完善 API 文档
- `server/` — API key 管理、用量统计、限流

**具体实现：**
1. API Key 申请与管理面板
2. 用量统计仪表盘（调用次数、字符数、费用）
3. 接口限流和配额管理
4. Swagger/OpenAPI 文档生成
5. SDK 示例代码（Python/JS/cURL）

---

## 执行顺序与依赖关系

```
阶段一（品牌重塑）→ 无依赖，立即执行
    │
    ▼
阶段二（P0）→ 三个任务可并行
    ├── 2.1 快速录制模式（独立）
    ├── 2.2 TTS Server 推理（独立）
    └── 2.3 PWA 适配（独立）
    │
    ▼
阶段三（P1）→ 依赖阶段二完成
    ├── 3.1 声音明信片（依赖 2.2 TTS 能力）
    ├── 3.2 Marketplace 后端（独立）
    └── 3.3 AI 辅助创作（独立）
    │
    ▼
阶段四（P2）→ 依赖阶段三完成
    ├── 4.1 声音授权（依赖 3.2 Marketplace）
    └── 4.2 API 平台（独立）
```

## 本次实施范围

考虑到当前开发环境的实际情况（无法安装外部 Python 包、无法启动真实 TTS 服务），**本次实施以下可落地的任务：**

1. **阶段一全部** — 品牌更名 VocalText → Voooice（所有 31 个文件）
2. **阶段二 2.1** — 声音银行快速录制模式
3. **阶段二 2.3** — PWA 移动端适配优化
4. **阶段三 3.1** — 声音明信片功能（前端完整实现）

> 阶段二 2.2（TTS Server 推理）、阶段三 3.2/3.3、阶段四需要后端环境支持，标记为后续迭代。
