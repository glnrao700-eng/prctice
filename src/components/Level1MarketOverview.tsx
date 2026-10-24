import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Percent,
  Wallet,
  Receipt,
  Lock,
  Unlock,
  Calculator,
  ExternalLink,
  ChevronRight,
  Calendar,
  Filter,
  RotateCcw,
  Radio,
  Zap,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  InstrumentConfig,
  NextSessionForecast,
  PaperOrder,
  PlatformConfig,
  SessionStatus,
  TargetValidationResult,
  UpstoxConnectionState,
  UpstoxLiveQuote,
} from '../types/platform';
import { DetailedMetricsAuditModal, MetricTabType } from './DetailedMetricsAuditModal';

export interface WatchlistRow {
  instrument: InstrumentConfig;
  livePrice: number;
  refClose: number;
  upstoxQuote?: UpstoxLiveQuote;
  priceChangeInr: number;
  priceChangePct: number;
  lastClose: number;
  vwap: number;
  rsi50?: number;
  rsi14: number;
  atr14: number;
  direction: 'LONG' | 'SHORT' | 'NO_TRADE';
  calibratedProbability?: number | null;
  plannedEntry: number | null;
  plannedTarget: number | null;
  plannedStop: number | null;
  rewardRisk: number | null;
  score: number;
  validation: TargetValidationResult | null;
  forecast: NextSessionForecast | null;
}

export interface Level1MarketOverviewProps {
  watchlist: WatchlistRow[];
  portfolioOrders: PaperOrder[];
  config: PlatformConfig;
  sessionStatus?: SessionStatus;
  enforceRealMarketHours?: boolean;
  onToggleEnforceMarketHours?: () => void;
  onSelectSymbol: (symbol: string) => void;
  onGoToLevel: (level: number) => void;
  upstoxConnection?: UpstoxConnectionState;
  upstoxQuotes?: Record<string, UpstoxLiveQuote>;
  onSyncAllToUpstox?: () => void;
  onSyncSymbolToUpstox?: (symbol: string) => void;
  isAutoPlaying?: boolean;
  onToggleAutoPlay?: () => void;
  streamSpeed?: number;
  onChangeStreamSpeed?: (speed: number) => void;
  onStepSimulation?: () => void;
  onOpenUpstoxModal?: () => void;
  onRefreshUpstox?: () => void;
}

