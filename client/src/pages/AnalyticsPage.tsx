import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, Eye, TrendingUp, Users, Heart, MessageSquare,
  Bookmark, Share2, Clock, ShieldCheck, HelpCircle, ArrowUpRight,
  Sparkles, FileText, Globe, Lock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '@/services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import type { AnalyticsDashboardResponse } from '@/types';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [data, setData] = useState<AnalyticsDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeHoverPoint, setActiveHoverPoint] = useState<number | null>(null);

  const fetchAnalytics = async (selectedPeriod: string) => {
    try {
      setIsLoading(true);
      const res = await api.get(`/analytics/dashboard?period=${selectedPeriod}`);
      setData(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(period);
  }, [period]);

  const trends = data?.trends || [];

  // Chart coordinates calculation
  const chartMetrics = useMemo(() => {
    if (!trends.length) return null;

    const maxViews = Math.max(...trends.map(t => t.views), 5);
    const maxInteractions = Math.max(...trends.map(t => t.interactions), 5);
    const yMax = Math.max(maxViews, maxInteractions);

    const width = 800;
    const height = 240;
    const padding = 20;

    const pointsViews = trends.map((t, i) => {
      const x = padding + (i / (trends.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - (t.views / yMax) * (height - 2 * padding);
      return { x, y, ...t };
    });

    const pointsInteractions = trends.map((t, i) => {
      const x = padding + (i / (trends.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - (t.interactions / yMax) * (height - 2 * padding);
      return { x, y, ...t };
    });

    const viewsPath = pointsViews.reduce(
      (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
      ''
    );

    const interactionsPath = pointsInteractions.reduce(
      (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
      ''
    );

    return {
      pointsViews,
      pointsInteractions,
      viewsPath,
      interactionsPath,
      yMax,
      width,
      height,
    };
  }, [trends]);

  if (isLoading && !data) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#FF4F9A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const summary = data?.summary;
  const hasPosts = (summary?.posts.total || 0) > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-[#FF4F9A]/15 text-[#FF4F9A]">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold font-display text-white">Creator Analytics</h1>
          </div>
          <p className="text-xs text-[#B8B8C2]">
            Real, privacy-safe performance measurements and engagement analytics for your account.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="inline-flex p-1 rounded-2xl bg-[#1C1C22] border border-[#303039] self-start md:self-auto">
          {(
            [
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: '90d', label: '90 Days' },
              { key: 'all', label: 'All Time' },
            ] as const
          ).map(tab => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                period === tab.key
                  ? 'bg-[#FF4F9A] text-white shadow-md'
                  : 'text-[#B8B8C2] hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1: Views */}
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#B8B8C2]">Profile & Post Views</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Eye className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {((summary?.profileViews.period || 0) + (summary?.views.period || 0)).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#B8B8C2] flex items-center justify-between">
            <span>Profile: {summary?.profileViews.period || 0}</span>
            <span>Posts: {summary?.views.period || 0}</span>
          </div>
        </div>

        {/* Card 2: Engagement Rate */}
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-[#B8B8C2]">Engagement Rate</span>
              <span title={summary?.engagementRate.formula || 'Calculated as total interactions divided by total views.'}>
                <HelpCircle className="w-3.5 h-3.5 text-[#B8B8C2] hover:text-white cursor-help" />
              </span>
            </div>
            <span className="p-2 rounded-xl bg-pink-500/10 text-[#FF4F9A]">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {summary?.engagementRate.rate || 0}%
          </div>
          <div className="text-[11px] text-[#B8B8C2] truncate" title={summary?.engagementRate.formula}>
            Formula: Interactions ÷ Views × 100
          </div>
        </div>

        {/* Card 3: Interactions */}
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#B8B8C2]">Interactions</span>
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Heart className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {summary?.interactions.period.total.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-[#B8B8C2] flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Heart className="w-2.5 h-2.5 text-[#FF4F9A]" /> {summary?.interactions.period.likes || 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5 text-blue-400" /> {summary?.interactions.period.comments || 0}
            </span>
            <span className="flex items-center gap-1">
              <Bookmark className="w-2.5 h-2.5 text-amber-400" /> {summary?.interactions.period.saves || 0}
            </span>
          </div>
        </div>

        {/* Card 4: Followers */}
        <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#B8B8C2]">Total Followers</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {summary?.followers.total.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-[#B8B8C2]">
            +{summary?.followers.gained || 0} gained in this period
          </div>
        </div>
      </div>

      {/* Trend Chart Section */}
      <div className="bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-base font-bold text-white">Activity & Performance Trends</h3>
            <p className="text-xs text-[#B8B8C2]">Daily timeline of content views and community interactions</p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#FF4F9A]" />
              <span className="text-[#B8B8C2]">Views</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-400" />
              <span className="text-[#B8B8C2]">Interactions</span>
            </div>
          </div>
        </div>

        {chartMetrics && chartMetrics.pointsViews.length > 1 ? (
          <div className="w-full relative overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`}
              className="w-full h-56 overflow-visible"
            >
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = chartMetrics.height - 20 - ratio * (chartMetrics.height - 40);
                return (
                  <line
                    key={idx}
                    x1="20"
                    y1={y}
                    x2={chartMetrics.width - 20}
                    y2={y}
                    stroke="#303039"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Views Path */}
              <path
                d={chartMetrics.viewsPath}
                fill="none"
                stroke="#FF4F9A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactions Path */}
              <path
                d={chartMetrics.interactionsPath}
                fill="none"
                stroke="#60A5FA"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Points */}
              {chartMetrics.pointsViews.map((p, idx) => (
                <circle
                  key={`v-${idx}`}
                  cx={p.x}
                  cy={p.y}
                  r={activeHoverPoint === idx ? 5 : 3}
                  className="fill-[#FF4F9A] cursor-pointer transition-all hover:scale-150"
                  onMouseEnter={() => setActiveHoverPoint(idx)}
                  onMouseLeave={() => setActiveHoverPoint(null)}
                />
              ))}

              {chartMetrics.pointsInteractions.map((p, idx) => (
                <circle
                  key={`i-${idx}`}
                  cx={p.x}
                  cy={p.y}
                  r={activeHoverPoint === idx ? 5 : 3}
                  className="fill-[#60A5FA] cursor-pointer transition-all hover:scale-150"
                  onMouseEnter={() => setActiveHoverPoint(idx)}
                  onMouseLeave={() => setActiveHoverPoint(null)}
                />
              ))}
            </svg>

            {/* Hover Tooltip */}
            {activeHoverPoint !== null && trends[activeHoverPoint] && (
              <div className="mt-3 p-3 rounded-2xl bg-[#26262E] border border-[#303039] text-xs flex items-center justify-between text-white animate-fade-in">
                <span className="font-semibold text-[#B8B8C2]">
                  {new Date(trends[activeHoverPoint].date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-[#FF4F9A] font-bold">
                    {trends[activeHoverPoint].views} Views
                  </span>
                  <span className="text-blue-400 font-bold">
                    {trends[activeHoverPoint].interactions} Interactions
                  </span>
                  <span className="text-emerald-400 font-bold">
                    +{trends[activeHoverPoint].followersGained} Followers
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-44 flex flex-col items-center justify-center text-center text-[#B8B8C2] border border-dashed border-[#303039] rounded-2xl p-6">
            <Sparkles className="w-8 h-8 text-[#FF4F9A] mb-2 opacity-60" />
            <p className="text-sm font-semibold text-white">Collecting initial activity</p>
            <p className="text-xs max-w-sm mt-1">
              As viewers explore your posts and engage with your profile, real trend charts will generate here.
            </p>
          </div>
        )}
      </div>

      {/* Top Performing Posts & Session Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Top Posts (8 cols) */}
        <div className="lg:col-span-8 bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-white">Top Performing Creative Posts</h3>
              <p className="text-xs text-[#B8B8C2]">Ranked by total views and community interaction</p>
            </div>
            <Link
              to="/create"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF4F9A] hover:underline"
            >
              Create New <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data?.topPosts && data.topPosts.length > 0 ? (
            <div className="space-y-3">
              {data.topPosts.map(post => (
                <div
                  key={post.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-[#141418] border border-[#303039] hover:border-[#FF4F9A]/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#26262E] overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {post.docType === 'PDF' ? (
                        <FileText className="w-6 h-6 text-red-400" />
                      ) : post.docType === 'DOC' || post.docType === 'DOCX' ? (
                        <FileText className="w-6 h-6 text-blue-400" />
                      ) : (
                        <img
                          src={post.imageUrl}
                          alt={post.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/post/${post.id}`}
                        className="text-xs font-semibold text-white hover:text-[#FF4F9A] truncate block max-w-xs sm:max-w-md"
                      >
                        {post.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#B8B8C2]">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                        {post.audience === 'ONLY_ME' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-charcoal-700 text-charcoal-300 font-semibold flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> Private
                          </span>
                        ) : post.audience === 'FOLLOWERS' ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 font-semibold flex items-center gap-0.5">
                            <Users className="w-2.5 h-2.5" /> Followers
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 font-semibold flex items-center gap-0.5">
                            <Globe className="w-2.5 h-2.5" /> Public
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-semibold flex-shrink-0">
                    <div className="text-right">
                      <div className="text-white">{post.views} views</div>
                      <div className="text-[10px] text-[#B8B8C2]">
                        {post.likes} ❤️ • {post.comments} 💬
                      </div>
                    </div>
                    <div className="hidden sm:block text-right w-16">
                      <div className="text-[#FF4F9A] font-bold">{post.engagementRate}%</div>
                      <div className="text-[9px] text-[#B8B8C2]">Eng. Rate</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-xs text-[#B8B8C2]">No published posts to display yet.</p>
              <Link
                to="/create"
                className="mt-3 inline-block px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF4F9A] text-white"
              >
                Publish Your First Post
              </Link>
            </div>
          )}
        </div>

        {/* Website Usage & Session Metrics (4 cols) */}
        <div className="lg:col-span-4 bg-[#1C1C22] border border-[#303039] rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-base font-bold text-white">Website & Session Usage</h3>
            </div>
            <p className="text-xs text-[#B8B8C2] mb-6">
              Responsible, client-authenticated measurements of your active presence on MUSELY.
            </p>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#141418] border border-[#303039]">
                <div className="text-xs text-[#B8B8C2] mb-1">Active Platform Time</div>
                <div className="text-2xl font-bold text-white">
                  {summary?.sessions.totalActiveMinutes || 0} mins
                </div>
                <p className="text-[10px] text-[#B8B8C2] mt-1">
                  Measured strictly while your browser tab is active.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#141418] border border-[#303039]">
                <div className="text-xs text-[#B8B8C2] mb-1">Total Recorded Sessions</div>
                <div className="text-2xl font-bold text-white">
                  {summary?.sessions.totalSessions || 0}
                </div>
                <p className="text-[10px] text-[#B8B8C2] mt-1">
                  Average duration: {summary?.sessions.avgSessionMinutes || 0} mins / session
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3.5 rounded-2xl bg-[#26262E]/70 border border-[#303039] flex items-start gap-2.5 text-[11px] text-[#B8B8C2]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">Privacy Transparency</strong>
              Analytics are aggregated and only visible to you. Third-party trackers and invasive surveillance cookies are never used.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
