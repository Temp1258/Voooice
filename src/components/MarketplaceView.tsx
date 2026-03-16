import React, { useState } from 'react';
import { Search, Star, Download, Play, Tag, Filter, Globe2, Heart } from 'lucide-react';
import type { MarketplaceVoice } from '../types';

const mockVoices: MarketplaceVoice[] = [
  {
    id: 'mv-1',
    name: '温柔女声',
    authorName: '声音工坊',
    description: '温柔细腻的女性声音，适合有声读物、情感故事和 ASMR 内容。经过专业录音棚采集，音质清晰纯净，语调自然流畅。',
    previewUrl: '/previews/gentle-female.mp3',
    price: 0,
    currency: 'CNY',
    downloads: 12580,
    rating: 4.8,
    language: '中文',
    tags: ['女声', '温柔', '有声书', 'ASMR'],
  },
  {
    id: 'mv-2',
    name: '磁性男声',
    authorName: '配音达人',
    description: '低沉有磁性的男性声音，适合广告配音、纪录片旁白和品牌宣传。声线浑厚有力，富有感染力。',
    previewUrl: '/previews/magnetic-male.mp3',
    price: 9.9,
    currency: 'CNY',
    downloads: 8340,
    rating: 4.6,
    language: '中文',
    tags: ['男声', '磁性', '广告', '配音'],
  },
  {
    id: 'mv-3',
    name: '活力少女',
    authorName: '二次元声优社',
    description: '元气满满的少女声音，适合动画配音、游戏角色和短视频内容。声音甜美活泼，充满青春活力。',
    previewUrl: '/previews/energetic-girl.mp3',
    price: 0,
    currency: 'CNY',
    downloads: 21300,
    rating: 4.9,
    language: '中文',
    tags: ['女声', '活泼', '二次元', '游戏'],
  },
  {
    id: 'mv-4',
    name: '新闻主播',
    authorName: '专业播音室',
    description: '标准新闻播音腔，字正腔圆，适合新闻播报、企业培训和正式场合的语音合成。',
    previewUrl: '/previews/news-anchor.mp3',
    price: 19.9,
    currency: 'CNY',
    downloads: 5620,
    rating: 4.7,
    language: '中文',
    tags: ['播音', '新闻', '正式', '专业'],
  },
  {
    id: 'mv-5',
    name: 'English Native',
    authorName: 'VoiceCraft Studio',
    description: 'Natural American English voice with clear pronunciation. Perfect for e-learning, podcasts, and international content creation.',
    previewUrl: '/previews/english-native.mp3',
    price: 12.9,
    currency: 'CNY',
    downloads: 3890,
    rating: 4.5,
    language: 'English',
    tags: ['英语', '美式', '教育', '播客'],
  },
  {
    id: 'mv-6',
    name: '童声朗读',
    authorName: '小小声优',
    description: '天真烂漫的儿童声音，适合儿童故事、教育内容和亲子类产品。声音清脆可爱，富有童趣。',
    previewUrl: '/previews/child-voice.mp3',
    price: 0,
    currency: 'CNY',
    downloads: 15700,
    rating: 4.8,
    language: '中文',
    tags: ['童声', '可爱', '教育', '故事'],
  },
  {
    id: 'mv-7',
    name: '古风才子',
    authorName: '国风录音社',
    description: '富有古典韵味的男性声音，适合古风小说、历史纪录片和文化类内容。声线儒雅大气，别具一格。',
    previewUrl: '/previews/classical-male.mp3',
    price: 15.9,
    currency: 'CNY',
    downloads: 6120,
    rating: 4.4,
    language: '中文',
    tags: ['男声', '古风', '文化', '小说'],
  },
  {
    id: 'mv-8',
    name: '日语女声',
    authorName: 'Tokyo Voice Lab',
    description: '标准日语女性声音，发音清晰准确，适合日语学习、动漫配音和日语内容创作。',
    previewUrl: '/previews/japanese-female.mp3',
    price: 0,
    currency: 'CNY',
    downloads: 9450,
    rating: 4.7,
    language: '日本語',
    tags: ['日语', '女声', '动漫', '学习'],
  },
];

type FilterTab = 'popular' | 'latest' | 'free';

