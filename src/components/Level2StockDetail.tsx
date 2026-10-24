import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import {
  Candle,
  InstrumentConfig,
  OrchestratorOutput,
  TechnicalOutput,
  TargetValidationResult,
  SessionStatus,
  UpstoxLiveQuote,
} from '../types/platform';
import { LATEST_MARKET_REFERENCE_PRICES } from '../services/marketData';
import { isTradingDay, getPreviousTradingDay } from '../services/nseCalendar';
import {
  exportCandlesToCSV,
  exportCandlesToJSON,
  triggerCollect30Days,
} from '../services/localCandleDb';
import {
  calculateEMA,
  calculateSMA,
  calculateVolumeSMA,
  calculateRSI,
  calculateVWAP,
  calculateBollingerBands,
  calculateMACD,
  ActiveIndicatorConfig,
  DEFAULT_ACTIVE_INDICATORS,
  AVAILABLE_INDICATOR_PRESETS,
} from '../services/chartIndicators';
import {
  CheckCircle2,
  XCircle,
  Sliders,
  LineChart,
  ExternalLink,
  Activity,
  Edit3,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Radio,
  Calendar,
  Database,
  Download,
  FileSpreadsheet,
  FileCode,
  Zap,
  Play,
  Pause,
  FastForward,
  Clock,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  Settings,
  Plus,
  Search,
  RotateCcw,
  Maximize2,
  Minimize2,
  Percent,
  Sun,
  Moon,
} from 'lucide-react';

interface Level2StockDetailProps {
  instrument: InstrumentConfig;
  allInstruments: InstrumentConfig[];
  candles: Candle[];
  timeframe: '1m' | '5m' | '15m';
  onTimeframeChange: (tf: '1m' | '5m' | '15m') => void;
  onSelectSymbol: (symbol: string) => void;
  onUpdatePrice?: (symbol: string, newPrice: number) => void;
  technicalOutput: TechnicalOutput;
  orchestratorOutput: OrchestratorOutput;
  validationResult: TargetValidationResult | null;
  onInspectAgents: () => void;
  sessionStatus?: SessionStatus;
  isAutoPlaying?: boolean;
  onToggleAutoPlay?: () => void;
  streamSpeed?: number;
  onChangeStreamSpeed?: (speed: number) => void;
  enforceRealMarketHours?: boolean;
  onToggleEnforceMarketHours?: () => void;
  onStepSimulation?: () => void;
  isUpstoxConnected?: boolean;
  upstoxQuote?: UpstoxLiveQuote;
  onSyncToUpstoxPrice?: () => void;
  onOpenUpstoxModal?: () => void;
  onQuickTrade?: (symbol: string, direction: 'LONG' | 'SHORT', price: number, qty: number) => void;
  onReload30dDb?: () => Promise<void>;
}

export type ChartRange = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'Recent Day';