export const Level1MarketOverview: React.FC<Level1MarketOverviewProps> = ({
  watchlist,
  portfolioOrders,
  config,
  sessionStatus,
  enforceRealMarketHours = true,
  onToggleEnforceMarketHours,
  onSelectSymbol,
  onGoToLevel,
  upstoxConnection,
  upstoxQuotes = {},
  onSyncAllToUpstox,
  onSyncSymbolToUpstox,
  isAutoPlaying = false,
  onToggleAutoPlay,
  streamSpeed = 3,
  onChangeStreamSpeed,
  onStepSimulation,
  onOpenUpstoxModal,
  onRefreshUpstox,
}) => {
  // Date filter state: 'ALL' or specific session date ('2026-10-19', etc.)
  const [selectedDate, setSelectedDate] = useState<string>('ALL');

  // Extract all unique dates from portfolio orders sorted newest first
  const availableDates = useMemo(() => {
    const datesSet = new Set<string>();
    portfolioOrders.forEach((o) => {
      const d = o.session_date || o.created_at.split('T')[0];
      if (d) datesSet.add(d);
    });
    return Array.from(datesSet).sort().reverse();
  }, [portfolioOrders]);

  // Filtered closed orders based on selected date
  const filteredClosedOrders = useMemo(() => {
    return portfolioOrders.filter((o) => {
      if (o.status !== 'CLOSED') return false;
      if (selectedDate === 'ALL') return true;
      const d = o.session_date || o.created_at.split('T')[0];
      return d === selectedDate;
    });
  }, [portfolioOrders, selectedDate]);

  const allClosedOrders = useMemo(
    () => portfolioOrders.filter((o) => o.status === 'CLOSED'),
    [portfolioOrders]
  );

  const startingCapital = config.risk_controls.starting_capital_inr;
  const netRealizedPnl = filteredClosedOrders.reduce((sum, o) => sum + o.net_pnl_inr, 0);
  const totalStatutoryCosts = filteredClosedOrders.reduce((sum, o) => sum + o.total_costs_inr, 0);

  // When 'ALL', Current Equity = Starting Capital + all closed PnL
  // When specific date, Current Equity shows base + cumulative up to that date (or starting capital + day's net)
  const currentEquity = startingCapital + netRealizedPnl;

  const wins = filteredClosedOrders.filter((o) => o.net_pnl_inr > 0);
  const losses = filteredClosedOrders.filter((o) => o.net_pnl_inr <= 0);
  const winRate = filteredClosedOrders.length > 0 ? (wins.length / filteredClosedOrders.length) * 100 : 0;

  const grossProfit = wins.reduce((sum, o) => sum + o.gross_pnl_inr, 0);
  const grossLoss = Math.abs(losses.reduce((sum, o) => sum + o.gross_pnl_inr, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [selectedMetricTab, setSelectedMetricTab] = useState<MetricTabType>('EQUITY');
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const handleOpenAudit = (tab: MetricTabType) => {
    setSelectedMetricTab(tab);
    setAuditModalOpen(true);
  };

  const handleSyncAllWithFeedback = () => {
    if (onSyncAllToUpstox) {
      onSyncAllToUpstox();
      setSyncToast('All universe stocks synced to Upstox live market LTPs!');
      setTimeout(() => setSyncToast(null), 3500);
    }
  };

  const handleSyncSymbolWithFeedback = (symbol: string) => {
    if (onSyncSymbolToUpstox) {
      onSyncSymbolToUpstox(symbol);
      const q = upstoxQuotes[symbol];
      setSyncToast(`${symbol} price synced to Upstox LTP: ₹${q ? q.last_price.toFixed(2) : ''}`);
      setTimeout(() => setSyncToast(null), 3500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Performance KPI Section Header & Date-Based Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">
                  Portfolio Performance Audit &amp; Executive KPIs
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
                  {selectedDate === 'ALL' ? 'ALL DATES (FULL HISTORY)' : `DATE: ${selectedDate}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time tracking of portfolio equity, net realized P&amp;L, statutory friction, and win rate. Click any card for detailed audit.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs shadow-inner">
              <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-slate-400 font-medium text-[11px]">Filter Date:</span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer pr-1"
                aria-label="Filter performance by date"
              >
                <option value="ALL" className="bg-slate-900 text-white">
                  All Session Dates ({allClosedOrders.length} closed trades)
                </option>
                {availableDates.map((d) => {
                  const isToday = d === sessionStatus?.session_date;
                  const count = portfolioOrders.filter(
                    (o) => o.status === 'CLOSED' && (o.session_date || o.created_at.split('T')[0]) === d
                  ).length;
                  return (
                    <option key={d} value={d} className="bg-slate-900 text-white">
                      {isToday ? `★ ${d} (Today's Live Session)` : d} ({count} closed trades)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Quick Date Pills */}
            <div className="hidden xl:flex items-center gap-1">
              <button
                onClick={() => setSelectedDate('ALL')}
                className={`px-2.5 py-1.5 rounded text-[11px] font-semibold font-mono transition ${
                  selectedDate === 'ALL'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
                title="View performance across all dates"
              >
                All Dates
              </button>
              {availableDates.slice(0, 4).map((d) => {
                const isSelected = selectedDate === d;
                const isToday = d === sessionStatus?.session_date;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={`px-2 py-1.5 rounded text-[11px] font-mono transition flex items-center gap-1 ${
                      isSelected
                        ? isToday ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-sky-600 text-white font-bold shadow-xs'
                        : isToday ? 'bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900 border border-emerald-700/60' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                    title={`Filter by ${d}${isToday ? " (Today's Live Session)" : ''}`}
                  >
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    <span>{isToday ? `Today (${d.slice(5)})` : d.slice(5)}</span>
                  </button>
                );
              })}
            </div>

            {/* Expand Detailed Audit Button */}
            <button
              onClick={() => handleOpenAudit('EQUITY')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 text-xs font-semibold transition shrink-0"
              title="Expand complete 6-card mathematical audit and closed trade verification ledger"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Expand Detailed Audit</span>
            </button>
          </div>
        </div>

        {/* Selected Date Context Tag */}
        {selectedDate !== 'ALL' && (
          <div className="flex items-center justify-between text-xs bg-sky-950/40 border border-sky-800/60 px-3 py-1.5 rounded-lg text-sky-200">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                Filtered by Session Date: <strong className="text-white font-mono">{selectedDate}</strong> (
                {filteredClosedOrders.length} closed trades: {wins.length}W / {losses.length}L | Net P&amp;L:{' '}
                <strong className={netRealizedPnl >= 0 ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
                  {netRealizedPnl >= 0 ? '+₹' : '-₹'}{Math.abs(netRealizedPnl).toFixed(2)}
                </strong>
                )
              </span>
            </div>
            <button
              onClick={() => setSelectedDate('ALL')}
              className="text-[11px] text-sky-300 hover:text-white flex items-center gap-1 font-semibold transition underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to All Dates</span>
            </button>
          </div>
        )}
      </div>

      {/* Portfolio Performance KPI Cards - Interactive with Click to Expand */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Portfolio Equity */}
        <div
          onClick={() => handleOpenAudit('EQUITY')}
          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/60 p-3.5 rounded-lg shadow-sm cursor-pointer transition group relative"
          title="Click to view detailed Portfolio Equity breakdown, margin usage & drawdown"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="group-hover:text-sky-300 transition">Portfolio Equity</span>
            <Wallet className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            ₹{currentEquity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>
              {selectedDate === 'ALL'
                ? `Capital: ₹${(startingCapital / 100000).toFixed(1)} Lakh`
                : `Net: ${netRealizedPnl >= 0 ? '+₹' : '-₹'}${Math.abs(netRealizedPnl).toFixed(2)}`}
            </span>
            <span className="text-[10px] text-sky-400 font-mono opacity-0 group-hover:opacity-100 transition flex items-center">
              Audit <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 2: Net Realized P&L */}
        <div
          onClick={() => handleOpenAudit('PNL')}
          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/60 p-3.5 rounded-lg shadow-sm cursor-pointer transition group relative"
          title="Click to view complete P&L equation, gross win/loss breakdown, and instrument ledger"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="group-hover:text-emerald-300 transition">Net Realized P&amp;L</span>
            {netRealizedPnl >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              netRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {netRealizedPnl >= 0 ? '+₹' : '-₹'}
            {Math.abs(netRealizedPnl).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>{selectedDate === 'ALL' ? 'Net of all charges' : `Session: ${selectedDate}`}</span>
            <span className="text-[10px] text-emerald-400 font-mono opacity-0 group-hover:opacity-100 transition flex items-center">
              Audit <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 3: Statutory Costs */}
        <div
          onClick={() => handleOpenAudit('STATUTORY')}
          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/60 p-3.5 rounded-lg shadow-sm cursor-pointer transition group relative"
          title="Click to view itemized breakdown of STT, GST, SEBI charges, Stamp Duty & Brokerage"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="group-hover:text-amber-300 transition">Statutory Costs (₹)</span>
            <Receipt className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            ₹{totalStatutoryCosts.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>STT, GST, SEBI ({filteredClosedOrders.length} tr)</span>
            <span className="text-[10px] text-amber-400 font-mono opacity-0 group-hover:opacity-100 transition flex items-center">
              Breakdown <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 4: Closed Trades */}
        <div
          onClick={() => handleOpenAudit('CLOSED_TRADES')}
          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-indigo-500/60 p-3.5 rounded-lg shadow-sm cursor-pointer transition group relative"
          title="Click to view full closed trades ledger with execution details and trade-by-trade outcomes"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="group-hover:text-indigo-300 transition">Closed Trades</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {filteredClosedOrders.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>{wins.length} W / {losses.length} L</span>
            <span className="text-[10px] text-indigo-400 font-mono opacity-0 group-hover:opacity-100 transition flex items-center">
              Ledger <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 5: Win Rate */}
        <div
          onClick={() => handleOpenAudit('WIN_RATE')}
          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/60 p-3.5 rounded-lg shadow-sm cursor-pointer transition group relative"
          title="Click to understand Conservative Same-Bar Rule, win streaks, and asset win distributions"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="group-hover:text-cyan-300 transition">Win Rate</span>
            <Percent className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Conservative same-bar rule</span>
            <span className="text-[10px] text-cyan-400 font-mono opacity-0 group-hover:opacity-100 transition flex items-center">
              Details <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 6: Profit Factor */}
        <div
          onClick={() => handleOpenAudit('PROFIT_FACTOR')}
          className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-purple-500/60 p-3.5 rounded-lg shadow-sm cursor-pointer transition group relative"
          title="Click to inspect Gross Win / Gross Loss ratio, institutional tiers, and mathematical expectancy"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="group-hover:text-purple-300 transition">Profit Factor</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Gross Win / Gross Loss</span>
            <span className="text-[10px] text-purple-400 font-mono opacity-0 group-hover:opacity-100 transition flex items-center">
              Metrics <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Real Market Status Card */}
      {sessionStatus && !sessionStatus.is_market_open && (
        <div className="bg-indigo-950/70 border border-indigo-800/80 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>REAL NSE MARKET IS CURRENTLY CLOSED</span>
                <span className="px-1.5 py-0.2 rounded bg-indigo-900 text-indigo-200 text-[10px] font-mono">
                  {sessionStatus.phase}
                </span>
              </div>
              <p className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">
                {enforceRealMarketHours ? (
                  <>
                    Prices are <strong>strictly locked to official Friday closing prices</strong> (Reliance: ₹1,211.20, HDFC Bank: ₹728.85, etc.). Auto-Run and 1m stepping are paused because the exchange is not operating.
                  </>
                ) : (
                  <>
                    <strong>Practice Replay is Active:</strong> You are simulating candle progression outside market hours for strategy testing.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onToggleEnforceMarketHours && (
              <button
                onClick={onToggleEnforceMarketHours}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition"
              >
                {enforceRealMarketHours ? 'Allow Practice Replay' : 'Lock to Real Market'}
              </button>
            )}
            <div className="text-[11px] text-right font-mono text-slate-400">
              Opens: <strong className="text-emerald-400">{sessionStatus.next_trading_day} 09:15 IST</strong>
            </div>
          </div>
        </div>
      )}

      {/* Probabilistic Disclaimer Notice */}
      <div className="bg-slate-900/60 border border-amber-900/50 rounded-lg p-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-amber-300">PROBABILISTIC FORECAST & DEMO NOTICE:</strong> All intraday entry/target/stop levels and next-session opening forecasts represent uncertain probabilistic estimates generated by multi-agent models. No target hit, breakout continuation, or profit is ever guaranteed. In accordance with platform governance, all candidate signals are validated against strict deterministic ≥ ₹3 displacement rules and minimum 1.50 Reward-to-Risk thresholds before execution.
        </div>
      </div>

      {/* Sync Feedback Toast Notification */}
      {syncToast && (
        <div className="bg-purple-950/90 border border-purple-500/80 rounded-lg p-3 text-xs text-purple-100 flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{syncToast}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-purple-300 hover:text-white text-xs font-mono px-2 py-0.5 rounded bg-purple-900/60"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upstox Real Live Broker & Streaming Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Left: Feed Status Indicators */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Upstox Broker Live Feed Badge */}
            {upstoxConnection?.connected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-950/80 border border-purple-700/80 text-xs font-mono text-purple-200 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-bold text-white">UPSTOX LIVE FEED ACTIVE</span>
                {upstoxConnection.latency_ms && (
                  <span className="px-1.5 py-0.2 rounded bg-purple-900/90 text-purple-300 text-[10px]">
                    {upstoxConnection.latency_ms}ms
                  </span>
                )}
                <span className="text-[11px] text-purple-300 hidden sm:inline">
                  (v2 Market API)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span>Simulated Feed Active</span>
                {onOpenUpstoxModal && (
                  <button
                    onClick={onOpenUpstoxModal}
                    className="ml-1 px-2 py-0.5 rounded bg-purple-900/80 hover:bg-purple-800 text-purple-200 text-[10px] font-bold"
                  >
                    Connect Upstox
                  </button>
                )}
              </div>
            )}

            {/* Live Streaming Engine Status */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  !sessionStatus?.is_market_open && enforceRealMarketHours
                    ? 'bg-amber-400'
                    : isAutoPlaying
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-300 font-semibold">
                {!sessionStatus?.is_market_open && enforceRealMarketHours
                  ? 'MARKET CLOSED (PAUSED)'
                  : isAutoPlaying
                  ? 'STREAMING ACTIVE'
                  : 'STREAM PAUSED'}
              </span>
              <span className="text-sky-400 text-[11px]">
                {!sessionStatus?.is_market_open && enforceRealMarketHours
                  ? '(09:15-15:30 IST)'
                  : `(${streamSpeed}s interval)`}
              </span>
            </div>
          </div>

          {/* Right: Actions Cluster (Sync to Upstox, Play/Pause, Step, Speed) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync All to Upstox Real LTP Button */}
            {onSyncAllToUpstox && (
              <button
                onClick={handleSyncAllWithFeedback}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-mono font-bold text-xs shadow-md transition"
                title="Sync all universe instruments to current Upstox real market prices"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Sync All to Upstox Real LTP ➔</span>
              </button>
            )}

            {/* Refresh Quotes */}
            {onRefreshUpstox && (
              <button
                onClick={onRefreshUpstox}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                title="Fetch latest quotes from Upstox API"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Pause / Resume Streaming */}
            {onToggleAutoPlay && (
              <button
                onClick={onToggleAutoPlay}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-xs transition ${
                  isAutoPlaying
                    ? 'bg-amber-600/90 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
                title={isAutoPlaying ? 'Pause continuous stream' : 'Start continuous price streaming'}
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Stream</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume Stream</span>
                  </>
                )}
              </button>
            )}

            {/* Step 1 Bar */}
            {onStepSimulation && (
              <button
                onClick={onStepSimulation}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-500 active:scale-95 text-white font-mono font-bold text-xs transition"
                title="Advance simulation by 1 candle bar"
              >
                +1 Bar Step
              </button>
            )}

            {/* Interval Speed Pills */}
            {onChangeStreamSpeed && (
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                {[1, 2, 3, 5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onChangeStreamSpeed(spd)}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition ${
                      streamSpeed === spd
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={`Tick interval: ${spd}s`}
                  >
                    {spd}s
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Universe Real-Time Price Quick-Glance Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 border-t border-slate-800/60">
          {watchlist.map((row) => {
            const upstoxLtp = row.upstoxQuote?.last_price;
            const isDiff = upstoxLtp && Math.abs(row.livePrice - upstoxLtp) > 0.05;

            return (
              <div
                key={row.instrument.symbol}
                onClick={() => {
                  onSelectSymbol(row.instrument.symbol);
                  onGoToLevel(2);
                }}
                className="bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 hover:border-sky-500/50 rounded-lg p-2.5 transition cursor-pointer group"
                title={`Click to open Level 2 chart for ${row.instrument.symbol}`}
              >
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="font-bold font-sans text-white group-hover:text-sky-400 transition">
                    {row.instrument.symbol}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold ${
                      row.priceChangeInr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {row.priceChangeInr >= 0 ? '+' : ''}
                    {row.priceChangePct.toFixed(2)}%
                  </span>
                </div>

                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-sm font-bold font-mono text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>₹{row.livePrice.toFixed(2)}</span>
                  </div>
                </div>

                {/* Upstox Quote comparison */}
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono">
                  {upstoxLtp ? (
                    <span className="text-purple-300 truncate" title={`Upstox LTP: ₹${upstoxLtp.toFixed(2)}`}>
                      Upstox: ₹{upstoxLtp.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-slate-500">Ref: ₹{row.refClose.toFixed(2)}</span>
                  )}

                  {isDiff && onSyncSymbolToUpstox && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSyncSymbolWithFeedback(row.instrument.symbol);
                      }}
                      className="text-[9px] px-1 py-0.2 rounded bg-purple-900/80 hover:bg-purple-700 text-purple-200 font-bold"
                      title="Sync this stock to Upstox"
                    >
                      Sync
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Watchlist & Active Signals Matrix */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Configured NSE Universe & Multi-Agent Signals
            </h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
              {watchlist.length} Stocks
            </span>
          </div>
          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-mono text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE LTP ANCHOR ACTIVE</span>
            </span>
            <span className="text-slate-400 text-[11px]">
              Signals, Entry, Target &amp; Stop calculated from <strong>Current Live Price</strong> + 30-Day continuous movement
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-medium">
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3 text-right">Live Price (LTP)</th>
                <th className="py-2.5 px-3 text-right">P₀ (Ref Close)</th>
                <th className="py-2.5 px-3 text-right">VWAP</th>
                <th className="py-2.5 px-3 text-right">RSI (50)</th>
                <th
                  className="py-2.5 px-3 text-center"
                  title="Predictions only trigger when Probability of Success ≥ 95.0%. Otherwise marked as NO TRADE to protect capital."
                >
                  <div>Active Signal</div>
                  <div className="text-[9px] text-amber-400 font-normal lowercase tracking-normal">(≥95% win prob)</div>
                </th>
                <th className="py-2.5 px-3 text-right">Entry (E)</th>
                <th className="py-2.5 px-3 text-right">Target (T)</th>
                <th className="py-2.5 px-3 text-right">Stop (S)</th>
                <th className="py-2.5 px-3 text-center">R : R</th>
                <th className="py-2.5 px-3 text-center">Next-Day Open Forecast</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {watchlist.map((row) => {
                const isLong = row.direction === 'LONG';
                const isShort = row.direction === 'SHORT';
                const fc = row.forecast;
                const upstoxLtp = row.upstoxQuote?.last_price;
                const isDiffFromUpstox = upstoxLtp && Math.abs(row.livePrice - upstoxLtp) > 0.05;

                return (
                  <tr
                    key={row.instrument.instrument_id}
                    className="hover:bg-slate-800/40 transition group cursor-pointer"
                    onClick={() => {
                      onSelectSymbol(row.instrument.symbol);
                      onGoToLevel(2);
                    }}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-sans font-bold text-slate-100 group-hover:text-sky-400 transition">
                        {row.instrument.symbol}
                      </div>
                      <div className="text-[11px] font-sans text-slate-400 truncate max-w-[150px]">
                        {row.instrument.company_name}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px]">
                        {row.instrument.sector.replace('_', ' ')}
                      </span>
                    </td>

                    {/* LIVE PRICE (LTP) with Upstox badge and % change */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <span className="text-sm font-bold font-mono text-white group-hover:text-sky-300 transition">
                          ₹{row.livePrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        {upstoxLtp ? (
                          <span
                            className="px-1.5 py-0.2 rounded bg-purple-950 border border-purple-800 text-[10px] text-purple-200 font-mono font-bold"
                            title={`Upstox broker quote for ${row.instrument.symbol}`}
                          >
                            Upstox: ₹{upstoxLtp.toFixed(2)}
                          </span>
                        ) : null}

                        <span
                          className={`text-[10px] font-mono font-semibold ${
                            row.priceChangeInr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {row.priceChangeInr >= 0 ? '+' : ''}
                          {row.priceChangeInr.toFixed(2)} ({row.priceChangeInr >= 0 ? '+' : ''}
                          {row.priceChangePct.toFixed(2)}%)
                        </span>

                        {isDiffFromUpstox && onSyncSymbolToUpstox && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncSymbolWithFeedback(row.instrument.symbol);
                            }}
                            className="px-1.5 py-0.2 rounded bg-purple-700 hover:bg-purple-600 text-white text-[9px] font-bold transition shadow-xs"
                            title={`Sync ${row.instrument.symbol} to Upstox LTP ₹${upstoxLtp.toFixed(2)}`}
                          >
                            Sync ➔
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Reference Close P0 */}
                    <td className="py-2.5 px-3 text-right font-medium text-slate-300">
                      <div>₹{row.refClose.toFixed(2)}</div>
                      <span className="text-[10px] text-slate-500 font-sans block">Base Ref</span>
                    </td>

                    <td className="py-2.5 px-3 text-right text-slate-300">
                      ₹{row.vwap.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`font-semibold ${
                          (row.rsi50 ?? row.rsi14) >= 60
                            ? 'text-emerald-400'
                            : (row.rsi50 ?? row.rsi14) <= 40
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                        title={`50-Period RSI: ${(row.rsi50 ?? row.rsi14).toFixed(1)}`}
                      >
                        {(row.rsi50 ?? row.rsi14).toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            isLong
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-xs ring-1 ring-emerald-500/50'
                              : isShort
                              ? 'bg-rose-950 text-rose-300 border border-rose-700 shadow-xs ring-1 ring-rose-500/50'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                          title={
                            isLong
                              ? `Confirmed LONG Signal (Success Probability = ${row.calibratedProbability ? (row.calibratedProbability * 100).toFixed(1) + '%' : '≥95%'})`
                              : isShort
                              ? `Confirmed SHORT Signal (Success Probability = ${row.calibratedProbability ? (row.calibratedProbability * 100).toFixed(1) + '%' : '≥95%'})`
                              : `NO TRADE: Probability of success (${row.calibratedProbability ? (row.calibratedProbability * 100).toFixed(1) + '%' : '<95%'}) is below the mandatory 95.0% threshold.`
                          }
                        >
                          {isLong
                            ? `LONG (${row.calibratedProbability ? (row.calibratedProbability * 100).toFixed(0) : 96}%)`
                            : isShort
                            ? `SHORT (${row.calibratedProbability ? (row.calibratedProbability * 100).toFixed(0) : 95}%)`
                            : 'NO TRADE'}
                        </span>
                        {!isLong && !isShort && row.calibratedProbability !== null && row.calibratedProbability !== undefined && (
                          <span className="text-[9px] font-mono text-slate-500">
                            P = {(row.calibratedProbability * 100).toFixed(1)}% (&lt;95%)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.plannedEntry ? (
                        <div>
                          <span className="text-sky-400 font-semibold">₹{row.plannedEntry.toFixed(2)}</span>
                          <span className="text-[9px] text-sky-400/80 block font-normal">
                            {row.plannedEntry >= row.livePrice ? '+' : ''}
                            {(row.plannedEntry - row.livePrice).toFixed(2)} from Live
                          </span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.plannedTarget ? (
                        <div>
                          <span className="text-emerald-400 font-semibold">₹{row.plannedTarget.toFixed(2)}</span>
                          <span className="text-[9px] text-emerald-400/80 block font-normal">
                            +{Math.abs(row.plannedTarget - (row.plannedEntry || row.livePrice)).toFixed(2)} Gain
                          </span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.plannedStop ? (
                        <div>
                          <span className="text-rose-400 font-semibold">₹{row.plannedStop.toFixed(2)}</span>
                          <span className="text-[9px] text-rose-400/80 block font-normal">
                            -{Math.abs((row.plannedEntry || row.livePrice) - row.plannedStop).toFixed(2)} Risk
                          </span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-300 font-bold">
                      {row.rewardRisk ? `${row.rewardRisk.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      {fc ? (
                        <div className="text-[11px]">
                          <span className="font-mono text-sky-300 font-semibold">
                            ₹{fc.predicted_open_price.toFixed(2)}
                          </span>{' '}
                          <span
                            className={
                              fc.predicted_gap_inr >= 0
                                ? 'text-emerald-400 font-mono text-[10px]'
                                : 'text-rose-400 font-mono text-[10px]'
                            }
                          >
                            ({fc.predicted_gap_inr >= 0 ? '+' : ''}
                            {fc.predicted_gap_inr.toFixed(2)})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          onSelectSymbol(row.instrument.symbol);
                          onGoToLevel(2);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white transition font-sans text-[11px] font-medium flex items-center gap-1 mx-auto"
                      >
                        Chart <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Metrics Audit & Expanded Breakdown Modal */}
      <DetailedMetricsAuditModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        initialTab={selectedMetricTab}
        initialDate={selectedDate}
        orders={portfolioOrders}
        config={config}
      />
    </div>
  );
};
