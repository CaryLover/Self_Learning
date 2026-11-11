/** 7 家预置厂商清单（调用地址均经 2026-11-11 实测核实，见开发计划 2.4） */

export interface ProviderPreset {
  id: string;
  name: string;
  base: string;
  keyHint?: string; // key 格式提示
  note?: string; // 特殊说明（显示给家长）
  builtinModels?: string[]; // 内置模型清单（GLM 双轨兜底；其他厂商作为拉取前的初始值）
  modelsFetchable: boolean; // 是否支持 GET /models
  testMode: "chat" | "chat-1token"; // ModelScope 的 /models 不校验 key，用 1-token 对话测试
  docsUrl: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "siliconflow",
    name: "SiliconFlow 硅基流动",
    base: "https://api.siliconflow.cn/v1",
    note: "聚合平台，有免费模型，推荐作为默认厂商",
    builtinModels: [
      "deepseek-ai/DeepSeek-V3.1",
      "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
      "Qwen/Qwen2.5-7B-Instruct",
      "Qwen/Qwen3-8B",
      "THUDM/GLM-4-9B-0414",
      "moonshotai/Kimi-K2-Instruct",
    ],
    modelsFetchable: true,
    testMode: "chat",
    docsUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  {
    id: "deepseek",
    name: "DeepSeek 深度求索",
    base: "https://api.deepseek.com",
    note: "价格极低，国内可直充",
    builtinModels: ["deepseek-chat", "deepseek-reasoner"],
    modelsFetchable: true,
    testMode: "chat",
    docsUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    base: "https://open.bigmodel.cn/api/paas/v4",
    note: "模型列表接口只返回付费模型，故提供内置清单兜底；点「获取模型」可拉取最新",
    builtinModels: [
      "glm-4.6",
      "glm-4.5",
      "glm-4.5-air",
      "glm-4.5-flash",
      "glm-4-plus",
      "glm-4-air",
      "glm-4-flash",
      "glm-4-flashx",
      "glm-4-long",
    ],
    modelsFetchable: true,
    testMode: "chat",
    docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "kimi",
    name: "Moonshot Kimi",
    base: "https://api.moonshot.cn/v1",
    builtinModels: [
      "kimi-latest",
      "kimi-k2-0905-preview",
      "kimi-k2-turbo-preview",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
    modelsFetchable: true,
    testMode: "chat",
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "minimax",
    name: "MiniMax",
    base: "https://api.minimax.cn/v1",
    note: "使用新域名 api.minimax.cn；v1 接口无需 Group ID",
    builtinModels: ["MiniMax-M2", "MiniMax-M1", "MiniMax-Text-01"],
    modelsFetchable: true,
    testMode: "chat",
    docsUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
  },
  {
    id: "dashscope",
    name: "通义千问 DashScope",
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    note: "key 与地域绑定：大陆版用本地址，国际版需改为 https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    builtinModels: [
      "qwen3-max",
      "qwen-plus",
      "qwen-turbo",
      "qwen-max",
      "qwen-long",
      "qwen-plus-latest",
    ],
    modelsFetchable: true,
    testMode: "chat",
    docsUrl: "https://bailian.console.aliyun.com/?apiKey=1",
  },
  {
    id: "modelscope",
    name: "ModelScope 魔搭",
    base: "https://api-inference.modelscope.cn/v1",
    keyHint: "ms- 开头",
    note: "有免费额度；/models 不校验 key，故测试按钮用 1-token 对话请求实现",
    builtinModels: [
      "Qwen/Qwen2.5-7B-Instruct",
      "Qwen/Qwen2.5-72B-Instruct",
      "deepseek-ai/DeepSeek-V3",
      "ZhipuAI/glm-4-9b-chat",
    ],
    modelsFetchable: true,
    testMode: "chat-1token",
    docsUrl: "https://modelscope.cn/my/myaccesstoken",
  },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