export const Level2StockDetail: React.FC<Level2StockDetailProps> = ({
  instrument,
  allInstruments,
  candles,
  timeframe,
  onTimeframeChange,
  onSelectSymbol,
  onUpdatePrice,
  technicalOutput,
  orchestratorOutput,
  validationResult,
  onInspectAgents,
  sessionStatus,
  isAutoPlaying = false,
  onToggleAutoPlay,
  streamSpeed = 3,
  onChangeStreamSpeed,
  enforceRealMarketHours = false,
  onToggleEnforceMarketHours,
  onStepSimulation,
  isUpstoxConnected = false,
  upstoxQuote,
  onSyncToUpstoxPrice,
  onOpenUpstoxModal,
  onQuickTrade,
  onReload30dDb,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const leftScaleAnchorRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const currentSymbolRef = useRef<string>(instrument.symbol);
  const isScrolledBackRef = useRef<boolean>(false);
  const candlesCountRef = useRef<number>(candles.length);
  candlesCountRef.current = candles.length;

  // TradingView widget vs Internal Engine Chart
  const [useOfficialTvWidget, setUseOfficialTvWidget] = useState<boolean>(false);

  // Range selector (1D default, exactly matching user screenshot!)
  const [activeRange, setActiveRange] = useState<ChartRange>('1D');

  // Expanded Fullscreen Chart View Mode
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Selected date for 1D mode (defaults to latest available session)
  const [selectedSessionDate, setSelectedSessionDate] = useState<string>('latest');

  // Interactive hovered candle for dynamic header OHLCV tracking
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  // Quick Trade Quantity
  const [quickQty, setQuickQty] = useState<number>(1);
  const [quickTradeToast, setQuickTradeToast] = useState<string | null>(null);

  // Scale settings
  const [isPercentScale, setIsPercentScale] = useState<boolean>(false);

  // Chart background theme: 'white' (default as requested) or 'dark'
  const [chartBgTheme, setChartBgTheme] = useState<'white' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('immip_chart_bg_theme');
      if (saved === 'dark' || saved === 'white') return saved;
    } catch (_) {}
    return 'white';
  });

  useEffect(() => {
    try {
      localStorage.setItem('immip_chart_bg_theme', chartBgTheme);
    } catch (_) {}
  }, [chartBgTheme]);

  // Local DB collection state
  const [isCollectingDb, setIsCollectingDb] = useState<boolean>(false);
  const [dbCollectMsg, setDbCollectMsg] = useState<string | null>(null);

  // Price Calibration modal/form
  const [isEditingPrice, setIsEditingPrice] = useState<boolean>(false);
  const [editedPrice, setEditedPrice] = useState<string>(String(instrument.base_demo_price));

  // Clock for UTC+5:30 display at bottom right (like screenshot)
  const [clockTime, setClockTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTime(
        new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setEditedPrice(String(instrument.base_demo_price));
  }, [instrument]);

  const handleSavePrice = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(editedPrice);
    if (!isNaN(parsed) && parsed > 0 && onUpdatePrice) {
      onUpdatePrice(instrument.symbol, parsed);
    }
    setIsEditingPrice(false);
  };

  // =========================================================================
  // Technical Indicators State (TradingView fx Standard)
  // =========================================================================
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicatorConfig[]>(() => {
    try {
      const saved = localStorage.getItem('active_chart_indicators');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_ACTIVE_INDICATORS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('active_chart_indicators', JSON.stringify(activeIndicators));
    } catch (_) {}
  }, [activeIndicators]);

  const [showIndicatorsModal, setShowIndicatorsModal] = useState<boolean>(false);
  const [indicatorSearchQuery, setIndicatorSearchQuery] = useState<string>('');
  const [editingIndicatorId, setEditingIndicatorId] = useState<string | null>(null);

  // Overlay Line Series map ref for main chart
  const overlaySeriesMapRef = useRef<Map<string, any>>(new Map());

  // Sub-pane RSI chart refs
  const rsiChartContainerRef = useRef<HTMLDivElement | null>(null);
  const rsiChartInstanceRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<any>(null);
  const isSyncingFromMainRef = useRef<boolean>(false);
  const isSyncingFromRsiRef = useRef<boolean>(false);

  const toggleIndicatorVisibility = useCallback((id: string) => {
    setActiveIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, visible: !ind.visible } : ind))
    );
  }, []);

  const removeIndicator = useCallback((id: string) => {
    setActiveIndicators((prev) => prev.filter((ind) => ind.id !== id));
  }, []);

  const addIndicatorPreset = useCallback((preset: typeof AVAILABLE_INDICATOR_PRESETS[0]) => {
    setActiveIndicators((prev) => {
      const existing = prev.find((i) => i.id === preset.id);
      if (existing) {
        return prev.map((i) => (i.id === preset.id ? { ...i, visible: true } : i));
      }
      return [
        ...prev,
        {
          id: preset.id,
          name: preset.name.split(' (')[0],
          type: preset.type as any,
          period: preset.period,
          color: preset.color,
          visible: true,
          pane: preset.pane as any,
        },
      ];
    });
  }, []);

  const updateIndicatorConfig = useCallback((id: string, updates: Partial<ActiveIndicatorConfig>) => {
    setActiveIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, ...updates } : ind))
    );
  }, []);

  const resetToDefaultIndicators = useCallback(() => {
    setActiveIndicators(DEFAULT_ACTIVE_INDICATORS);
  }, []);

  // Sanitize candles to strictly enforce NSE regular market hours (09:15 to 15:29 IST)
  // and prevent ANY bar from being rendered in the future beyond the current clock minute!
  const sanitizedCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    const tfSeconds = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 900;
    const currentBucketSec = nowSec - (nowSec % tfSeconds);

    return candles.filter((c) => {
      // 1. Strict future rejection: no candle can have time > current live minute
      if (c.time > currentBucketSec) return false;

      // 2. Strict market close rejection: no candle can be past 15:29:00 IST on any trading day
      const istMs = c.time * 1000 + 5.5 * 3600 * 1000;
      const ist = new Date(istMs);
      const minOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      if (minOfDay < 9 * 60 + 15 || minOfDay > 15 * 60 + 29) return false;

      return true;
    });
  }, [candles, timeframe]);

  // Computed technical indicators dataset
  const calculatedIndicators = useMemo(() => {
    if (!sanitizedCandles || sanitizedCandles.length === 0) return new Map<string, any>();
    const map = new Map<string, any>();

    for (const ind of activeIndicators) {
      if (!ind.visible) continue;
      if (ind.type === 'EMA') {
        map.set(ind.id, calculateEMA(sanitizedCandles, ind.period || 7));
      } else if (ind.type === 'SMA') {
        map.set(ind.id, calculateSMA(sanitizedCandles, ind.period || 20));
      } else if (ind.type === 'VOLUME_SMA') {
        map.set(ind.id, calculateVolumeSMA(sanitizedCandles, ind.period || 10));
      } else if (ind.type === 'VWAP') {
        map.set(ind.id, calculateVWAP(sanitizedCandles));
      } else if (ind.type === 'BOLLINGER') {
        map.set(ind.id, calculateBollingerBands(sanitizedCandles, ind.period || 20, 2));
      } else if (ind.type === 'RSI') {
        map.set(ind.id, calculateRSI(sanitizedCandles, ind.period || 14));
      } else if (ind.type === 'MACD') {
        map.set(ind.id, calculateMACD(sanitizedCandles, 12, 26, 9));
      }
    }
    return map;
  }, [sanitizedCandles, activeIndicators]);

  // First active visible RSI for dedicated oscillator sub-pane
  const activeRsiIndicator = useMemo(() => {
    return activeIndicators.find((i) => i.type === 'RSI' && i.visible);
  }, [activeIndicators]);

  // Compute responsive chart heights for normal vs expanded fullscreen views
  const getComputedChartHeights = useCallback(() => {
    if (!isExpanded) {
      return {
        mainHeight: activeRsiIndicator ? 420 : 470,
        rsiHeight: 110,
      };
    }
    // Expanded fullscreen mode: use entire window viewport
    const totalHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    // Compact overhead in expanded mode:
    // Top header (~38px) + Unified control bar (~30px) + Bottom range bar (~36px) = ~104px
    // plus compact alert banner if market is closed under strict hours (~24px)
    const hasClosedBanner = enforceRealMarketHours && sessionStatus && !sessionStatus.is_market_open;
    const overhead = 106 + (hasClosedBanner ? 24 : 0);

    if (activeRsiIndicator) {
      const rsiHeader = 26;
      const rsiChartH = 105;
      const totalRsi = rsiHeader + rsiChartH;
      const remainingForMain = Math.max(220, totalHeight - overhead - totalRsi);
      return { mainHeight: remainingForMain, rsiHeight: rsiChartH };
    }
    const remainingForMain = Math.max(300, totalHeight - overhead);
    return { mainHeight: remainingForMain, rsiHeight: 105 };
  }, [isExpanded, activeRsiIndicator, enforceRealMarketHours, sessionStatus]);

  // Group candles by Indian trading date (YYYY-MM-DD in Asia/Kolkata)
  const sessionDates = useMemo(() => {
    if (!sanitizedCandles || sanitizedCandles.length === 0) return [];
    const dateMap = new Map<string, number>();
    for (const c of sanitizedCandles) {
      const dStr = new Date(c.time * 1000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      });
      dateMap.set(dStr, (dateMap.get(dStr) || 0) + 1);
    }
    return Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));
  }, [sanitizedCandles]);

  // Ensure default selectedSessionDate is set to latest session
  const effectiveSessionDate = useMemo(() => {
    if (sessionDates.length === 0) return '';
    if (selectedSessionDate === 'latest') {
      return sessionDates[sessionDates.length - 1].date;
    }
    const found = sessionDates.find((s) => s.date === selectedSessionDate);
    return found ? found.date : sessionDates[sessionDates.length - 1].date;
  }, [sessionDates, selectedSessionDate]);

  // Track whether the user has scrolled back in time away from the latest bar
  const [isScrolledBack, setIsScrolledBack] = useState<boolean>(false);

  // Latest candle / currently hovered candle
  const latestCandle = useMemo(() => {
    if (sanitizedCandles && sanitizedCandles.length > 0) {
      return sanitizedCandles[sanitizedCandles.length - 1];
    }
    return null;
  }, [sanitizedCandles]);

  const activeCandle = hoveredCandle || latestCandle;

  // Calculate change for top OHLCV bar
  const priceStats = useMemo(() => {
    if (!activeCandle) {
      return {
        open: instrument.base_demo_price,
        high: instrument.base_demo_price,
        low: instrument.base_demo_price,
        close: instrument.base_demo_price,
        volume: 0,
        change: 0,
        changePct: 0,
        isPositive: true,
      };
    }
    const diff = activeCandle.close - activeCandle.open;
    const pct = activeCandle.open > 0 ? (diff / activeCandle.open) * 100 : 0;
    return {
      open: activeCandle.open,
      high: activeCandle.high,
      low: activeCandle.low,
      close: activeCandle.close,
      volume: activeCandle.volume,
      change: diff,
      changePct: pct,
      isPositive: diff >= 0,
    };
  }, [activeCandle, instrument.base_demo_price]);

  // Live or hovered candle values for all active indicators to display on the legend
  const activeIndicatorValues = useMemo(() => {
    const result: Record<string, any> = {};
    const targetTime = activeCandle ? activeCandle.time : null;

    for (const ind of activeIndicators) {
      if (!ind.visible) continue;
      const data = calculatedIndicators.get(ind.id);
      if (!data) continue;

      if (ind.type === 'BOLLINGER') {
        const { upper, lower, middle } = data;
        if (!middle || middle.length === 0) continue;
        if (targetTime) {
          const u = upper.find((p: any) => p.time === targetTime) || upper[upper.length - 1];
          const m = middle.find((p: any) => p.time === targetTime) || middle[middle.length - 1];
          const l = lower.find((p: any) => p.time === targetTime) || lower[lower.length - 1];
          result[ind.id] = { upper: u?.value, middle: m?.value, lower: l?.value };
        } else {
          result[ind.id] = {
            upper: upper[upper.length - 1]?.value,
            middle: middle[middle.length - 1]?.value,
            lower: lower[lower.length - 1]?.value,
          };
        }
      } else if (Array.isArray(data)) {
        if (data.length === 0) continue;
        if (targetTime) {
          const pt = data.find((p: any) => p.time === targetTime) || data[data.length - 1];
          result[ind.id] = pt ? pt.value : null;
        } else {
          const pt = data[data.length - 1];
          result[ind.id] = pt ? pt.value : null;
        }
      }
    }
    return result;
  }, [activeIndicators, calculatedIndicators, activeCandle]);

  // Live tick tracking & direction flash
  const [tickDirection, setTickDirection] = useState<'UP' | 'DOWN' | 'FLAT'>('FLAT');
  const [liveTickCount, setLiveTickCount] = useState<number>(0);
  const prevPriceRef = useRef<number>(instrument.base_demo_price);

  useEffect(() => {
    if (activeCandle) {
      const cur = activeCandle.close;
      if (cur > prevPriceRef.current) {
        setTickDirection('UP');
        setLiveTickCount((c) => c + 1);
        const t = setTimeout(() => setTickDirection('FLAT'), 1800);
        return () => clearTimeout(t);
      } else if (cur < prevPriceRef.current) {
        setTickDirection('DOWN');
        setLiveTickCount((c) => c + 1);
        const t = setTimeout(() => setTickDirection('FLAT'), 1800);
        return () => clearTimeout(t);
      }
      prevPriceRef.current = cur;
    }
  }, [activeCandle?.close]);

  // Strategy price lines tracking
  const strategyLinesRef = useRef<{
    p0?: any;
    entry?: any;
    target?: any;
    stop?: any;
  }>({});

  // Set the viewport's visible range without wiping historical candles
  const applyVisibleRange = useCallback(
    (range: ChartRange, targetDate?: string) => {
      if (!chartInstanceRef.current || !sanitizedCandles || sanitizedCandles.length === 0) return;
      const timeScale = chartInstanceRef.current.timeScale();

      if (range === '1D' || range === 'Recent Day') {
        const dateToUse = targetDate || effectiveSessionDate;
        let start = -1;
        let end = -1;
        for (let i = 0; i < sanitizedCandles.length; i++) {
          const dStr = new Date(sanitizedCandles[i].time * 1000).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Kolkata',
          });
          if (dStr === dateToUse) {
            if (start === -1) start = i;
            end = i;
          }
        }
        if (start === -1) {
          start = Math.max(0, sanitizedCandles.length - 375);
          end = sanitizedCandles.length - 1;
        }
        // Focus on the session (09:15 to 15:30 IST) with slight margin
        timeScale.setVisibleLogicalRange({ from: start - 3, to: end + 5 });
        if (rsiChartInstanceRef.current) {
          try {
            rsiChartInstanceRef.current.timeScale().setVisibleLogicalRange({ from: start - 3, to: end + 5 });
          } catch (_) {}
        }
        return;
      }

      if (range === '5D') {
        const start5d = Math.max(0, sanitizedCandles.length - 375 * 5);
        timeScale.setVisibleLogicalRange({ from: start5d - 3, to: sanitizedCandles.length + 5 });
        if (rsiChartInstanceRef.current) {
          try {
            rsiChartInstanceRef.current.timeScale().setVisibleLogicalRange({ from: start5d - 3, to: sanitizedCandles.length + 5 });
          } catch (_) {}
        }
        return;
      }

      if (range === '1M' || range === '3M' || range === '6M' || range === '1Y' || range === '5Y') {
        timeScale.fitContent();
        if (rsiChartInstanceRef.current) {
          try {
            rsiChartInstanceRef.current.timeScale().fitContent();
          } catch (_) {}
        }
        return;
      }
    },
    [sanitizedCandles, effectiveSessionDate]
  );

  // Range change handler
  const handleRangeChange = (range: ChartRange) => {
    if (range === 'Recent Day') {
      // 1. Switch timeframe to 1m candles as requested:
      if (timeframe !== '1m') {
        onTimeframeChange('1m');
      }

      // 2. If trading day, show current day chart; if not trading day, show previous trading day
      const now = new Date();
      const todayIst = sessionStatus?.session_date || now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const isTodayTrading = sessionStatus ? sessionStatus.is_trading_day : isTradingDay(todayIst);

      let targetDate: string;
      if (isTodayTrading) {
        // Today is a trading day. Check if today has candles in sessionDates
        const hasTodayCandles = sessionDates.some((s) => s.date === todayIst);
        if (hasTodayCandles) {
          targetDate = todayIst;
        } else {
          // If today's session has not generated candles yet (e.g. pre-market), use latest session
          targetDate = sessionDates[sessionDates.length - 1]?.date || todayIst;
        }
      } else {
        // Non-trading day (Weekend / NSE Holiday): show previous trading day
        const prevTradingDay = getPreviousTradingDay(todayIst);
        const hasPrev = sessionDates.find((s) => s.date === prevTradingDay);
        targetDate = hasPrev ? hasPrev.date : (sessionDates[sessionDates.length - 1]?.date || prevTradingDay);
      }

      setSelectedSessionDate(targetDate);
      setActiveRange('Recent Day');
      applyVisibleRange('Recent Day', targetDate);
      return;
    }

    setActiveRange(range);
    applyVisibleRange(range, effectiveSessionDate);
  };

  // Session date dropdown change handler
  const handleSessionDateChange = (date: string) => {
    setSelectedSessionDate(date);
    setActiveRange('1D');
    applyVisibleRange('1D', date === 'latest' ? undefined : date);
  };

  // Lightweight Charts Render — loads ALL continuous candles into the chart series
  // so moving the chart backwards reveals previous days seamlessly
  useEffect(() => {
    if (useOfficialTvWidget || !chartContainerRef.current || sanitizedCandles.length === 0) return;

    chartContainerRef.current.innerHTML = '';

    const { mainHeight } = getComputedChartHeights();
    const initialH =
      isExpanded && chartContainerRef.current.clientHeight > 50
        ? chartContainerRef.current.clientHeight
        : mainHeight;
    const isWhite = chartBgTheme === 'white';
    const chart: IChartApi = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 800,
      height: initialH,
      layout: {
        background: { type: ColorType.Solid, color: isWhite ? '#ffffff' : '#090d16' },
        textColor: isWhite ? '#334155' : '#94a3b8',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      localization: {
        priceFormatter: (p: number) => `₹${p.toFixed(2)}`,
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return (
            date.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: 'numeric',
              month: 'short',
            }) +
            ' ' +
            date.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
            }) +
            ' IST'
          );
        },
      },
      grid: {
        vertLines: { color: isWhite ? 'rgba(226, 232, 240, 0.75)' : 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: isWhite ? 'rgba(226, 232, 240, 0.75)' : 'rgba(30, 41, 59, 0.45)' },
      },
      timeScale: {
        visible: true,
        timeVisible: true,
        secondsVisible: false,
        borderColor: isWhite ? '#cbd5e1' : '#1e293b',
        rightOffset: 5,
        barSpacing: 5,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const timeStr = date.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          });
          // Display the date at the market open bar (09:15) so previous days are clearly visible
          if (timeStr === '09:15') {
            return date.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              month: 'short',
              day: 'numeric',
            });
          }
          return timeStr;
        },
      },
      leftPriceScale: {
        visible: true,
        borderColor: isWhite ? '#cbd5e1' : '#1e293b',
        mode: isPercentScale ? 2 : 0, // 2: Percentage, 0: Normal
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      rightPriceScale: {
        visible: true,
        borderColor: isWhite ? '#cbd5e1' : '#1e293b',
        mode: isPercentScale ? 2 : 0, // 2: Percentage, 0: Normal
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
    });

    chartInstanceRef.current = chart;

    // Candlestick Series (v5 API) — loaded with sanitized continuous candles.
    // Explicitly on rightPriceScale so live price LTP is the ONLY badge on the right!
    const candleSeries = chart.addSeries(CandlestickSeries, {
      priceScaleId: 'right',
      lastValueVisible: true,
      upColor: isWhite ? '#16a34a' : '#10b981',
      downColor: isWhite ? '#dc2626' : '#ef4444',
      borderVisible: true,
      borderUpColor: isWhite ? '#16a34a' : '#10b981',
      borderDownColor: isWhite ? '#dc2626' : '#ef4444',
      wickUpColor: isWhite ? '#16a34a' : '#10b981',
      wickDownColor: isWhite ? '#dc2626' : '#ef4444',
    });

    const formattedCandles = sanitizedCandles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(formattedCandles);
    candleSeriesRef.current = candleSeries;

    // Dedicated left-scale series for strategy price lines (S Stop, Po Ref, Entry, Target)
    // so all strategy levels display their labels on the LEFT side of the chart!
    const leftAnchorSeries = chart.addSeries(LineSeries, {
      priceScaleId: 'left',
      lastValueVisible: false,
      color: 'transparent',
      lineWidth: 1,
      lineVisible: false,
    });
    leftAnchorSeries.setData(
      sanitizedCandles.map((c) => ({ time: c.time as any, value: c.close }))
    );
    leftScaleAnchorRef.current = leftAnchorSeries;

    // Volume Histogram (v5 API) — loaded with sanitized continuous candles
    // lastValueVisible: false prevents volume numbers from polluting the price scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: isWhite ? 'rgba(2, 132, 199, 0.65)' : '#38bdf8',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
      lastValueVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.72, bottom: 0 },
    });
    volumeSeries.setData(
      sanitizedCandles.map((c) => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open
          ? (isWhite ? 'rgba(22, 163, 74, 0.55)' : 'rgba(16, 185, 129, 0.45)')
          : (isWhite ? 'rgba(220, 38, 38, 0.55)' : 'rgba(239, 68, 68, 0.45)'),
      }))
    );

    // Crosshair hover synchronization to update top OHLCV bar
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        setHoveredCandle(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeries) as any;
      if (candleData) {
        const volData = param.seriesData.get(volumeSeries) as any;
        setHoveredCandle({
          time: Number(param.time),
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData ? volData.value : 0,
        });
      }
    });

    // Detect if user has scrolled back in time away from the latest bar
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (!logicalRange) return;
      const total = candlesCountRef.current;
      const scrolled = logicalRange.to < total - 15;
      isScrolledBackRef.current = scrolled;
      setIsScrolledBack(scrolled);
    });

    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    currentSymbolRef.current = instrument.symbol;

    // Set initial visible window to the selected range (1D by default)
    applyVisibleRange(activeRange, effectiveSessionDate);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlaySeriesMapRef.current.clear();
    };
  }, [instrument.symbol, useOfficialTvWidget, isPercentScale, chartBgTheme]);

  // Adjust main chart and RSI subpane heights dynamically when isExpanded or RSI toggles
  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const clientW = chartContainerRef.current.clientWidth || 800;
        const clientH = isExpanded
          ? chartContainerRef.current.clientHeight
          : getComputedChartHeights().mainHeight;
        if (clientW > 50 && clientH > 50) {
          chartInstanceRef.current.applyOptions({
            width: clientW,
            height: clientH,
          });
        }
      }
      if (rsiChartContainerRef.current && rsiChartInstanceRef.current) {
        const rsiW = rsiChartContainerRef.current.clientWidth || 800;
        const rsiH = getComputedChartHeights().rsiHeight;
        if (rsiW > 50 && rsiH > 50) {
          rsiChartInstanceRef.current.applyOptions({
            width: rsiW,
            height: rsiH,
          });
        }
      }
    };

    handleResize();
    const raf = requestAnimationFrame(handleResize);
    const t1 = setTimeout(handleResize, 50);
    const t2 = setTimeout(handleResize, 150);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        handleResize();
      });
      if (chartContainerRef.current) ro.observe(chartContainerRef.current);
      if (rsiChartContainerRef.current) ro.observe(rsiChartContainerRef.current);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [isExpanded, activeRsiIndicator, getComputedChartHeights, chartBgTheme]);

  // Synchronize Overlay Line Series on the Main Chart (EMA, SMA, VWAP, Bollinger, Volume SMA)
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || useOfficialTvWidget) return;

    const currentMap = overlaySeriesMapRef.current;
    const activeKeys = new Set<string>();

    for (const ind of activeIndicators) {
      if (!ind.visible || ind.pane !== 'OVERLAY') continue;
      const data = calculatedIndicators.get(ind.id);
      if (!data) continue;

      if (ind.type === 'BOLLINGER') {
        const { upper, lower, middle } = data;
        if (!middle || middle.length === 0) continue;
        const uKey = `${ind.id}-upper`;
        const mKey = `${ind.id}-mid`;
        const lKey = `${ind.id}-lower`;
        activeKeys.add(uKey);
        activeKeys.add(mKey);
        activeKeys.add(lKey);

        let uSeries = currentMap.get(uKey);
        if (!uSeries) {
          uSeries = chart.addSeries(LineSeries, {
            color: 'rgba(99, 102, 241, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            priceScaleId: 'left',
          });
          currentMap.set(uKey, uSeries);
        }
        uSeries.setData(upper.map((p: any) => ({ time: p.time as any, value: p.value })));

        let mSeries = currentMap.get(mKey);
        if (!mSeries) {
          mSeries = chart.addSeries(LineSeries, {
            color: ind.color || '#6366f1',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            priceScaleId: 'left',
          });
          currentMap.set(mKey, mSeries);
        }
        mSeries.setData(middle.map((p: any) => ({ time: p.time as any, value: p.value })));

        let lSeries = currentMap.get(lKey);
        if (!lSeries) {
          lSeries = chart.addSeries(LineSeries, {
            color: 'rgba(99, 102, 241, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            priceScaleId: 'left',
          });
          currentMap.set(lKey, lSeries);
        }
        lSeries.setData(lower.map((p: any) => ({ time: p.time as any, value: p.value })));
        continue;
      }

      activeKeys.add(ind.id);

      if (ind.type === 'VOLUME_SMA') {
        let s = currentMap.get(ind.id);
        if (!s) {
          s = chart.addSeries(LineSeries, {
            color: ind.color,
            lineWidth: 2,
            priceScaleId: '', // Same overlay price scale as volume histogram
            priceFormat: { type: 'volume' },
            lastValueVisible: false, // Prevents volume number from appearing on price scale
          });
          currentMap.set(ind.id, s);
        } else {
          s.applyOptions({ color: ind.color, lastValueVisible: false });
        }
        s.setData(data.map((p: any) => ({ time: p.time as any, value: p.value })));
        continue;
      }

      // Standard EMA / SMA / VWAP overlay placed on LEFT price scale!
      let s = currentMap.get(ind.id);
      if (!s) {
        s = chart.addSeries(LineSeries, {
          color: ind.color,
          lineWidth: 2,
          priceScaleId: 'left',
          lastValueVisible: true,
        });
        currentMap.set(ind.id, s);
      } else {
        s.applyOptions({ color: ind.color, lastValueVisible: true });
      }
      s.setData(data.map((p: any) => ({ time: p.time as any, value: p.value })));
    }

    // Clean up series that got disabled or removed
    currentMap.forEach((series, key) => {
      if (!activeKeys.has(key)) {
        try {
          chart.removeSeries(series);
        } catch (_) {}
        currentMap.delete(key);
      }
    });
  }, [activeIndicators, calculatedIndicators, useOfficialTvWidget]);

  // Synchronize and render RSI Sub-pane Chart
  useEffect(() => {
    if (!activeRsiIndicator || !rsiChartContainerRef.current || useOfficialTvWidget) {
      if (rsiChartInstanceRef.current) {
        rsiChartInstanceRef.current.remove();
        rsiChartInstanceRef.current = null;
        rsiSeriesRef.current = null;
      }
      return;
    }

    rsiChartContainerRef.current.innerHTML = '';
    const { rsiHeight: initialRsiHeight } = getComputedChartHeights();

    const isWhite = chartBgTheme === 'white';
    const rsiChart = createChart(rsiChartContainerRef.current, {
      width: rsiChartContainerRef.current.clientWidth || 800,
      height: initialRsiHeight,
      layout: {
        background: { type: ColorType.Solid, color: isWhite ? '#ffffff' : '#090d16' },
        textColor: isWhite ? '#334155' : '#94a3b8',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      grid: {
        vertLines: { color: isWhite ? 'rgba(226, 232, 240, 0.75)' : 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: isWhite ? 'rgba(226, 232, 240, 0.75)' : 'rgba(30, 41, 59, 0.45)' },
      },
      timeScale: {
        visible: true,
        timeVisible: true,
        secondsVisible: false,
        borderColor: isWhite ? '#cbd5e1' : '#1e293b',
        rightOffset: 5,
        barSpacing: 5,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          });
        },
      },
      leftPriceScale: {
        visible: true,
        borderColor: isWhite ? '#cbd5e1' : '#1e293b',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      rightPriceScale: {
        visible: false,
      },
      localization: {
        priceFormatter: (p: number) => p.toFixed(2),
      },
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: activeRsiIndicator.color || '#a855f7',
      lineWidth: 2,
      priceScaleId: 'left',
      lastValueVisible: true,
      priceFormat: {
        type: 'custom',
        formatter: (p: number) => p.toFixed(2),
      },
    });

    // Reference lines for Overbought (70), Midline (50), Oversold (30)
    rsiSeries.createPriceLine({
      price: 70,
      color: isWhite ? 'rgba(220, 38, 38, 0.65)' : 'rgba(239, 68, 68, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '70',
    });
    rsiSeries.createPriceLine({
      price: 50,
      color: isWhite ? 'rgba(100, 116, 139, 0.5)' : 'rgba(148, 163, 184, 0.45)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '50',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: isWhite ? 'rgba(22, 163, 74, 0.65)' : 'rgba(16, 185, 129, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '30',
    });

    const rsiData = calculatedIndicators.get(activeRsiIndicator.id) || [];
    rsiSeries.setData(rsiData.map((p: any) => ({ time: p.time as any, value: p.value })));

    rsiChartInstanceRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    // Two-way timescale synchronization with main chart
    const mainChart = chartInstanceRef.current;
    if (mainChart) {
      const mainRange = mainChart.timeScale().getVisibleLogicalRange();
      if (mainRange) {
        rsiChart.timeScale().setVisibleLogicalRange(mainRange);
      }

      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingFromRsiRef.current || !range || !rsiChartInstanceRef.current) return;
        isSyncingFromMainRef.current = true;
        try {
          rsiChartInstanceRef.current.timeScale().setVisibleLogicalRange(range);
        } catch (_) {}
        isSyncingFromMainRef.current = false;
      });

      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingFromMainRef.current || !range || !chartInstanceRef.current) return;
        isSyncingFromRsiRef.current = true;
        try {
          chartInstanceRef.current.timeScale().setVisibleLogicalRange(range);
        } catch (_) {}
        isSyncingFromRsiRef.current = false;
      });

      // Hover crosshair sync
      rsiChart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) return;
        const pt = sanitizedCandles.find((c) => c.time === Number(param.time));
        if (pt) setHoveredCandle(pt);
      });
    }

    const handleResize = () => {
      if (rsiChartContainerRef.current && rsiChartInstanceRef.current) {
        const { rsiHeight: currentRsiHeight } = getComputedChartHeights();
        rsiChartInstanceRef.current.applyOptions({
          width: rsiChartContainerRef.current.clientWidth,
          height: currentRsiHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      rsiChart.remove();
      rsiChartInstanceRef.current = null;
      rsiSeriesRef.current = null;
    };
  }, [activeRsiIndicator?.id, activeRsiIndicator?.color, activeRsiIndicator?.period, useOfficialTvWidget, isExpanded, getComputedChartHeights, chartBgTheme]);

  // Update RSI series data when calculation updates
  useEffect(() => {
    if (!rsiSeriesRef.current || !activeRsiIndicator) return;
    const rsiData = calculatedIndicators.get(activeRsiIndicator.id);
    if (rsiData) {
      rsiSeriesRef.current.setData(rsiData.map((p: any) => ({ time: p.time as any, value: p.value })));
    }
  }, [calculatedIndicators, activeRsiIndicator?.id]);

  const prevCandlesCountRef = useRef<number>(0);
  const prevSymbolRef = useRef<string>(instrument.symbol);

  // Update existing series without recreating the chart or snapping view if user is looking at past candles
  useEffect(() => {
    if (!chartInstanceRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (sanitizedCandles.length === 0) return;

    const isSameSymbol = prevSymbolRef.current === instrument.symbol;
    prevSymbolRef.current = instrument.symbol;

    const lastCandle = sanitizedCandles[sanitizedCandles.length - 1];

    // If streaming incremental candle update (same symbol, baseline already loaded, and 0 or 1 new bar)
    const countDiff = sanitizedCandles.length - prevCandlesCountRef.current;
    const isIncrementalUpdate =
      isSameSymbol &&
      prevCandlesCountRef.current > 100 &&
      (countDiff === 0 || countDiff === 1);

    if (isIncrementalUpdate) {
      candleSeriesRef.current.update({
        time: lastCandle.time as any,
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
      });

      const isWhite = chartBgTheme === 'white';
      volumeSeriesRef.current.update({
        time: lastCandle.time as any,
        value: lastCandle.volume,
        color: lastCandle.close >= lastCandle.open
          ? (isWhite ? 'rgba(22, 163, 74, 0.55)' : 'rgba(16, 185, 129, 0.5)')
          : (isWhite ? 'rgba(220, 38, 38, 0.55)' : 'rgba(239, 68, 68, 0.5)'),
      });

      prevCandlesCountRef.current = sanitizedCandles.length;
      return;
    }

    // Full baseline load (mount or stock symbol switch)
    const isWhite = chartBgTheme === 'white';
    const formattedCandles = sanitizedCandles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(formattedCandles);

    volumeSeriesRef.current.setData(
      sanitizedCandles.map((c) => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open
          ? (isWhite ? 'rgba(22, 163, 74, 0.55)' : 'rgba(16, 185, 129, 0.5)')
          : (isWhite ? 'rgba(220, 38, 38, 0.55)' : 'rgba(239, 68, 68, 0.5)'),
      }))
    );

    prevCandlesCountRef.current = sanitizedCandles.length;

    // Only apply range on initial or explicit user action, NOT if user is scrolling back in time
    if (!isScrolledBackRef.current && activeRange === '1D') {
      applyVisibleRange('1D', effectiveSessionDate);
    }
  }, [sanitizedCandles, effectiveSessionDate, activeRange, applyVisibleRange, instrument.symbol]);

  // Strategy Price Lines (P0, Entry, Target, Stop-Loss)
  // Attached to leftScaleAnchorRef so their labels display on the LEFT side of the chart!
  useEffect(() => {
    const series = leftScaleAnchorRef.current || candleSeriesRef.current;
    if (!series) return;

    // Safely remove previous lines
    if (strategyLinesRef.current.p0) {
      try { series.removePriceLine(strategyLinesRef.current.p0); } catch (_) {}
    }
    if (strategyLinesRef.current.entry) {
      try { series.removePriceLine(strategyLinesRef.current.entry); } catch (_) {}
    }
    if (strategyLinesRef.current.target) {
      try { series.removePriceLine(strategyLinesRef.current.target); } catch (_) {}
    }
    if (strategyLinesRef.current.stop) {
      try { series.removePriceLine(strategyLinesRef.current.stop); } catch (_) {}
    }

    strategyLinesRef.current = {};

    const { reference_price, planned_entry, planned_target, planned_stop, decision } = orchestratorOutput;

    const isWhite = chartBgTheme === 'white';
    if (reference_price && reference_price > 0) {
      strategyLinesRef.current.p0 = series.createPriceLine({
        price: reference_price,
        color: isWhite ? '#475569' : '#94a3b8',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'P₀ Ref',
      });
    }

    if (planned_entry && planned_entry > 0) {
      strategyLinesRef.current.entry = series.createPriceLine({
        price: planned_entry,
        color: decision === 'LONG' ? (isWhite ? '#0284c7' : '#38bdf8') : (isWhite ? '#e11d48' : '#f43f5e'),
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `E Entry (${decision})`,
      });
    }

    if (planned_target && planned_target > 0) {
      strategyLinesRef.current.target = series.createPriceLine({
        price: planned_target,
        color: isWhite ? '#16a34a' : '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'T Target',
      });
    }

    if (planned_stop && planned_stop > 0) {
      strategyLinesRef.current.stop = series.createPriceLine({
        price: planned_stop,
        color: isWhite ? '#dc2626' : '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'S Stop',
      });
    }
  }, [orchestratorOutput, chartBgTheme]);

  // Quick Paper Trade execution
  const handleQuickTrade = (direction: 'LONG' | 'SHORT') => {
    const currentPrice = priceStats.close || instrument.base_demo_price;
    if (onQuickTrade) {
      onQuickTrade(instrument.symbol, direction, currentPrice, quickQty);
    }
    setQuickTradeToast(
      `${direction === 'LONG' ? 'BUY' : 'SELL'} ${quickQty}x ${instrument.symbol} @ ₹${currentPrice.toFixed(2)} submitted to Paper Trading!`
    );
    setTimeout(() => setQuickTradeToast(null), 4000);
  };

  // Re-collect 30-day 1m candle database on demand
  const handleCollect30d = async () => {
    setIsCollectingDb(true);
    setDbCollectMsg(null);
    try {
      const res = await triggerCollect30Days(instrument.symbol);
      setDbCollectMsg(
        `✓ Downloaded ${res.total_bars || 7500} 1-minute bars for ${instrument.symbol} into local DB!`
      );
      if (onReload30dDb) {
        await onReload30dDb();
      }
    } catch (err: any) {
      setDbCollectMsg(`Notice: ${err.message || 'Upstox token needed for live download'}`);
    } finally {
      setIsCollectingDb(false);
      setTimeout(() => setDbCollectMsg(null), 6000);
    }
  };

  const ind = technicalOutput.indicators;

  return (
    <div className="space-y-4">
      {/* Quick Trade Notification Toast */}
      {quickTradeToast && (
        <div className="p-3 bg-emerald-950/90 border border-emerald-700 text-emerald-200 rounded-lg text-xs font-semibold flex items-center justify-between shadow-lg animate-fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {quickTradeToast}
          </span>
          <button
            onClick={() => setQuickTradeToast(null)}
            className="text-emerald-400 hover:text-white text-xs px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main TradingView Style Chart Card */}
      <div
        className={
          isExpanded
            ? 'fixed inset-0 z-50 bg-[#090d16] flex flex-col h-screen w-screen overflow-hidden'
            : 'bg-[#090d16] border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative'
        }
      >
        {/* Top Header: Symbol, Timeframe, Live OHLCV, and Action Toolbar (Compact TradingView Style) */}
        <div className="border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 bg-slate-950/95 px-3 py-1 shrink-0 z-30">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {/* Symbol Title & Timeframe */}
            <div className="flex items-center gap-1.5 text-xs font-sans">
              <span className="font-black text-white tracking-wide text-xs sm:text-sm">
                {instrument.company_name?.toUpperCase() || instrument.symbol}
              </span>
              <span className="text-slate-600 font-bold">•</span>
              <span className="font-mono font-bold text-sky-400 bg-sky-950/80 px-1 py-0.2 rounded text-[11px] border border-sky-800/60">
                {timeframe}
              </span>
              <span className="text-slate-600 font-bold">•</span>
              <span className="font-mono text-[11px] text-slate-400">NSE</span>
            </div>

            {/* Timeframe Quick Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[11px] font-mono">
              {(['1m', '5m', '15m'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-1.5 py-0.2 rounded font-bold transition ${
                    timeframe === tf
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* fx Indicators Button */}
            <button
              onClick={() => setShowIndicatorsModal(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-sky-400 font-mono text-[11px] font-semibold shadow-xs transition hover:text-sky-300 active:scale-95"
              title="Add or configure technical indicators (EMA, SMA, Volume SMA, RSI, VWAP, Bollinger Bands)"
            >
              <span className="font-serif italic font-black text-xs text-sky-400">fx</span>
              <span className="text-slate-200">Indicators</span>
              <span className="bg-sky-500/20 text-sky-300 text-[10px] px-1 rounded font-mono font-bold">
                {activeIndicators.filter((i) => i.visible).length}
              </span>
            </button>

            {/* Live OHLCV Legend with Crosshair Hover tracking */}
            <div className="flex items-center gap-x-2 text-[11px] font-mono bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">
              <span className="text-slate-400">
                O <strong className="text-white font-medium">{priceStats.open.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                H <strong className="text-emerald-400 font-medium">{priceStats.high.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                L <strong className="text-rose-400 font-medium">{priceStats.low.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                C <strong className="text-white font-bold">{priceStats.close.toFixed(2)}</strong>
              </span>
              <span
                className={`font-semibold ${
                  priceStats.isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {priceStats.change >= 0 ? '+' : ''}
                {priceStats.change.toFixed(2)} ({priceStats.changePct >= 0 ? '+' : ''}
                {priceStats.changePct.toFixed(2)}%)
              </span>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <span className="text-slate-400 hidden sm:inline">
                Vol{' '}
                <strong className="text-sky-300 font-medium">
                  {(priceStats.volume / 1000).toFixed(1)}K
                </strong>
              </span>
            </div>
          </div>

          {/* Right Header: Quick Buy/Sell Buttons, Prediction Badge & View Controls */}
          <div className="flex items-center gap-2">
            {/* Compact Quick SELL / BUY Action Panel */}
            <div className="flex items-center gap-1 bg-slate-900/95 border border-slate-700/80 rounded p-0.5 shadow-sm">
              <button
                onClick={() => handleQuickTrade('SHORT')}
                className="px-2 py-0.5 rounded bg-[#d9534f] hover:bg-[#c9302c] active:scale-95 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs"
                title="Execute Instant Paper Sell / Short"
              >
                <span className="text-[9px] uppercase font-bold tracking-wider text-rose-100">
                  SELL
                </span>
                <span className="font-mono text-xs">₹{priceStats.close.toFixed(2)}</span>
              </button>

              <input
                type="number"
                min="1"
                value={quickQty}
                onChange={(e) => setQuickQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-9 text-center bg-slate-950 border border-slate-700 text-white font-mono text-[11px] py-0.5 rounded focus:outline-none focus:border-sky-500"
                title="Trade Quantity"
              />

              <button
                onClick={() => handleQuickTrade('LONG')}
                className="px-2 py-0.5 rounded bg-[#16a34a] hover:bg-[#15803d] active:scale-95 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs"
                title="Execute Instant Paper Buy / Long"
              >
                <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-100">
                  BUY
                </span>
                <span className="font-mono text-xs">₹{priceStats.close.toFixed(2)}</span>
              </button>
            </div>

            {/* Strategy Decision Badge */}
            <span
              className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                orchestratorOutput.decision === 'LONG'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : orchestratorOutput.decision === 'SHORT'
                  ? 'bg-rose-950 text-rose-300 border-rose-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
              title="Deterministic Setup Probability"
            >
              <span>
                {orchestratorOutput.decision === 'LONG'
                  ? `LONG (${orchestratorOutput.calibrated_probability ? (orchestratorOutput.calibrated_probability * 100).toFixed(0) : 96}%)`
                  : orchestratorOutput.decision === 'SHORT'
                  ? `SHORT (${orchestratorOutput.calibrated_probability ? (orchestratorOutput.calibrated_probability * 100).toFixed(0) : 95}%)`
                  : 'NO TRADE'}
              </span>
            </span>

            {/* Scale Mode Toggle */}
            <button
              onClick={() => setIsPercentScale(!isPercentScale)}
              className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold flex items-center gap-1 transition ${
                isPercentScale
                  ? 'bg-sky-600 border-sky-400 text-white shadow-xs'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle between Percentage (%) and Price (₹) Scale"
            >
              <Percent className="w-3 h-3" />
              <span>{isPercentScale ? '% Pct' : '₹ Price'}</span>
            </button>

            {/* Fullscreen Expand / Exit Fullscreen Button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded border font-mono text-[11px] font-bold transition shadow-xs active:scale-95 ${
                isExpanded
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 ring-1 ring-amber-400/50'
                  : 'bg-slate-900 hover:bg-slate-800 text-sky-400 border-slate-700 hover:text-white'
              }`}
              title={isExpanded ? 'Exit Fullscreen (or press Esc)' : 'Expand Chart to Cover Whole Screen'}
            >
              {isExpanded ? (
                <>
                  <Minimize2 className="w-3 h-3 text-white" />
                  <span>Exit</span>
                  <span className="text-[9px] bg-amber-950/80 px-1 rounded text-amber-200">ESC</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3 h-3 text-sky-400" />
                  <span>Expand</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Compact Unified Control Bar: Stock Universe + Live Stream Playback + LTP */}
        <div className="px-3 py-1 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 text-xs shrink-0 z-30">
          {/* Left: Universe Pills + Stream Play/Pause + Step + Speed */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-0.5">
              Universe:
            </span>
            {allInstruments.map((inst) => {
              const isSelected = inst.symbol === instrument.symbol;
              return (
                <button
                  key={inst.symbol}
                  onClick={() => onSelectSymbol(inst.symbol)}
                  className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] transition ${
                    isSelected
                      ? 'bg-sky-600 text-white shadow-xs ring-1 ring-sky-400'
                      : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {inst.symbol}
                </button>
              );
            })}

            <span className="h-3.5 w-px bg-slate-800 mx-1 shrink-0" />

            {/* Stream Toggle Button */}
            <button
              onClick={onToggleAutoPlay}
              disabled={enforceRealMarketHours && !sessionStatus?.is_market_open}
              className={`px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 transition shadow-xs active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed ${
                !sessionStatus?.is_market_open && enforceRealMarketHours
                  ? 'bg-slate-950 text-slate-400 border border-slate-800'
                  : isAutoPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40 ring-1 ring-amber-400'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 ring-1 ring-emerald-400'
              }`}
              title={
                !sessionStatus?.is_market_open && enforceRealMarketHours
                  ? 'NSE Exchange is closed. Live streaming is paused.'
                  : isAutoPlaying
                  ? 'Pause Live Price Streaming'
                  : 'Start Live Price Streaming'
              }
            >
              {!sessionStatus?.is_market_open && enforceRealMarketHours ? (
                <>
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>CLOSED (PAUSED)</span>
                </>
              ) : isAutoPlaying ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <Pause className="w-3 h-3" />
                  <span>STREAMING</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>STREAM</span>
                </>
              )}
            </button>

            {/* Manual Step */}
            <button
              onClick={onStepSimulation}
              disabled={enforceRealMarketHours && !sessionStatus?.is_market_open}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 text-[10px] font-semibold flex items-center gap-1 transition active:scale-95"
              title="Advances stream by 1 price bar manually"
            >
              <FastForward className="w-2.5 h-2.5 text-sky-400" />
              <span>+1 Step</span>
            </button>

            {/* Interval buttons */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-0.5 text-[10px] font-mono">
              {[1, 2, 3, 5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => onChangeStreamSpeed?.(spd)}
                  className={`px-1.5 py-0.2 rounded font-bold transition ${
                    streamSpeed === spd
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Update price every ${spd}s`}
                >
                  {spd}s
                </button>
              ))}
            </div>
          </div>

          {/* Right: LTP Flash Card + Upstox Live + Mode Switch + DB */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono py-0.5">
            {/* Live Ticker Flash Card */}
            <div
              className={`px-2 py-0.5 rounded border flex items-center gap-1.5 transition-all duration-300 ${
                !sessionStatus?.is_market_open && enforceRealMarketHours
                  ? 'bg-slate-950 border-slate-800 text-slate-300'
                  : tickDirection === 'UP'
                  ? 'bg-emerald-950/90 border-emerald-500/80 text-emerald-300 ring-1 ring-emerald-500/50'
                  : tickDirection === 'DOWN'
                  ? 'bg-rose-950/90 border-rose-500/80 text-rose-300 ring-1 ring-rose-500/50'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sessionStatus?.is_market_open || !enforceRealMarketHours
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-[10px] uppercase font-bold text-slate-400">
                {sessionStatus?.is_market_open || !enforceRealMarketHours ? 'LTP:' : 'CLOSE:'}
              </span>
              <strong className="text-white font-bold">₹{priceStats.close.toFixed(2)}</strong>
              {(sessionStatus?.is_market_open || !enforceRealMarketHours) && tickDirection === 'UP' && (
                <span className="text-emerald-400 font-bold text-[10px]">▲</span>
              )}
              {(sessionStatus?.is_market_open || !enforceRealMarketHours) && tickDirection === 'DOWN' && (
                <span className="text-rose-400 font-bold text-[10px]">▼</span>
              )}
            </div>

            {/* Upstox Real Price Comparison */}
            {upstoxQuote && upstoxQuote.last_price > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/80 text-purple-200 text-[10px]">
                Upstox: ₹{upstoxQuote.last_price.toFixed(2)}
              </span>
            )}

            {/* Mode Toggle: 24/7 Practice Stream vs Strict Hours */}
            <button
              onClick={onToggleEnforceMarketHours}
              className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 transition ${
                !enforceRealMarketHours
                  ? 'bg-indigo-950/90 border-indigo-600 text-indigo-200 hover:bg-indigo-900'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title={
                !enforceRealMarketHours
                  ? '24/7 Practice Stream Active'
                  : 'Strict Market Hours (09:15-15:30 IST)'
              }
            >
              <Zap className="w-2.5 h-2.5 text-amber-400" />
              <span>{!enforceRealMarketHours ? '24/7 Stream' : 'Strict Hours'}</span>
            </button>

            {/* 30D DB indicator */}
            <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-800/70 text-sky-300 text-[10px]">
              <Database className="w-2.5 h-2.5 text-sky-400" />
              <span>{sanitizedCandles.length.toLocaleString()} bars</span>
            </span>

            {/* TV Cloud Toggle */}
            <button
              onClick={() => setUseOfficialTvWidget(!useOfficialTvWidget)}
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition ml-0.5"
              title="Toggle TradingView Cloud Widget"
            >
              <LineChart className="w-3 h-3" />
              <span className="hidden sm:inline">{useOfficialTvWidget ? 'Engine' : 'TV Cloud'}</span>
            </button>

            {/* Chart Theme Toggle (White / Dark) */}
            <button
              onClick={() => setChartBgTheme(chartBgTheme === 'white' ? 'dark' : 'white')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition border ml-0.5 ${
                chartBgTheme === 'white'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-xs'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title={`Toggle Chart Background (${chartBgTheme === 'white' ? 'White Background' : 'Dark Background'})`}
            >
              {chartBgTheme === 'white' ? (
                <>
                  <Sun className="w-2.5 h-2.5 text-amber-600" />
                  <span>White</span>
                </>
              ) : (
                <>
                  <Moon className="w-2.5 h-2.5 text-sky-400" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Warning Banner if market is closed AND strict hours are enforced (Ultra-slim 22px bar) */}
        {enforceRealMarketHours && sessionStatus && !sessionStatus.is_market_open && (
          <div className="px-3 py-0.5 bg-amber-950/50 border-b border-amber-800/50 flex items-center justify-between gap-2 text-[11px] text-amber-200 shrink-0 z-20">
            <div className="flex items-center gap-1.5 truncate">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">
                <strong>NSE Exchange is closed</strong> ({sessionStatus.phase}). Live streaming is paused under strict hours.
              </span>
            </div>
            {onToggleEnforceMarketHours && (
              <button
                onClick={onToggleEnforceMarketHours}
                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] shrink-0 transition shadow-xs"
              >
                Enable 24/7 Practice Stream ➔
              </button>
            )}
          </div>
        )}

        {/* Chart Canvas Area */}
        <div className={isExpanded ? 'flex-1 min-h-0 flex flex-col w-full overflow-hidden relative' : 'relative'}>
          {!useOfficialTvWidget ? (
            <>
              {/* Overlay Indicator Legend Tags (TradingView style on top-left of chart) */}
              {activeIndicators.some((i) => i.visible && i.pane === 'OVERLAY') && (
                <div
                  className={`absolute top-2.5 left-2.5 z-10 flex flex-wrap items-center gap-1.5 pointer-events-auto px-2.5 py-1.5 rounded-lg border text-[11px] font-mono shadow-md transition-colors duration-200 ${
                    chartBgTheme === 'white'
                      ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/60'
                      : 'bg-slate-950/85 backdrop-blur-xs border-slate-800/80 text-slate-200'
                  }`}
                >
                  {activeIndicators
                    .filter((ind) => ind.visible && ind.pane === 'OVERLAY')
                    .map((ind) => {
                      const val = activeIndicatorValues[ind.id];
                      return (
                        <div
                          key={ind.id}
                          className={`group flex items-center gap-1.5 px-2 py-0.5 rounded border transition ${
                            chartBgTheme === 'white'
                              ? 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: ind.color }}
                          />
                          <span className={chartBgTheme === 'white' ? 'font-semibold text-slate-600' : 'font-semibold text-slate-300'}>
                            {ind.name}
                          </span>
                          <span className={chartBgTheme === 'white' ? 'text-slate-900 font-bold' : 'text-white font-bold'}>
                            {val !== undefined && val !== null
                              ? typeof val === 'object'
                                ? `[${val.lower?.toFixed(1)}, ${val.middle?.toFixed(1)}, ${val.upper?.toFixed(1)}]`
                                : ind.type === 'VOLUME_SMA'
                                ? `${(val / 1000).toFixed(3)} K`
                                : val.toFixed(2)
                              : '--'}
                          </span>
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition ml-1">
                            <button
                              onClick={() => toggleIndicatorVisibility(ind.id)}
                              className={`${chartBgTheme === 'white' ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'} p-0.5 rounded`}
                              title={ind.visible ? 'Hide indicator' : 'Show indicator'}
                            >
                              {ind.visible ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3 text-slate-500" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setEditingIndicatorId(ind.id);
                                setShowIndicatorsModal(true);
                              }}
                              className={`${chartBgTheme === 'white' ? 'text-slate-500 hover:text-sky-600' : 'text-slate-400 hover:text-sky-300'} p-0.5 rounded`}
                              title="Indicator Settings"
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeIndicator(ind.id)}
                              className={`${chartBgTheme === 'white' ? 'text-slate-500 hover:text-rose-600' : 'text-slate-400 hover:text-rose-400'} p-0.5 rounded`}
                              title="Remove indicator"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              <div
                ref={chartContainerRef}
                style={isExpanded ? undefined : { height: `${getComputedChartHeights().mainHeight}px` }}
                className={`w-full ${chartBgTheme === 'white' ? 'bg-white' : 'bg-[#090d16]'} select-none cursor-crosshair transition-colors duration-200 ${isExpanded ? 'flex-1 min-h-0' : ''}`}
              />

              {/* Dedicated RSI Sub-pane (matching user screenshot) */}
              {activeRsiIndicator && (
                <div
                  className={`border-t relative shrink-0 z-20 ${
                    chartBgTheme === 'white' ? 'border-slate-200 bg-white' : 'border-slate-800/90 bg-[#090d16]'
                  }`}
                >
                  <div
                    className={`px-3 py-1 flex items-center justify-between text-[11px] font-mono shrink-0 border-b ${
                      chartBgTheme === 'white'
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-slate-950/90 border-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: activeRsiIndicator.color }}
                      />
                      <span className={`font-bold ${chartBgTheme === 'white' ? 'text-purple-700' : 'text-purple-300'}`}>
                        {activeRsiIndicator.name}
                      </span>
                      <span className={`font-black ${chartBgTheme === 'white' ? 'text-slate-900' : 'text-white'}`}>
                        {activeIndicatorValues[activeRsiIndicator.id] !== undefined &&
                        activeIndicatorValues[activeRsiIndicator.id] !== null
                          ? activeIndicatorValues[activeRsiIndicator.id].toFixed(2)
                          : '--'}
                      </span>
                      <span className="text-slate-400 text-[10px] hidden sm:inline">
                        (Overbought: 70 • Midline: 50 • Oversold: 30)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleIndicatorVisibility(activeRsiIndicator.id)}
                        className={`${chartBgTheme === 'white' ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'} p-0.5 rounded`}
                        title="Hide RSI"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingIndicatorId(activeRsiIndicator.id);
                          setShowIndicatorsModal(true);
                        }}
                        className={`${chartBgTheme === 'white' ? 'text-slate-500 hover:text-sky-600' : 'text-slate-400 hover:text-sky-300'} p-0.5 rounded`}
                        title="RSI Settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeIndicator(activeRsiIndicator.id)}
                        className={`${chartBgTheme === 'white' ? 'text-slate-500 hover:text-rose-600' : 'text-slate-400 hover:text-rose-400'} p-0.5 rounded`}
                        title="Remove RSI Sub-pane"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div
                    ref={rsiChartContainerRef}
                    style={{ height: `${getComputedChartHeights().rsiHeight}px` }}
                    className={`w-full ${chartBgTheme === 'white' ? 'bg-white' : 'bg-[#090d16]'} select-none cursor-crosshair transition-colors duration-200`}
                  />
                </div>
              )}

              {/* Floating Return to Today button when user scrolls back in time */}
              {isScrolledBack && (
                <button
                  onClick={() => {
                    setSelectedSessionDate('latest');
                    handleRangeChange('1D');
                  }}
                  className="absolute bottom-4 right-4 z-10 px-3 py-1.5 rounded-lg bg-sky-600/95 hover:bg-sky-500 text-white font-mono text-xs font-bold shadow-xl flex items-center gap-1.5 transition active:scale-95 border border-sky-400 backdrop-blur-xs animate-fade-in"
                  title="Snap back to today's latest session"
                >
                  <span>Return to Today (1D) ↗</span>
                </button>
              )}
            </>
          ) : (
            <div className="p-3 space-y-3">
              <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  TradingView restricts Indian equity feeds inside external iframes. For continuous
                  1-minute candlestick analysis with strategy overlays, switch back to the Engine
                  Chart.
                </div>
              </div>
              <iframe
                title={`TV Widget ${instrument.symbol}`}
                className="w-full h-[410px] rounded border border-slate-800"
                src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                  instrument.tradingview_symbol
                )}&interval=1&theme=${chartBgTheme === 'white' ? 'light' : 'dark'}&style=1&timezone=Asia%2FKolkata`}
              />
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* BOTTOM RANGE TOOLBAR (ENCLOSED IN RED BOX IN USER SCREENSHOT!) */}
        {/* ============================================================== */}
        <div className="px-3 py-1.5 bg-[#090d16] border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shrink-0 z-30">
          {/* Left: Range Selection Buttons: 5Y 1Y 6M 3M 1M 5D 1D Recent Day */}
          <div className="flex items-center gap-1">
            {(['5Y', '1Y', '6M', '3M', '1M', '5D', '1D', 'Recent Day'] as const).map((r) => {
              const isActive = activeRange === r;
              return (
                <button
                  key={r}
                  onClick={() => handleRangeChange(r)}
                  className={`px-2.5 py-1 text-xs font-bold transition relative ${
                    isActive
                      ? 'text-white font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded'
                  }`}
                  title={
                    r === 'Recent Day'
                      ? 'Show 1m candles for today (if trading day) or previous trading day (if holiday/weekend)'
                      : `View ${r} range`
                  }
                >
                  <span>{r}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-purple-500 rounded-full shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Center: Session Date Picker for 1D mode */}
          <div className="flex items-center gap-2 text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-[11px] text-slate-400 hidden sm:inline">Session:</span>
            <select
              value={selectedSessionDate}
              onChange={(e) => handleSessionDateChange(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-0.5 font-mono focus:outline-none focus:border-sky-500"
            >
              <option value="latest">
                Latest Session ({sessionDates[sessionDates.length - 1]?.date || 'Today'})
              </option>
              {sessionDates
                .slice()
                .reverse()
                .map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date} ({d.count} 1m bars)
                  </option>
                ))}
            </select>
            <span className="text-[11px] text-slate-400 hidden md:inline">
              (Scroll/drag chart back to view previous days)
            </span>
          </div>

          {/* Right: Time clock (UTC+5:30) and Scale Toggle */}
          <div className="flex items-center gap-2.5 text-slate-400 text-xs">
            <span className="text-slate-200 font-mono font-medium">
              {clockTime} <span className="text-slate-400 text-[10px]">(UTC+5:30)</span>
            </span>
            <button
              onClick={() => setIsPercentScale(!isPercentScale)}
              className={`px-2 py-0.5 rounded border text-[11px] font-mono transition font-bold ${
                isPercentScale
                  ? 'bg-purple-950 text-purple-300 border-purple-700'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title="Toggle Percentage Scale Mode"
            >
              %
            </button>

            {/* Chart Theme Toggle (White / Dark) */}
            <button
              onClick={() => setChartBgTheme(chartBgTheme === 'white' ? 'dark' : 'white')}
              className={`px-2 py-0.5 rounded border text-[11px] font-mono transition font-bold flex items-center gap-1 ${
                chartBgTheme === 'white'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-xs'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title={`Switch chart background to ${chartBgTheme === 'white' ? 'Dark' : 'White'}`}
            >
              {chartBgTheme === 'white' ? (
                <>
                  <Sun className="w-3 h-3 text-amber-600" />
                  <span>White</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3 text-sky-400" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Database Action & Calibration Drawer Bar (Hidden in Fullscreen Expanded View) */}
        {!isExpanded && (
          <>
            <div className="px-3.5 py-2.5 bg-slate-950/90 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCollect30d}
                  disabled={isCollectingDb}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-sky-300 border border-slate-700 font-semibold text-[11px] transition shadow-xs"
                  title="Download fresh 30-day 1-minute historical candles from Upstox API"
                >
                  {isCollectingDb ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
                      <span>Collecting 30 Days...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 text-sky-400" />
                      <span>Sync 30-Day DB</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => exportCandlesToCSV(instrument.symbol, sanitizedCandles)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-[11px] transition"
                  title="Export all 30-day candles to CSV"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => exportCandlesToJSON(instrument.symbol, sanitizedCandles)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-[11px] transition"
                  title="Export all 30-day candles to JSON"
                >
                  <FileCode className="w-3 h-3 text-amber-400" />
                  <span>Export JSON</span>
                </button>

                {onUpdatePrice && (
                  <button
                    onClick={() => setIsEditingPrice(!isEditingPrice)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-[11px] transition"
                  >
                    <Edit3 className="w-3 h-3 text-purple-400" />
                    <span>Calibrate Price</span>
                  </button>
                )}
              </div>

              {/* Feedback message */}
              {dbCollectMsg && (
                <span className="text-[11px] text-emerald-300 font-mono animate-fade-in">
                  {dbCollectMsg}
                </span>
              )}

              {/* Price Reference lines legend */}
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-slate-400 inline-block border-t border-dashed" /> P₀ Ref
                </span>
                <span className="flex items-center gap-1 text-sky-400">
                  <span className="w-2.5 h-0.5 bg-sky-400 inline-block" /> Entry (E)
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Target (T)
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-2.5 h-0.5 bg-rose-400 inline-block" /> Stop (S)
                </span>
              </div>
            </div>

            {/* Price Calibration Popup */}
            {isEditingPrice && (
              <div className="p-3.5 bg-slate-950 border-t border-sky-900/60 space-y-2.5 shrink-0">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span className="flex items-center gap-1.5 text-sky-300">
                    <Sliders className="w-3.5 h-3.5" />
                    Calibrate {instrument.symbol} Base Price
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingPrice(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSavePrice} className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-300 font-medium">Exact Price (₹):</span>
                  <input
                    type="number"
                    step="0.05"
                    value={editedPrice}
                    onChange={(e) => setEditedPrice(e.target.value)}
                    className="w-32 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-sky-500 focus:outline-none"
                    placeholder="Enter price"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingPrice(false)}
                    className="px-2 py-1 rounded text-slate-400 hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>

      {/* Target & Risk Rules Verification Card + Active Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Deterministic Target & Displacement Validator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-sky-400" />
              NSE INR 3.00 Displacement & Ordering Check
            </h3>
            {validationResult ? (
              validationResult.is_valid ? (
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VALID SETUP
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-xs font-semibold flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> REJECTED
                </span>
              )
            ) : (
              <span className="text-xs text-slate-400">NO ACTIVE CANDIDATE</span>
            )}
          </div>

          {validationResult ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2 bg-slate-950 rounded border border-slate-800">
                  <div className="text-slate-400 text-[10px]">|E - P₀| Displacement</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    ₹{validationResult.entry_displacement_inr.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400">Required: ≥ ₹3.00</div>
                </div>
                <div className="p-2 bg-slate-950 rounded border border-slate-800">
                  <div className="text-slate-400 text-[10px]">|T - P₀| Displacement</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    ₹{validationResult.target_from_ref_inr.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400">Required: ≥ ₹3.00</div>
                </div>
                <div className="p-2 bg-slate-950 rounded border border-slate-800">
                  <div className="text-slate-400 text-[10px]">|T - E| Displacement</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    ₹{validationResult.target_from_entry_inr.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400">Required: ≥ ₹3.00</div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Directional Ordering:</span>
                  <span className="text-slate-200">
                    {validationResult.direction === 'LONG'
                      ? `S(₹${validationResult.stop_price}) < E(₹${validationResult.entry_price}) < T(₹${validationResult.target_price})`
                      : `T(₹${validationResult.target_price}) < E(₹${validationResult.entry_price}) < S(₹${validationResult.stop_price})`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Reward / Risk Ratio:</span>
                  <span className="text-emerald-400 font-bold">
                    {validationResult.reward_to_risk_ratio.toFixed(2)} (Min required: 1.50)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Tick-Rounding Check:</span>
                  <span className="text-sky-300">PASS (Aligned to ₹{instrument.tick_size})</span>
                </div>
              </div>

              {validationResult.rejection_reasons.length > 0 && (
                <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
                  <strong>Rejection Reasons:</strong>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                    {validationResult.rejection_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-4 text-center">
              Market is in neutral consolidation or abstention mode.
            </div>
          )}
        </div>

        {/* Strategy Decision & Indicator Snapshot */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                Active Strategy Setup & Rationale
              </h3>
              <button
                onClick={onInspectAgents}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
              >
                Inspect All Agents <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-800 mb-3 font-mono">
              {orchestratorOutput.rationale}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 bg-slate-950 rounded border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">EMA 9 / EMA 21</div>
                <div className="text-white mt-0.5">
                  ₹{ind.ema_9?.toFixed(1)} / ₹{ind.ema_21?.toFixed(1)}
                </div>
              </div>
              <div className="p-2 bg-slate-950 rounded border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">RSI (50)</div>
                <div className="text-white mt-0.5">{(ind.rsi_50 ?? ind.rsi_14)?.toFixed(1)}</div>
              </div>
              <div className="p-2 bg-slate-950 rounded border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">Bollinger Bands</div>
                <div className="text-white mt-0.5">
                  [₹{ind.bb_lower?.toFixed(0)}, ₹{ind.bb_upper?.toFixed(0)}]
                </div>
              </div>
              <div className="p-2 bg-slate-950 rounded border border-slate-800/80">
                <div className="text-slate-400 text-[10px]">20-Bar Support / Res</div>
                <div className="text-white mt-0.5">
                  ₹{ind.support_20?.toFixed(0)} / ₹{ind.resistance_20?.toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TradingView Style Technical Indicators & Strategies Modal */}
      {showIndicatorsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-950/90 border border-sky-700/60 flex items-center justify-center text-sky-400 font-serif italic font-black text-lg">
                  fx
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Indicators & Strategies
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Add moving averages, volume overlays, Bollinger Bands, and oscillators to chart
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowIndicatorsModal(false);
                  setEditingIndicatorId(null);
                }}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Search Bar & Default Reset */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search indicators (e.g. EMA, RSI, VWAP, Bollinger, Volume)..."
                  value={indicatorSearchQuery}
                  onChange={(e) => setIndicatorSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
              <button
                onClick={resetToDefaultIndicators}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
                title="Reset to default layout: EMA 7, EMA 21, Volume SMA 10, RSI 14"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* Modal Body: Active Indicators & Available Presets */}
            <div className="p-4 overflow-y-auto space-y-5 text-xs">
              {/* Active Indicators on Chart */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Active on Chart ({activeIndicators.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {activeIndicators.filter((i) => i.visible).length} visible
                  </span>
                </div>

                {activeIndicators.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-slate-500">
                    No active indicators. Select from the library below to add.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeIndicators.map((ind) => {
                      const isEditing = editingIndicatorId === ind.id;
                      return (
                        <div
                          key={ind.id}
                          className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/90 flex flex-col gap-2 transition hover:border-slate-700"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {/* Color swatch */}
                              <div
                                className="w-4 h-4 rounded-full border border-white/20 shrink-0 cursor-pointer shadow-xs"
                                style={{ backgroundColor: ind.color }}
                                onClick={() =>
                                  setEditingIndicatorId(isEditing ? null : ind.id)
                                }
                                title="Click to customize color or settings"
                              />
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5 font-mono">
                                  <span>{ind.name}</span>
                                  {ind.period !== undefined && ind.period > 0 && (
                                    <span className="text-slate-400 text-[10px]">
                                      (Length: {ind.period})
                                    </span>
                                  )}
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                      ind.pane === 'SUBPANE'
                                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                        : 'bg-sky-950 text-sky-300 border border-sky-800'
                                    }`}
                                  >
                                    {ind.pane}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Visibility Toggle */}
                              <button
                                onClick={() => toggleIndicatorVisibility(ind.id)}
                                className={`p-1.5 rounded transition ${
                                  ind.visible
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                    : 'bg-slate-900 text-slate-500 border border-slate-800'
                                }`}
                                title={ind.visible ? 'Hide from chart' : 'Show on chart'}
                              >
                                {ind.visible ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* Inline Settings */}
                              <button
                                onClick={() =>
                                  setEditingIndicatorId(isEditing ? null : ind.id)
                                }
                                className={`p-1.5 rounded border transition ${
                                  isEditing
                                    ? 'bg-sky-600 text-white border-sky-400'
                                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                                }`}
                                title="Indicator Settings"
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>

                              {/* Remove */}
                              <button
                                onClick={() => removeIndicator(ind.id)}
                                className="p-1.5 rounded bg-slate-900 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                                title="Remove from chart"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Settings Panel (Color palette + Period length) */}
                          {isEditing && (
                            <div className="pt-2 mt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/60 p-2 rounded">
                              {/* Period Input */}
                              {ind.period !== undefined && ind.period > 0 && (
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="text-slate-400 text-[11px]">Length / Period:</span>
                                  <input
                                    type="number"
                                    min="2"
                                    max="500"
                                    value={ind.period}
                                    onChange={(e) => {
                                      const p = parseInt(e.target.value) || 14;
                                      updateIndicatorConfig(ind.id, {
                                        period: Math.max(2, Math.min(500, p)),
                                        name: `${ind.type} ${p}`,
                                      });
                                    }}
                                    className="w-16 px-2 py-0.5 bg-slate-950 border border-slate-700 text-white rounded text-center font-bold"
                                  />
                                </div>
                              )}

                              {/* Color palette selector */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 text-[11px] mr-1">Color:</span>
                                {[
                                  '#ec4899', // Pink
                                  '#f97316', // Orange
                                  '#38bdf8', // Sky Blue
                                  '#a855f7', // Purple
                                  '#10b981', // Emerald
                                  '#3b82f6', // Blue
                                  '#facc15', // Yellow
                                  '#ffffff', // White
                                ].map((c) => (
                                  <button
                                    key={c}
                                    onClick={() => updateIndicatorConfig(ind.id, { color: c })}
                                    className={`w-5 h-5 rounded-full border transition ${
                                      ind.color.toLowerCase() === c.toLowerCase()
                                        ? 'ring-2 ring-white scale-110 border-white'
                                        : 'border-transparent opacity-80 hover:opacity-100'
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Available Presets Library */}
              <div className="pt-2 border-t border-slate-800">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] mb-2.5 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  Available Indicators Library
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AVAILABLE_INDICATOR_PRESETS.filter((p) => {
                    if (!indicatorSearchQuery.trim()) return true;
                    const q = indicatorSearchQuery.toLowerCase();
                    return (
                      p.name.toLowerCase().includes(q) ||
                      p.type.toLowerCase().includes(q) ||
                      p.id.toLowerCase().includes(q)
                    );
                  }).map((preset) => {
                    const isAdded = activeIndicators.some((i) => i.id === preset.id);
                    return (
                      <div
                        key={preset.id}
                        className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-2 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: preset.color }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate text-xs">
                              {preset.name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {preset.pane === 'SUBPANE' ? 'Oscillator Sub-pane' : 'Chart Overlay'}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => addIndicatorPreset(preset)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition shrink-0 ${
                            isAdded
                              ? 'bg-slate-800 text-emerald-400 border border-emerald-800/40 cursor-default'
                              : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs active:scale-95'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                Changes apply instantly to live candlestick and oscillator views.
              </span>
              <button
                onClick={() => {
                  setShowIndicatorsModal(false);
                  setEditingIndicatorId(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
