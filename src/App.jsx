import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin,
  Plane,
  Hotel,
  StickyNote,
  Plus,
  Minus,
  Maximize,
  Trash2,
  Calendar,
  DollarSign,
  Link as LinkIcon,
  Sparkles,
  BookOpen,
  X,
  Printer,
  Loader2,
  Wand2,
  Sun,
  Cloud,
  CloudRain,
  Save,
  PieChart,
  BrainCircuit,
  Settings,
} from 'lucide-react';

// --- 常量与配置 ---
const NODE_TYPES = {
  LOCATION: { id: 'location', icon: MapPin, color: 'bg-red-600', label: '景点', category: 'play' },
  TRANSPORT: { id: 'transport', icon: Plane, color: 'bg-blue-600', label: '交通', category: 'transport' },
  STAY: { id: 'stay', icon: Hotel, color: 'bg-orange-500', label: '住宿', category: 'stay' },
  NOTE: { id: 'note', icon: StickyNote, color: 'bg-yellow-500', label: '笔记', category: 'other' },
};

const WEATHER_TYPES = [
  { icon: Sun, label: '晴', color: 'text-orange-400' },
  { icon: Cloud, label: '多云', color: 'text-slate-400' },
  { icon: CloudRain, label: '小雨', color: 'text-blue-400' },
];

// --- Volcengine ARK API Helper ---
const DEFAULT_ARK_API_BASE = import.meta.env.VITE_ARK_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_ARK_MODEL = import.meta.env.VITE_ARK_MODEL || '';
const DEFAULT_ARK_API_KEY = import.meta.env.VITE_ARK_API_KEY || '';

const getDefaultArkConfig = () => ({
  apiKey: DEFAULT_ARK_API_KEY,
  model: DEFAULT_ARK_MODEL,
  baseUrl: DEFAULT_ARK_API_BASE,
});

const extractJsonFromText = (rawText) => {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    const matched = rawText.match(/\{[\s\S]*\}/);
    if (!matched) return null;
    try {
      return JSON.parse(matched[0]);
    } catch {
      return null;
    }
  }
};

