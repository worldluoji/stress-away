# Stress Away Spec

## 概念与愿景

stress-away 是高压青年的职场反PUA助手。当用户在职场中遭遇困境——被领导否定、被同事抢功、被PUA话术困扰——stress-away 能够即时分析情况，生成包含话术反击、心态调整和行动建议的完整方案。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS 4
- **AI**: DeepSeek V4 Flash / MiniMax 2.7

## 功能

### MVP
- [x] 聊天界面：用户输入职场困境 → AI 输出反PUA建议
- [x] 聊天历史持久化：LocalStorage 保存对话记录，刷新后保留
- [x] 模型配置：通过 DEFAULT_MODEL 环境变量选择模型
- [x] API Key 配置：通过 .env.local 管理

## 文件结构

```
├── app/
│   ├── api/chat/route.ts  # AI 对话 API
│   ├── page.tsx           # 主页聊天界面
│   └── layout.tsx         # 根布局
├── lib/
│   ├── models.ts          # 模型配置及调用接口
│   └── storage.ts         # LocalStorage 持久化工具
├── .env.local.example     # 环境变量模板
└── package.json
```

## API

### POST /api/chat

请求：
```json
{
  "messages": [{ "role": "user", "content": "领导当着全组的面说我的方案是垃圾..." }]
}
```

响应：
```json
{
  "reply": "这里是AI生成的反PUA建议..."
}
```