import { Candle } from '../types/platform';

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface ActiveIndicatorConfig {
  id: string;
  name: string;
  type: 'EMA' | 'SMA' | 'RSI' | 'VWAP' | 'BOLLINGER' | 'VOLUME_SMA' | 'MACD';
  period?: number;
  color: string;
  visible: boolean;
  pane: 'OVERLAY' | 'SUBPANE';
  params?: Record<string, number>;
}

export const DEFAULT_ACTIVE_INDICATORS: ActiveIndicatorConfig[] = [
  {
    id: 'ema-7',
    name: 'EMA 7',
    type: 'EMA',
    period: 7,
    color: '#ec4899', // Pink/magenta as in screenshot
    visible: true,
    pane: 'OVERLAY',
  },
  {
    id: 'ema-21',
    name: 'EMA 21',
    type: 'EMA',
    period: 21,
    color: '#f97316', // Orange line
    visible: true,
    pane: 'OVERLAY',
  },
  {
    id: 'vol-sma-10',
    name: 'Volume 10 SMA',
    type: 'VOLUME_SMA',
    period: 10,
    color: '#38bdf8', // Sky blue line
    visible: true,
    pane: 'OVERLAY',
  },
  {
    id: 'rsi-14',
    name: 'RSI 14',
    type: 'RSI',
    period: 14,
    color: '#a855f7', // Purple oscillator as in screenshot
    visible: true,
    pane: 'SUBPANE',
  },
];

export const AVAILABLE_INDICATOR_PRESETS = [
  { id: 'rsi-14', name: 'RSI (Relative Strength Index 14)', type: 'RSI', period: 14, color: '#a855f7', pane: 'SUBPANE' },
  { id: 'rsi-50', name: 'RSI (Relative Strength Index 50)', type: 'RSI', period: 50, color: '#c084fc', pane: 'SUBPANE' },
  { id: 'ema-7', name: 'EMA 7 (Fast)', type: 'EMA', period: 7, color: '#ec4899', pane: 'OVERLAY' },
  { id: 'ema-9', name: 'EMA 9 (Momentum)', type: 'EMA', period: 9, color: '#06b6d4', pane: 'OVERLAY' },
  { id: 'ema-21', name: 'EMA 21 (Trend Baseline)', type: 'EMA', period: 21, color: '#f97316', pane: 'OVERLAY' },
  { id: 'sma-20', name: 'SMA 20 (Mean)', type: 'SMA', period: 20, color: '#10b981', pane: 'OVERLAY' },
  { id: 'sma-50', name: 'SMA 50 (Intermediate)', type: 'SMA', period: 50, color: '#3b82f6', pane: 'OVERLAY' },
  { id: 'sma-200', name: 'SMA 200 (Long-term Institutional)', type: 'SMA', period: 200, color: '#eab308', pane: 'OVERLAY' },
  { id: 'vwap', name: 'VWAP (Session Volume Weighted Average)', type: 'VWAP', period: 0, color: '#facc15', pane: 'OVERLAY' },
  { id: 'bb-20', name: 'Bollinger Bands (20, 2σ)', type: 'BOLLINGER', period: 20, color: '#6366f1', pane: 'OVERLAY' },
  { id: 'vol-sma-10', name: 'Volume SMA 10 (Volume Moving Average)', type: 'VOLUME_SMA', period: 10, color: '#38bdf8', pane: 'OVERLAY' },
  { id: 'macd', name: 'MACD (12, 26, 9)', type: 'MACD', period: 12, color: '#3b82f6', pane: 'SUBPANE' },
];

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (!candles || candles.length < period) return [];
  const k = 2 / (period + 1);
  const result: IndicatorPoint[] = [];

  // Initialize with SMA for the first period
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let prevEma = sum / period;
  result.push({ time: candles[period - 1].time, value: Number(prevEma.toFixed(2)) });

  for (let i = period; i < candles.length; i++) {
    const currentClose = candles[i].close;
    const currentEma = currentClose * k + prevEma * (1 - k);
    result.push({ time: candles[i].time, value: Number(currentEma.toFixed(2)) });
    prevEma = currentEma;
  }

  return result;
}

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (!candles || candles.length < period) return [];
  const result: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
      result.push({ time: candles[i].time, value: Number((sum / period).toFixed(2)) });
    } else if (i === period - 1) {
      result.push({ time: candles[i].time, value: Number((sum / period).toFixed(2)) });
    }
  }

  return result;
}

/**
 * Volume Simple Moving Average
 */