const callArk = async (prompt, systemInstruction = '', config = getDefaultArkConfig()) => {
  const { apiKey, model, baseUrl } = config || {};
  if (!apiKey || !model || !baseUrl) return null;

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemInstruction }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`ARK API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.output_text || data?.output?.[0]?.content?.[0]?.text || '';
};

const generateWithArk = async (prompt, systemInstruction, responseSchema, config) => {
  try {
    const schemaHint = responseSchema
      ? `\n\n严格按此 JSON Schema 输出（不要输出多余文本）:\n${JSON.stringify(responseSchema)}`
      : '';
    const fullPrompt = `${prompt}${schemaHint}`;
    const resultText = await callArk(fullPrompt, systemInstruction, config);
    return extractJsonFromText(resultText);
  } catch (error) {
    console.error('AI Generation Failed:', error);
    return null;
  }
};

// 定义 Schema
const SINGLE_NODE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    content: { type: 'STRING' },
    cost: { type: 'STRING' },
    type: { type: 'STRING', enum: ['location', 'stay', 'transport', 'note'] },
    image_keyword: { type: 'STRING' },
  },
};

const MULTI_STEP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          content: { type: 'STRING' },
          cost: { type: 'STRING' },
          type: { type: 'STRING', enum: ['location', 'stay', 'transport', 'note'] },
          image_keyword: { type: 'STRING' },
        },
      },
    },
  },
};

const App = () => {
  // --- 状态管理 ---
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState(() => {
    const defaults = getDefaultArkConfig();
    try {
      const saved = localStorage.getItem('voyage_api_config');
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      return {
        apiKey: parsed.apiKey || defaults.apiKey || '',
        model: parsed.model || defaults.model || '',
        baseUrl: parsed.baseUrl || defaults.baseUrl || DEFAULT_ARK_API_BASE,
      };
    } catch {
      return defaults;
    }
  });

  const [nodes, setNodes] = useState(() => {
    try {
      const saved = localStorage.getItem('voyage_nodes');
      const initialNodes = saved
        ? JSON.parse(saved)
        : [
            {
              id: '1',
              x: 100,
              y: 100,
              type: 'location',
              title: '北京首都国际机场',
              content: '中午12点落地，乘坐机场快轨前往市区。',
              date: '2024-10-01',
              cost: '¥50',
              weather: 0,
              image:
                'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?auto=format&fit=crop&w=600&q=80',
            },
            {
              id: '2',
              x: 600,
              y: 200,
              type: 'stay',
              title: '王府井酒店',
              content: '办理入住，放下行李，周边逛逛。',
              date: '2024-10-01',
              cost: '¥650',
              weather: 0,
              image:
                'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=600&q=80',
            },
          ];

      // 数据清洗：确保所有字段存在且类型正确，防止 undefined 错误
      if (Array.isArray(initialNodes)) {
        return initialNodes.map((n) => ({
          ...n,
          title: n.title || '',
          content: n.content || '',
          cost: n.cost ? String(n.cost) : '',
          date: n.date || '',
          type: n.type || 'note',
          image: n.image || null,
          weather: typeof n.weather === 'number' ? n.weather : 0,
        }));
      }
      return [];
    } catch (e) {
      console.error('Failed to load nodes from local storage', e);
      return [];
    }
  });

  const [connections, setConnections] = useState(() => {
    try {
      const saved = localStorage.getItem('voyage_connections');
      return saved ? JSON.parse(saved) : [{ id: 'c1', from: '1', to: '2' }];
    } catch (e) {
      return [];
    }
  });

  const [canvasTransform, setCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const [connectingSourceId, setConnectingSourceId] = useState(null);
  const [showRoadbook, setShowRoadbook] = useState(false);
  const [loadingNodes, setLoadingNodes] = useState(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tripAdvice, setTripAdvice] = useState('');

  const viewportRef = useRef(null);

  // --- 持久化逻辑 ---
  useEffect(() => {
    localStorage.setItem('voyage_api_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('voyage_nodes', JSON.stringify(nodes));
      localStorage.setItem('voyage_connections', JSON.stringify(connections));
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, connections]);

  // --- 核心逻辑 ---

  const startConnection = (e, nodeId) => {
    e.stopPropagation();
    if (connectingSourceId === nodeId) {
      setConnectingSourceId(null);
    } else if (connectingSourceId) {
      if (connectingSourceId !== nodeId) {
        const exists = connections.some(
          (c) =>
            (c.from === connectingSourceId && c.to === nodeId) ||
            (c.from === nodeId && c.to === connectingSourceId),
        );
        if (!exists) {
          setConnections([...connections, { id: `c-${Date.now()}`, from: connectingSourceId, to: nodeId }]);
        }
        setConnectingSourceId(null);
      }
    } else {
      setConnectingSourceId(nodeId);
    }
  };

  // --- AI 功能 1: 智能填充 ---
  const handleAIFill = async (nodeId) => {
    const currentNode = nodes.find((n) => n.id === nodeId);
    // 安全检查：使用 || '' 确保 trim 不会报错
    if (!currentNode || !(currentNode.content || '').trim()) return;

    setLoadingNodes((prev) => new Set(prev).add(nodeId));

    const prompt = `用户需求: "${currentNode.content}".
    请分析这是单一地点的查询，还是一个包含多个步骤/地点的行程规划需求。
    如果是行程规划（例如"北京三日游"、"先吃饭再看电影"、"去成都看熊猫吃火锅"），请将其拆分为多个具体的节点步骤（建议 2-5 个步骤）。
    如果是单一查询（例如"故宫"、"附近的咖啡馆"），返回一个步骤即可。`;

    const systemInstruction = `你是一个专业的旅行规划助手。
    请严格以 JSON 格式返回结果，包含一个 "steps" 数组。
    数组中的每个对象字段：
    - title: 地点名称
    - content: 简短描述
    - cost: 预估花费 (如 "¥60")
    - type: "location" | "stay" | "transport" | "note"
    - image_keyword: 用于生成图片的英文关键词`;

    const result = await generateWithArk(prompt, systemInstruction, MULTI_STEP_SCHEMA, apiConfig);

    if (result && result.steps && result.steps.length > 0) {
      const steps = result.steps;
      const newNodes = [];
      const newConnections = [];
      let previousNodeId = nodeId;
      const startX = currentNode.x;
      const startY = currentNode.y;

      let updatedNodes = [...nodes];
      const updatedConnections = [...connections];

      // 处理第一步
      const firstStep = steps[0];
      updatedNodes = updatedNodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              title: firstStep.title || '',
              type: firstStep.type || 'note',
              content: firstStep.content || '',
              cost: firstStep.cost ? String(firstStep.cost) : '',
              date: n.date || '2024-10-02',
              image: `https://image.pollinations.ai/prompt/${encodeURIComponent(
                firstStep.image_keyword || 'travel',
              )}?width=600&height=400&nologo=true&seed=${Math.random()}`,
              weather: Math.floor(Math.random() * 3),
            }
          : n,
      );

      // 处理后续步骤
      for (let i = 1; i < steps.length; i++) {
        const step = steps[i];
        const newNodeId = `${Date.now()}-${i}`;

        const newX = startX + i * 380;
        const newY = startY + (Math.random() * 60 - 30);

        const newNode = {
          id: newNodeId,
          x: newX,
          y: newY,
          type: step.type || 'note',
          title: step.title || '',
          content: step.content || '',
          cost: step.cost ? String(step.cost) : '',
          date: currentNode.date || '',
          image: `https://image.pollinations.ai/prompt/${encodeURIComponent(
            step.image_keyword || 'travel',
          )}?width=600&height=400&nologo=true&seed=${Math.random()}`,
          weather: Math.floor(Math.random() * 3),
        };

        newNodes.push(newNode);
        newConnections.push({
          id: `c-${newNodeId}`,
          from: previousNodeId,
          to: newNodeId,
        });

        previousNodeId = newNodeId;
      }

      setNodes([...updatedNodes, ...newNodes]);
      setConnections([...updatedConnections, ...newConnections]);
    }

    setLoadingNodes((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  };

  // --- AI 功能 2: 下一站推荐 ---
  const generateNextStop = async (sourceNodeId) => {
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    const newNodeId = Date.now().toString();
    const newX = sourceNode.x + 380;
    const newY = sourceNode.y + (Math.random() * 100 - 50);

    const tempNode = {
      id: newNodeId,
      x: newX,
      y: newY,
      type: 'note',
      title: 'AI 思考中...',
      content: '正在规划最佳路线...',
      date: sourceNode.date || '',
      cost: '...',
      weather: 0,
      image: null,
    };

    setNodes((prev) => [...prev, tempNode]);
    setConnections((prev) => [...prev, { id: `c-${Date.now()}`, from: sourceNodeId, to: newNodeId }]);
    setLoadingNodes((prev) => new Set(prev).add(newNodeId));

    const prompt = `当前行程点是: "${sourceNode.title}" (${sourceNode.content})。
    请推荐 **一个** 逻辑上合理的下一站。
    要求：距离适中，顺路。`;

    const systemInstruction = `你是一个资深导游。请以 JSON 格式返回 **一个** 推荐地点。
    JSON 字段: title, content, cost, type (location/stay/transport), image_keyword (英文)。`;

    const result = await generateWithArk(prompt, systemInstruction, SINGLE_NODE_SCHEMA, apiConfig);

    if (result) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === newNodeId
            ? {
                ...n,
                title: result.title || '',
                type: result.type || 'location',
                content: result.content || '',
                cost: result.cost ? String(result.cost) : '',
                image: `https://image.pollinations.ai/prompt/${encodeURIComponent(
                  result.image_keyword || 'travel',
                )}?width=600&height=400&nologo=true&seed=${Math.random()}`,
              }
            : n,
        ),
      );
    } else {
      setNodes((prev) => prev.map((n) => (n.id === newNodeId ? { ...n, title: '生成失败', content: '请重试' } : n)));
    }

    setLoadingNodes((prev) => {
      const next = new Set(prev);
      next.delete(newNodeId);
      return next;
    });
  };

  // --- AI 功能 3: 全局行程分析 ---
  const analyzeTrip = async () => {
    setIsAnalyzing(true);
    setTripAdvice('');

    const tripSummary = nodes.map((n) => `${n.date || '未定日期'}: ${n.title} (${n.cost})`).join('\n');
    const prompt = `请分析以下这份旅游行程，给出 3 条简短、犀利的建议。\n\n行程列表:\n${tripSummary}`;

    if (!apiConfig.apiKey || !apiConfig.model || !apiConfig.baseUrl) {
      setTripAdvice('请先在设置中填写 ARK API Key / Model / Base URL。');
      setIsAnalyzing(false);
      return;
    }

    try {
      const advice = await callArk(prompt, '你是旅游规划顾问，请用中文给出3条简短建议。', apiConfig);
      setTripAdvice(advice || '分析失败，请稍后重试。');
    } catch (e) {
      setTripAdvice('无法连接到 AI 助手。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- 画布交互逻辑 ---
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomSpeed = 0.001;
      const newScale = Math.min(Math.max(canvasTransform.scale - e.deltaY * zoomSpeed, 0.2), 3);
      setCanvasTransform((prev) => ({ ...prev, scale: newScale }));
    } else {
      setCanvasTransform((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleMouseDown = (e) => {
    if (e.target === viewportRef.current || e.target.closest('.canvas-bg')) {
      setConnectingSourceId(null);
    }
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (isPanning) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        setCanvasTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
      }

      if (draggedNodeId) {
        const rect = viewportRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
        const canvasY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
        setNodes((prev) =>
          prev.map((node) =>
            node.id === draggedNodeId ? { ...node, x: canvasX - dragOffset.x, y: canvasY - dragOffset.y } : node,
          ),
        );
      }
    },
    [isPanning, draggedNodeId, lastMousePos, canvasTransform, dragOffset],
  );

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
  };

  const addNewNode = (type) => {
    const newNode = {
      id: Date.now().toString(),
      x: (-canvasTransform.x + window.innerWidth / 2) / canvasTransform.scale - 140,
      y: (-canvasTransform.y + window.innerHeight / 2) / canvasTransform.scale - 100,
      type,
      title: '未定行程',
      content: '',
      date: '',
      cost: '',
      weather: 0,
      image: null,
    };
    setNodes([...nodes, newNode]);
  };

  const deleteNode = (id) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setConnections(connections.filter((c) => c.from !== id && c.to !== id));
  };

  const updateNode = (id, field, value) => {
    setNodes(nodes.map((n) => (n.id === id ? { ...n, [field]: value } : n)));
  };

  // --- 辅助计算 ---
  const { roadbookData, budgetStats, totalCost } = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    const stats = { play: 0, stay: 0, transport: 0, other: 0 };
    let total = 0;

    nodes.forEach((n) => {
      const costStr = typeof n.cost === 'string' ? n.cost : String(n.cost || '');
      const val = parseFloat(costStr.replace(/[^0-9.]/g, '')) || 0;

      total += val;

      const typeKey = (n.type || 'note').toUpperCase();
      const nodeTypeConfig = NODE_TYPES[typeKey] || NODE_TYPES.NOTE;

      const cat = nodeTypeConfig.category;
      if (stats[cat] !== undefined) stats[cat] += val;
      else stats.other += val;
    });

    return { roadbookData: sorted, budgetStats: stats, totalCost: total };
  }, [nodes]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-red-100">
      {/* 顶部工具栏 */}
      <header className="absolute left-1/2 top-6 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/50 bg-white/90 px-4 py-2 shadow-xl backdrop-blur-md transition-all hover:shadow-2xl">
        <h1 className="mr-4 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-lg font-bold text-transparent">VoyageBoard</h1>
        <div className="mx-2 h-6 w-[1px] bg-slate-200" />
        {Object.entries(NODE_TYPES).map(([key, config]) => (
          <button
            key={key}
            onClick={() => addNewNode(config.id)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            <config.icon size={16} className={config.color.replace('bg-', 'text-')} />
            <span>{config.label}</span>
          </button>
        ))}
        <div className="mx-2 h-6 w-[1px] bg-slate-200" />
        <button
          onClick={() => setShowRoadbook(true)}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-md shadow-red-200 transition-colors hover:bg-red-700"
        >
          <BookOpen size={16} />
          <span>行程单</span>
        </button>
        <div className="ml-2 flex items-center gap-1 text-xs text-slate-400">
          <Save size={12} />
          <span>已保存</span>
        </div>
        <button
          onClick={() => setApiSettingsOpen(true)}
          className="ml-1 flex items-center gap-1 rounded-xl border border-red-100 bg-gradient-to-r from-white to-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <Settings size={13} />
          API 设置
        </button>
      </header>

      {/* 路书侧边栏 (带预算仪表盘 & AI 分析) */}
      <div
        className={`absolute inset-y-0 right-0 z-[60] flex w-96 transform flex-col border-l border-slate-100 bg-white shadow-2xl transition-transform duration-300 ease-in-out ${showRoadbook ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">行程概览</h2>
            <p className="mt-1 text-xs text-slate-500">
              共 {nodes.length} 个点 • 总计 ¥{totalCost}
            </p>
          </div>
          <button onClick={() => setShowRoadbook(false)} className="rounded-full p-2 transition-colors hover:bg-slate-200">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* AI 分析区域 */}
        <div className="border-b border-indigo-100 bg-indigo-50 px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-500">
              <BrainCircuit size={14} /> AI 助手分析
            </h3>
            <button
              onClick={analyzeTrip}
              disabled={isAnalyzing}
              className="rounded-md bg-indigo-100 px-2 py-1 text-[10px] text-indigo-700 transition-colors hover:bg-indigo-200"
            >
              {isAnalyzing ? '分析中...' : '重新分析'}
            </button>
          </div>

          {tripAdvice ? (
            <div className="whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-3 text-xs leading-relaxed text-slate-600">
              {tripAdvice}
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">点击“分析”让 AI 检查你的行程安排合理性。</p>
          )}
        </div>

        {/* 预算仪表盘 */}
        <div className="border-b border-slate-100 bg-white px-6 py-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <PieChart size={14} /> 预算分布
          </h3>
          <div className="mb-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {totalCost > 0 && (
              <>
                <div style={{ width: `${(budgetStats.play / totalCost) * 100}%` }} className="bg-red-500" title="玩乐" />
                <div style={{ width: `${(budgetStats.stay / totalCost) * 100}%` }} className="bg-orange-500" title="住宿" />
                <div
                  style={{ width: `${(budgetStats.transport / totalCost) * 100}%` }}
                  className="bg-blue-500"
                  title="交通"
                />
              </>
            )}
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />玩乐: ¥{budgetStats.play}
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-orange-500" />住宿: ¥{budgetStats.stay}
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500" />交通: ¥{budgetStats.transport}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {roadbookData.map((node) => {
            const weatherIndex = typeof node.weather === 'number' ? node.weather : 0;
            const safeWeather = WEATHER_TYPES[weatherIndex] || WEATHER_TYPES[0];
            const WeatherIcon = safeWeather.icon;
            // 修复：确保 type 存在且有效，防止 toUpperCase 报错
            const typeKey = (node.type || 'note').toUpperCase();
            const nodeTypeConfig = NODE_TYPES[typeKey] || NODE_TYPES.NOTE;

            return (
              <div key={node.id} className="group relative last:border-0 border-l-2 border-slate-200 pl-6">
                <div className={`absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white ${nodeTypeConfig.color}`} />
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-500">
                      {node.date || '-- / --'}
                    </span>
                    {node.date && <WeatherIcon size={14} className={safeWeather.color} />}
                  </div>
                  <span className="text-xs font-medium text-slate-400">¥{node.cost}</span>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 transition-all group-hover:bg-white group-hover:shadow-sm">
                  <h3 className="mb-1 text-sm font-bold text-slate-800">{node.title}</h3>
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{node.content}</p>
                </div>
              </div>
            );
          })}

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-white transition-colors hover:bg-slate-800">
              <Printer size={16} />
              导出 PDF 路书
            </button>
          </div>
        </div>
      </div>



      {apiSettingsOpen && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/40 bg-white/90 p-0 shadow-2xl">
            <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-red-300/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-orange-300/30 blur-3xl" />

            <div className="relative border-b border-slate-100 bg-white/70 px-6 py-5">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-500">VoyageBoard</div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800">ARK API 设置中心</h3>
                <button
                  onClick={() => setApiSettingsOpen(false)}
                  className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">本地浏览器存储，不会自动上传到仓库。</p>
            </div>

            <div className="relative space-y-4 px-6 py-5 text-sm">
              <label className="block">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">API Key</div>
                <input
                  type="password"
                  value={apiConfig.apiKey}
                  onChange={(e) => setApiConfig((p) => ({ ...p, apiKey: e.target.value.trim() }))}
                  placeholder="24037c8d-xxxx..."
                  className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none ring-red-200 transition-all focus:border-red-300 focus:ring-2"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Model Endpoint ID</div>
                <input
                  type="text"
                  value={apiConfig.model}
                  onChange={(e) => setApiConfig((p) => ({ ...p, model: e.target.value.trim() }))}
                  placeholder="ep-20260217114921-wvt6d"
                  className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none ring-red-200 transition-all focus:border-red-300 focus:ring-2"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Base URL</div>
                <input
                  type="text"
                  value={apiConfig.baseUrl}
                  onChange={(e) => setApiConfig((p) => ({ ...p, baseUrl: e.target.value.trim() }))}
                  placeholder="https://ark.cn-beijing.volces.com/api/v3"
                  className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none ring-red-200 transition-all focus:border-red-300 focus:ring-2"
                />
              </label>
            </div>

            <div className="relative flex items-center justify-between border-t border-slate-100 bg-white/70 px-6 py-4">
              <button
                onClick={() => setApiConfig(getDefaultArkConfig())}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                恢复默认
              </button>
              <button
                onClick={() => setApiSettingsOpen(false)}
                className="rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:brightness-105"
              >
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoadbook && <div onClick={() => setShowRoadbook(false)} className="absolute inset-0 z-[55] bg-black/20 backdrop-blur-[1px]" />}

      {/* 右下角控制区 */}
      <div className="absolute bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {/* 连线模式提示 */}
        {connectingSourceId && (
          <div className="flex animate-bounce items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <LinkIcon size={16} />
            点击另一个节点连线
          </div>
        )}

        {/* 小地图 (Minimap) */}
        <div className="relative hidden h-32 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white/90 shadow-lg backdrop-blur sm:block">
          <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] bg-[length:4px_4px] opacity-20" />
          {nodes.map((n) => {
            // 修复：确保 type 存在且有效
            const typeKey = (n.type || 'note').toUpperCase();
            const nodeTypeConfig = NODE_TYPES[typeKey] || NODE_TYPES.NOTE;
            return (
              <div
                key={n.id}
                className={`absolute h-1.5 w-1.5 rounded-full ${nodeTypeConfig.color}`}
                style={{
                  left: `${(n.x + 2000) * 0.03}px`,
                  top: `${(n.y + 2000) * 0.03}px`,
                }}
              />
            );
          })}
          {/* 视口框 */}
          <div
            className="absolute border-2 border-red-500/30 bg-red-500/10"
            style={{
              left: `${(-canvasTransform.x + 2000) * 0.03}px`,
              top: `${(-canvasTransform.y + 2000) * 0.03}px`,
              width: `${(window.innerWidth / canvasTransform.scale) * 0.03}px`,
              height: `${(window.innerHeight / canvasTransform.scale) * 0.03}px`,
            }}
          />
        </div>

        {/* 缩放控制 */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <button
              onClick={() => setCanvasTransform((p) => ({ ...p, scale: Math.min(p.scale + 0.1, 3) }))}
              className="border-b border-slate-100 p-3 transition-colors hover:bg-slate-50"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => setCanvasTransform((p) => ({ ...p, scale: Math.max(p.scale - 0.1, 0.2) }))}
              className="p-3 transition-colors hover:bg-slate-50"
            >
              <Minus size={20} />
            </button>
          </div>
          <button
            onClick={() => setCanvasTransform({ x: 0, y: 0, scale: 1 })}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg transition-colors hover:bg-slate-50"
          >
            <Maximize size={20} />
          </button>
        </div>
      </div>

      {/* 画布区域 */}
      <div
        ref={viewportRef}
        className="canvas-bg h-full w-full cursor-default"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`,
            transformOrigin: '0 0',
            transition: isPanning || draggedNodeId ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className="relative h-0 w-0"
        >
          {/* 背景网格 */}
          <div
            className="pointer-events-none absolute"
            style={{
              width: '20000px',
              height: '20000px',
              left: '-10000px',
              top: '-10000px',
              backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
              backgroundSize: '40px 40px',
              opacity: 0.5,
            }}
          />

          {/* SVG 连线层 */}
          <svg className="absolute left-[-10000px] top-[-10000px] z-0 h-[20000px] w-[20000px] pointer-events-none overflow-visible">
            {connections.map((conn) => {
              const fromNode = nodes.find((n) => n.id === conn.from);
              const toNode = nodes.find((n) => n.id === conn.to);
              if (!fromNode || !toNode) return null;

              const fX = fromNode.x + 10000;
              const fY = fromNode.y + 10000;
              const tX = toNode.x + 10000;
              const tY = toNode.y + 10000;

              const startX = fX + 280; // 节点宽度调整
              const startY = fY + 120; // 节点高度调整
              const endX = tX;
              const endY = tY + 120;

              // 计算距离 (模拟: 1px = 0.5km)
              const distPx = Math.hypot(endX - startX, endY - startY);
              const distKm = Math.round(distPx * 0.5);

              const cp1X = startX + (endX - startX) / 2;
              const d = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp1X} ${endY}, ${endX} ${endY}`;

              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;

              return (
                <g key={conn.id}>
                  <path d={d} stroke="#cbd5e1" strokeWidth="4" fill="none" />
                  <path
                    d={d}
                    stroke={connectingSourceId ? '#94a3b8' : '#ef4444'}
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray={connectingSourceId ? '5,5' : '0'}
                  />

                  {/* 距离标签 */}
                  {!connectingSourceId && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect x="-30" y="-12" width="60" height="24" rx="12" fill="white" stroke="#e2e8f0" />
                      <text x="0" y="4" textAnchor="middle" className="fill-slate-500 text-[10px] font-medium">
                        {distKm}km
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* 节点层 */}
          {nodes.map((node) => {
            // 修复：确保 type 存在且有效
            const typeKey = (node.type || 'note').toUpperCase();
            const Config = NODE_TYPES[typeKey] || NODE_TYPES.NOTE;
            const Icon = Config.icon;
            const isConnecting = connectingSourceId === node.id;
            const isLoading = loadingNodes.has(node.id);
            const weatherIndex = typeof node.weather === 'number' ? node.weather : 0;
            const safeWeather = WEATHER_TYPES[weatherIndex] || WEATHER_TYPES[0];
            const WeatherIcon = safeWeather.icon;

            return (
              <div
                key={node.id}
                className={`absolute z-10 flex w-[280px] select-none flex-col rounded-2xl border bg-white shadow-sm transition-all duration-200
                  ${isConnecting ? 'border-red-500 ring-4 ring-red-400 ring-opacity-50 shadow-xl' : 'border-slate-200 hover:shadow-2xl'}
                  ${isLoading ? 'ring-2 ring-red-400 ring-opacity-50' : ''}
                `}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  cursor: draggedNodeId === node.id ? 'grabbing' : 'auto',
                }}
              >
                {/* 顶部把手 & 标题区 */}
                <div
                  className={`relative flex h-24 cursor-grab items-start justify-between overflow-hidden rounded-t-2xl p-3 active:cursor-grabbing
                    ${!node.image ? Config.color : 'bg-slate-900'}
                  `}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggedNodeId(node.id);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragOffset({
                      x: (e.clientX - rect.left) / canvasTransform.scale,
                      y: (e.clientY - rect.top) / canvasTransform.scale,
                    });
                  }}
                >
                  {/* 背景图 */}
                  {node.image && (
                    <div className="absolute inset-0 z-0">
                      <img src={node.image} alt="cover" className="h-full w-full object-cover opacity-80" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    </div>
                  )}

                  <div className="relative z-10 flex w-full items-center gap-2 font-medium text-white">
                    <div className={`rounded-lg p-1.5 shadow-sm ${Config.color}`}>
                      <Icon size={16} />
                    </div>
                    <input
                      value={node.title}
                      onChange={(e) => updateNode(node.id, 'title', e.target.value)}
                      className="w-full border-none bg-transparent text-base font-bold text-white outline-none drop-shadow-md placeholder:text-white/70 focus:ring-0"
                      placeholder="标题..."
                    />
                  </div>

                  {/* 操作按钮组 */}
                  <div className="relative z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => startConnection(e, node.id)}
                      className="rounded-lg bg-white/20 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-red-600"
                    >
                      <LinkIcon size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNode(node.id);
                      }}
                      className="rounded-lg bg-white/20 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 内容区域 */}
                <div className="relative flex-1 space-y-3 rounded-b-2xl bg-white p-4">
                  {/* AI 输入/内容区 */}
                  <div className="group/input relative">
                    <textarea
                      value={node.content}
                      onChange={(e) => updateNode(node.id, 'content', e.target.value)}
                      className={`h-16 w-full resize-none rounded-lg border border-slate-100 bg-slate-50 p-2 text-sm leading-relaxed text-slate-600 outline-none transition-all focus:border-red-200 focus:bg-white focus:ring-2 focus:ring-red-100
                        ${isLoading ? 'opacity-50' : ''}
                      `}
                      placeholder="✨ AI 功能：输入'北京三日游'，点击右下角魔法棒..."
                      disabled={isLoading}
                    />

                    {/* AI 触发按钮 */}
                    {/* 修复：增加 node.content 安全检查，防止 trim 报错 */}
                    <button
                      onClick={() => handleAIFill(node.id)}
                      disabled={isLoading || !(node.content || '').trim()}
                      className={`absolute bottom-2 right-2 flex items-center gap-1 rounded-md p-1.5 transition-all duration-300
                        ${
                          isLoading
                            ? 'bg-red-50 text-red-400'
                            : (node.content || '').trim()
                              ? 'bg-red-100 text-red-600 hover:bg-red-600 hover:text-white'
                              : 'hidden'
                        }
                      `}
                      title="点击让 AI 规划行程"
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    </button>
                  </div>

                  {/* 信息栏 */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-1.5">
                      <Calendar size={14} className="text-slate-400" />
                      <input
                        type="text"
                        value={node.date}
                        onChange={(e) => updateNode(node.id, 'date', e.target.value)}
                        className="w-full border-none bg-transparent p-0 text-xs text-slate-600 outline-none"
                        placeholder="日期"
                      />
                      <div
                        className="cursor-pointer border-l border-slate-200 pl-2"
                        onClick={() => updateNode(node.id, 'weather', ((node.weather || 0) + 1) % 3)}
                      >
                        <WeatherIcon size={14} className={safeWeather.color} />
                      </div>
                    </div>

                    <div className="flex w-24 items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 p-1.5">
                      <DollarSign size={14} className="text-slate-400" />
                      <input
                        type="text"
                        value={node.cost}
                        onChange={(e) => updateNode(node.id, 'cost', e.target.value)}
                        className="w-full border-none bg-transparent p-0 text-xs font-medium text-slate-600 outline-none"
                        placeholder="价格"
                      />
                    </div>
                  </div>

                  {/* 推荐下一站 (悬浮球) */}
                  {(node.type === 'location' || node.type === 'stay') && !isLoading && (
                    <button
                      onClick={() => generateNextStop(node.id)}
                      className="absolute -right-4 top-1/2 z-20 translate-x-4 -translate-y-1/2 rounded-full border border-slate-100 bg-white p-2.5 text-red-600 opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 hover:scale-110 hover:text-red-700 group-hover:translate-x-0 group-hover:opacity-100"
                      title="AI 推荐下一站"
                    >
                      <Sparkles size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default App;
