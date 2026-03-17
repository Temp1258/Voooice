import React, { useState } from 'react';
import { Code, Copy, Check, Key, Globe, Zap } from 'lucide-react';

interface ApiDocsViewProps {
  apiKey?: string;
}

export function ApiDocsView({ apiKey }: ApiDocsViewProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const codeExamples = [
    {
      title: '文字转语音',
      method: 'POST',
      endpoint: '/api/v1/synthesis',
      description: '使用指定声纹将文字转换为语音',
      curl: `curl -X POST https://api.voooice.app/v1/synthesis \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "你好，这是一段测试文字。",
    "voice_id": "vp_xxxxxxxx",
    "language": "zh-CN",
    "emotion": "neutral",
    "speed": 1.0,
    "stability": 0.5,
    "similarity": 0.75,
    "output_format": "wav"
  }' --output output.wav`,
      response: `HTTP/1.1 200 OK
Content-Type: audio/wav
X-Request-Id: req_abc123
X-Credits-Used: 1
X-Credits-Remaining: 99

[binary audio data]`,
    },
    {
      title: '列出声纹',
      method: 'GET',
      endpoint: '/api/v1/voiceprints',
      description: '获取当前用户所有的声纹列表',
      curl: `curl https://api.voooice.app/v1/voiceprints \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      response: `{
  "voiceprints": [
    {
      "id": "vp_xxxxxxxx",
      "name": "我的声音",
      "language": "zh-CN",
      "average_pitch": 220,
      "duration": 15,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}`,
    },
    {
      title: '上传声纹',
      method: 'POST',
      endpoint: '/api/v1/voiceprints',
      description: '上传音频文件创建新声纹',
      curl: `curl -X POST https://api.voooice.app/v1/voiceprints \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "name=新声纹" \\
  -F "audio=@recording.wav" \\
  -F "language=zh-CN"`,
      response: `{
  "id": "vp_yyyyyyyy",
  "name": "新声纹",
  "status": "processing",
  "estimated_ready": "2024-01-15T10:35:00Z"
}`,
    },
    {
      title: '删除声纹',
      method: 'DELETE',
      endpoint: '/api/v1/voiceprints/:id',
      description: '删除指定声纹及其关联的音频数据',
      curl: `curl -X DELETE https://api.voooice.app/v1/voiceprints/vp_xxxxxxxx \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
      response: `{
  "deleted": true,
  "id": "vp_xxxxxxxx"
}`,
    },
  ];

  const rateLimits = [
    { plan: '免费版 Free', requests: '10 次/天', synthesis: '1,000 字/天', storage: '3 个声纹' },
    { plan: '专业版 Pro', requests: '1,000 次/天', synthesis: '100,000 字/天', storage: '无限' },
    { plan: '企业版 Enterprise', requests: '自定义', synthesis: '自定义', storage: '无限' },
  ];

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">开放 API</h2>
        <p className="text-gray-500 text-sm">将 Voooice 语音合成能力集成到你的应用中</p>
      </div>

      {/* API Key section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-3">
          <Key className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">API Key</h3>
        </div>
        {apiKey ? (
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-700 truncate">
              {apiKey.slice(0, 8)}{'•'.repeat(24)}{apiKey.slice(-4)}
            </code>
            <button
              onClick={() => copyToClipboard(apiKey, -1)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              {copiedIndex === -1 ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-700">
            请在设置页面配置 API Key 后方可使用开放 API。
          </div>
        )}
      </div>

      {/* Base URL */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-2">
          <Globe className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">基础 URL</h3>
        </div>
        <code className="block bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-700">
          https://api.voooice.app/v1
        </code>
      </div>

      {/* Rate limits */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-3">
          <Zap className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">使用限制</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500 font-medium">方案</th>
                <th className="text-left py-2 text-gray-500 font-medium">请求数</th>
                <th className="text-left py-2 text-gray-500 font-medium">合成量</th>
                <th className="text-left py-2 text-gray-500 font-medium">存储</th>
              </tr>
            </thead>
            <tbody>
              {rateLimits.map((limit) => (
                <tr key={limit.plan} className="border-b border-gray-50">
                  <td className="py-2 font-medium text-gray-900">{limit.plan}</td>
                  <td className="py-2 text-gray-600">{limit.requests}</td>
                  <td className="py-2 text-gray-600">{limit.synthesis}</td>
                  <td className="py-2 text-gray-600">{limit.storage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* API Endpoints */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
          <Code className="h-5 w-5 text-indigo-600" />
          <span>API 接口</span>
        </h3>

        {codeExamples.map((example, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    example.method === 'GET' ? 'bg-green-100 text-green-700' :
                    example.method === 'POST' ? 'bg-blue-100 text-blue-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {example.method}
                  </span>
                  <code className="text-sm font-mono text-gray-700">{example.endpoint}</code>
                </div>
                <p className="text-xs text-gray-500 mt-1">{example.description}</p>
              </div>
            </div>

            {/* cURL example */}
            <div className="px-4 py-3 bg-gray-900">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">Request</span>
                <button
                  onClick={() => copyToClipboard(example.curl, index)}
                  className="text-gray-400 hover:text-white"
                >
                  {copiedIndex === index ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <pre className="text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {example.curl}
              </pre>
            </div>

            {/* Response */}
            <div className="px-4 py-3 bg-gray-800">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Response</span>
              <pre className="text-xs text-blue-300 font-mono overflow-x-auto whitespace-pre-wrap mt-1 break-all">
                {example.response}
              </pre>
            </div>
          </div>
        ))}
      </div>

      {/* SDKs */}
      <div className="bg-indigo-50 rounded-2xl p-4">
        <h3 className="font-semibold text-indigo-900 mb-2">SDK 支持（即将推出）</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-white rounded-xl px-3 py-2 text-center text-gray-700 font-medium">
            Python SDK
          </div>
          <div className="bg-white rounded-xl px-3 py-2 text-center text-gray-700 font-medium">
            JavaScript SDK
          </div>
          <div className="bg-white rounded-xl px-3 py-2 text-center text-gray-700 font-medium">
            Swift SDK
          </div>
          <div className="bg-white rounded-xl px-3 py-2 text-center text-gray-700 font-medium">
            REST API
          </div>
        </div>
      </div>
    </div>
  );
}