export function calculateVolumeSMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (!candles || candles.length < period) return [];
  const result: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].volume;
    if (i >= period) {
      sum -= candles[i - period].volume;
      result.push({ time: candles[i].time, value: Math.round(sum / period) });
    } else if (i === period - 1) {
      result.push({ time: candles[i].time, value: Math.round(sum / period) });
    }
  }

  return result;
}

/**
 * Wilder's smoothed Relative Strength Index (RSI)
 */
export function calculateRSI(candles: Candle[], period: number = 14): IndicatorPoint[] {
  if (!candles || candles.length <= period) return [];
  const result: IndicatorPoint[] = [];

  let gains = 0;
  let losses = 0;

  // Initial sum for first period
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRs);
  result.push({ time: candles[period].time, value: Number(firstRsi.toFixed(2)) });

  // Wilder's smoothing for subsequent candles
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    result.push({ time: candles[i].time, value: Number(rsi.toFixed(2)) });
  }

  return result;
}

/**
 * Session Volume-Weighted Average Price (VWAP)
 */
export function calculateVWAP(candles: Candle[]): IndicatorPoint[] {
  if (!candles || candles.length === 0) return [];
  const result: IndicatorPoint[] = [];

  let currentDay = '';
  let cumulativePV = 0;
  let cumulativeV = 0;

  for (const c of candles) {
    const dStr = new Date(c.time * 1000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });

    if (dStr !== currentDay) {
      currentDay = dStr;
      cumulativePV = 0;
      cumulativeV = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeV += c.volume;

    const vwap = cumulativeV > 0 ? cumulativePV / cumulativeV : typicalPrice;
    result.push({ time: c.time, value: Number(vwap.toFixed(2)) });
  }

  return result;
}

/**
 * Bollinger Bands (Period, StdDevMultiplier)
 */
export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): {
  upper: IndicatorPoint[];
  lower: IndicatorPoint[];
  middle: IndicatorPoint[];
} {
  if (!candles || candles.length < period) {
    return { upper: [], lower: [], middle: [] };
  }

  const middle = calculateSMA(candles, period);
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  const timeToIndex = new Map<number, number>();
  candles.forEach((c, idx) => timeToIndex.set(c.time, idx));

  for (const mid of middle) {
    const idx = timeToIndex.get(mid.time);
    if (idx === undefined || idx < period - 1) continue;

    const slice = candles.slice(idx - period + 1, idx + 1);
    const mean = mid.value;
    const variance =
      slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper.push({ time: mid.time, value: Number((mean + stdDevMultiplier * stdDev).toFixed(2)) });
    lower.push({ time: mid.time, value: Number((mean - stdDevMultiplier * stdDev).toFixed(2)) });
  }

  return { upper, lower, middle };
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): {
  macdLine: IndicatorPoint[];
  signalLine: IndicatorPoint[];
  histogram: { time: number; value: number; color: string }[];
} {
  if (!candles || candles.length < slowPeriod) {
    return { macdLine: [], signalLine: [], histogram: [] };
  }

  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  const slowMap = new Map<number, number>();
  slowEma.forEach((p) => slowMap.set(p.time, p.value));

  const macdRaw: IndicatorPoint[] = [];
  for (const f of fastEma) {
    const sVal = slowMap.get(f.time);
    if (sVal !== undefined) {
      macdRaw.push({ time: f.time, value: Number((f.value - sVal).toFixed(2)) });
    }
  }

  if (macdRaw.length < signalPeriod) {
    return { macdLine: macdRaw, signalLine: [], histogram: [] };
  }

  // Calculate EMA of macdRaw for signal line
  const k = 2 / (signalPeriod + 1);
  let sum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    sum += macdRaw[i].value;
  }
  let prevSignal = sum / signalPeriod;

  const signalLine: IndicatorPoint[] = [];
  signalLine.push({ time: macdRaw[signalPeriod - 1].time, value: Number(prevSignal.toFixed(2)) });

  for (let i = signalPeriod; i < macdRaw.length; i++) {
    const curVal = macdRaw[i].value;
    const curSignal = curVal * k + prevSignal * (1 - k);
    signalLine.push({ time: macdRaw[i].time, value: Number(curSignal.toFixed(2)) });
    prevSignal = curSignal;
  }

  const signalMap = new Map<number, number>();
  signalLine.forEach((p) => signalMap.set(p.time, p.value));

  const histogram: { time: number; value: number; color: string }[] = [];
  for (const m of macdRaw) {
    const sig = signalMap.get(m.time);
    if (sig !== undefined) {
      const histVal = Number((m.value - sig).toFixed(2));
      histogram.push({
        time: m.time,
        value: histVal,
        color: histVal >= 0 ? '#10b981' : '#ef4444',
      });
    }
  }

  return { macdLine: macdRaw, signalLine, histogram };
}