export function MarketplaceView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('popular');
  const [selectedVoice, setSelectedVoice] = useState<MarketplaceVoice | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const filteredVoices = mockVoices
    .filter((voice) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          voice.name.toLowerCase().includes(q) ||
          voice.authorName.toLowerCase().includes(q) ||
          voice.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .filter((voice) => {
      if (activeTab === 'free') return voice.price === 0;
      return true;
    })
    .sort((a, b) => {
      if (activeTab === 'popular') return b.downloads - a.downloads;
      if (activeTab === 'latest') return 0; // mock data has no date
      return 0;
    });

  const toggleLike = (id: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const hasHalf = rating - full >= 0.5;
    const stars: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      if (i < full) {
        stars.push(<Star key={i} className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />);
      } else if (i === full && hasHalf) {
        stars.push(<Star key={i} className="h-3.5 w-3.5 text-yellow-400 fill-yellow-200" />);
      } else {
        stars.push(<Star key={i} className="h-3.5 w-3.5 text-gray-300" />);
      }
    }
    return stars;
  };

  const formatDownloads = (count: number) => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'popular', label: '热门' },
    { key: 'latest', label: '最新' },
    { key: 'free', label: '免费' },
  ];

  // Detail modal
  if (selectedVoice) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedVoice(null)}
          className="text-indigo-600 text-sm font-medium"
        >
          ← 返回市场
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium flex items-center space-x-1">
                <Globe2 className="h-3 w-3" />
                <span>{selectedVoice.language}</span>
              </span>
              <span className="text-2xl font-bold">
                {selectedVoice.price === 0 ? '免费' : `¥${selectedVoice.price.toFixed(2)}`}
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-1">{selectedVoice.name}</h2>
            <p className="text-white/70 text-sm">by {selectedVoice.authorName}</p>
          </div>

          {/* Preview button */}
          <div className="p-4 border-b border-gray-100">
            <button className="w-full bg-indigo-50 text-indigo-600 rounded-xl py-3 flex items-center justify-center space-x-2 font-medium active:bg-indigo-100 transition-colors">
              <Play className="h-5 w-5" />
              <span>播放预览</span>
            </button>
          </div>

          {/* Stats */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-around">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {renderStars(selectedVoice.rating)}
              </div>
              <p className="text-xs text-gray-400 mt-1">{selectedVoice.rating} 分</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1 text-gray-600">
                <Download className="h-4 w-4" />
                <span className="font-semibold">{formatDownloads(selectedVoice.downloads)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">下载量</p>
            </div>
          </div>

          {/* Description */}
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">简介</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{selectedVoice.description}</p>
          </div>

          {/* Tags */}
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">标签</h3>
            <div className="flex flex-wrap gap-2">
              {selectedVoice.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium flex items-center space-x-1"
                >
                  <Tag className="h-3 w-3" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Action button */}
          <div className="p-4">
            <button className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-semibold active:bg-indigo-700 transition-colors flex items-center justify-center space-x-2">
              <Download className="h-5 w-5" />
              <span>{selectedVoice.price === 0 ? '免费下载' : `购买 ¥${selectedVoice.price.toFixed(2)}`}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索声音、作者或标签…"
          className="w-full pl-11 pr-10 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
        />
        <Filter className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 active:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Voice grid */}
      {filteredVoices.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">未找到匹配的声音</p>
          <p className="text-gray-400 text-sm mt-1">尝试其他搜索词</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredVoices.map((voice) => (
            <div
              key={voice.id}
              onClick={() => setSelectedVoice(voice)}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
            >
              {/* Card header with gradient */}
              <div className="bg-gradient-to-br from-indigo-400 to-purple-500 p-3 relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike(voice.id);
                  }}
                  className="absolute top-2 right-2"
                >
                  <Heart
                    className={`h-4 w-4 ${
                      likedIds.has(voice.id)
                        ? 'text-red-400 fill-red-400'
                        : 'text-white/60'
                    }`}
                  />
                </button>
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mb-2">
                  <Play className="h-5 w-5 text-white" />
                </div>
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] text-white font-medium flex items-center space-x-1 w-fit">
                  <Globe2 className="h-2.5 w-2.5" />
                  <span>{voice.language}</span>
                </span>
              </div>

              {/* Card body */}
              <div className="p-3">
                <h3 className="font-semibold text-gray-900 text-sm truncate">{voice.name}</h3>
                <p className="text-xs text-gray-400 truncate">{voice.authorName}</p>

                {/* Rating */}
                <div className="flex items-center space-x-1 mt-1.5">
                  {renderStars(voice.rating)}
                  <span className="text-[10px] text-gray-400 ml-1">{voice.rating}</span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-2">
                  <span className="flex items-center space-x-0.5 text-[10px] text-gray-400">
                    <Download className="h-3 w-3" />
                    <span>{formatDownloads(voice.downloads)}</span>
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      voice.price === 0 ? 'text-green-600' : 'text-orange-600'
                    }`}
                  >
                    {voice.price === 0 ? '免费' : `¥${voice.price.toFixed(2)}`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
