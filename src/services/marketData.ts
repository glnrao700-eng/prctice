import { Candle, InstrumentConfig, NewsItem, SessionStatus } from '../types/platform';
import { roundToTick } from './targetValidator';
import { isTradingDay } from './nseCalendar';

export const LATEST_MARKET_REFERENCE_PRICES: Record<string, number> = {
  RELIANCE: 1202.0,
  TCS: 2460.9,
  HDFCBANK: 712.0,
  INFY: 1130.7,
  ICICIBANK: 1381.0,
  SBIN: 973.7,
};

export const DEFAULT_INSTRUMENTS: InstrumentConfig[] = [
  {
    instrument_id: 'NSE_RELIANCE',
    company_name: 'Reliance Industries Limited',
    exchange: 'NSE',
    symbol: 'RELIANCE',
    provider_token: '738561',
    tradingview_symbol: 'NSE:RELIANCE',
    upstox_instrument_key: 'NSE_EQ|INE002A01018',
    currency: 'INR',
    tick_size: 0.05,
    lot_size: 1,
    enabled: true,
    sector: 'ENERGY_CONGLOMERATE',
    historical_coverage_from: '2018-01-01',
    base_demo_price: 1202.0,
  },
  {
    instrument_id: 'NSE_TCS',
    company_name: 'Tata Consultancy Services Limited',
    exchange: 'NSE',
    symbol: 'TCS',
    provider_token: '2953217',
    tradingview_symbol: 'NSE:TCS',
    upstox_instrument_key: 'NSE_EQ|INE467B01029',
    currency: 'INR',
    tick_size: 0.05,
    lot_size: 1,
    enabled: true,
    sector: 'IT_SERVICES',
    historical_coverage_from: '2018-01-01',
    base_demo_price: 2460.9,
  },
  {
    instrument_id: 'NSE_HDFCBANK',
    company_name: 'HDFC Bank Limited',
    exchange: 'NSE',
    symbol: 'HDFCBANK',
    provider_token: '341249',
    tradingview_symbol: 'NSE:HDFCBANK',
    upstox_instrument_key: 'NSE_EQ|INE040A01034',
    currency: 'INR',
    tick_size: 0.05,
    lot_size: 1,
    enabled: true,
    sector: 'BANKING',
    historical_coverage_from: '2018-01-01',
    base_demo_price: 712.0,
  },
  {
    instrument_id: 'NSE_INFY',
    company_name: 'Infosys Limited',
    exchange: 'NSE',
    symbol: 'INFY',
    provider_token: '408065',
    tradingview_symbol: 'NSE:INFY',
    upstox_instrument_key: 'NSE_EQ|INE009A01021',
    currency: 'INR',
    tick_size: 0.05,
    lot_size: 1,
    enabled: true,
    sector: 'IT_SERVICES',
    historical_coverage_from: '2018-01-01',
    base_demo_price: 1130.7,
  },
  {
    instrument_id: 'NSE_ICICIBANK',
    company_name: 'ICICI Bank Limited',
    exchange: 'NSE',
    symbol: 'ICICIBANK',
    provider_token: '1270529',
    tradingview_symbol: 'NSE:ICICIBANK',
    upstox_instrument_key: 'NSE_EQ|INE090A01021',
    currency: 'INR',
    tick_size: 0.05,
    lot_size: 1,
    enabled: true,
    sector: 'BANKING',
    historical_coverage_from: '2018-01-01',
    base_demo_price: 1381.0,
  },
  {
    instrument_id: 'NSE_SBIN',
    company_name: 'State Bank of India',
    exchange: 'NSE',
    symbol: 'SBIN',
    provider_token: '779521',
    tradingview_symbol: 'NSE:SBIN',
    upstox_instrument_key: 'NSE_EQ|INE062A01020',
    currency: 'INR',
    tick_size: 0.05,
    lot_size: 1,
    enabled: true,
    sector: 'BANKING',
    historical_coverage_from: '2018-01-01',
    base_demo_price: 973.7,
  },
];

export function getLastTradingBarTimestamp(
  sessionDate: string,
  isMarketOpen: boolean,
  timeframe: '1m' | '5m' | '15m' = '1m'
): number {
  const [yr, mo, da] = sessionDate.split('-').map(Number);
  const now = new Date();
  const tfSeconds = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 900;

  // NSE regular trading session closes at 15:30:00 IST.
  // The terminal trading bar of the day is 15:29:00 IST (for 1m), 15:25 (for 5m), 15:15 (for 15m).
  // 15:29:00 IST = 09:59:00 UTC (15:29 - 5:30 = 09:59 UTC)
  const closeMinuteUtc = timeframe === '1m' ? 59 : timeframe === '5m' ? 55 : 45;
  const sessionCloseUtc = Math.floor(Date.UTC(yr, mo - 1, da, 9, closeMinuteUtc, 0) / 1000);

  // If market is currently open in IST (between 09:15 and 15:30 IST on a trading day)
  if (isMarketOpen) {
    const epochSec = Math.floor(now.getTime() / 1000);
    const currentBucketSec = epochSec - (epochSec % tfSeconds);
    // Hard ceiling: even during market hours, candle timestamp CANNOT exceed the current clock minute
    // and CANNOT exceed official session close (15:29:00 IST).
    return Math.min(currentBucketSec, sessionCloseUtc);
  }

  // When market is closed, the last completed candle corresponds strictly to the official NSE close:
  return sessionCloseUtc;
}

// Pseudo-random deterministic generator based on a string seed and integer step
function pseudoRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 997 + index * 101.37) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate sequential trading bar timestamps strictly inside NSE regular market hours
 * (09:15:00 IST to 15:29:00 IST, Monday-Friday, skipping weekends & NSE holidays).
 * Guarantees zero timestamps in the future beyond current live clock and zero timestamps past 15:29 IST.
 */
export function generateNseTradingTimestamps(
  barsCount: number,
  timeframe: '1m' | '5m' | '15m' = '1m',
  _stepOffset: number = 0,
  sessionStatus?: SessionStatus
): number[] {
  const tfSeconds = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 900;

  // Determine anchor UTC timestamp: strictly capped at latest valid trading bar
  const sessionDate = sessionStatus?.session_date || new Date().toISOString().split('T')[0];
  const isMarketOpen = Boolean(sessionStatus?.is_market_open);
  const anchorSec = getLastTradingBarTimestamp(sessionDate, isMarketOpen, timeframe);

  // Convert to IST to inspect trading minute
  const timestamps: number[] = [];
  let curUtcMs = anchorSec * 1000;
  let safetyLoop = 0;
  const maxLoops = barsCount * 10;

  while (timestamps.length < barsCount && safetyLoop++ < maxLoops) {
    const istMs = curUtcMs + 5.5 * 3600 * 1000;
    const ist = new Date(istMs);
    const yr = ist.getUTCFullYear();
    const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const da = String(ist.getUTCDate()).padStart(2, '0');
    const dateStr = `${yr}-${mo}-${da}`;
    const hours = ist.getUTCHours();
    const mins = ist.getUTCMinutes();
    const minOfDay = hours * 60 + mins;

    // Check if within trading hours (09:15 to 15:29 IST) on a trading day
    if (isTradingDay(dateStr) && minOfDay >= 9 * 60 + 15 && minOfDay <= 15 * 60 + 29) {
      timestamps.push(Math.floor(curUtcMs / 1000));
      curUtcMs -= tfSeconds * 1000;
    } else {
      // If before 09:15 IST, roll back to 15:29 IST of the previous trading day
      if (minOfDay < 9 * 60 + 15) {
        let prevDay = new Date(curUtcMs - 86400000);
        while (true) {
          const pIst = new Date(prevDay.getTime() + 5.5 * 3600 * 1000);
          const pStr = `${pIst.getUTCFullYear()}-${String(pIst.getUTCMonth() + 1).padStart(2, '0')}-${String(pIst.getUTCDate()).padStart(2, '0')}`;
          if (isTradingDay(pStr)) {
            const closeMin = timeframe === '1m' ? 59 : timeframe === '5m' ? 55 : 45;
            curUtcMs = Date.UTC(pIst.getUTCFullYear(), pIst.getUTCMonth(), pIst.getUTCDate(), 9, closeMin, 0);
            break;
          }
          prevDay = new Date(prevDay.getTime() - 86400000);
        }
      } else {
        curUtcMs -= tfSeconds * 1000;
      }
    }
  }

  // Reverse so oldest timestamp is first and latest is at the end
  return timestamps.reverse();
}

export function generateHistoricalCandles(
  instrument: InstrumentConfig,
  timeframe: '1m' | '5m' | '15m' = '1m',
  barsCount: number = 90,
  stepOffset: number = 0,
  sessionStatus?: SessionStatus
): Candle[] {
  const base = instrument.base_demo_price;
  const seed = instrument.symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const tfSeconds = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 900;

  // Generate valid NSE trading session timestamps
  const barTimes = generateNseTradingTimestamps(barsCount, timeframe, stepOffset, sessionStatus);
  const actualCount = barTimes.length;
  const lastIndex = actualCount - 1;

  // Volatility scale per bar in Rupees based on stock price and timeframe
  const tfMultiplier = timeframe === '1m' ? 1 : timeframe === '5m' ? 2.1 : 3.6;
  const barVolRup = Math.max(instrument.tick_size * 2, (base * 0.00065) * tfMultiplier);

  // Terminal price: matches base demo price exactly, or progresses with step drift
  const stepDrift = stepOffset > 0 ? (stepOffset * 0.12 * (seed % 2 === 1 ? 1 : -0.7)) : 0;
  const terminalPrice = roundToTick(base + stepDrift, instrument.tick_size);

  // Mean-reverting price walk backwards from terminal price:
  // This guarantees smooth continuity across all bars, with natural intraday waves
  // and NO accumulated artificial drift that causes price cliff gaps.
  const closePrices: number[] = new Array(actualCount);
  closePrices[lastIndex] = terminalPrice;

  let currentPrice = terminalPrice;
  for (let i = lastIndex - 1; i >= 0; i--) {
    const r1 = pseudoRandom(seed, i * 7 + 1);
    const r2 = pseudoRandom(seed, i * 11 + 3);

    // If crossing an overnight boundary between trading sessions, add a slight overnight gap (±0.15%)
    const isNewDayBoundary =
      i < lastIndex - 1 && barTimes[i + 1] - barTimes[i] > 3600;
    const overnightGap = isNewDayBoundary
      ? (pseudoRandom(seed, i * 13 + 9) - 0.5) * (base * 0.003)
      : 0;

    // Smooth wave with mean-reversion pull towards base so price stays naturally within ±1.5% channel
    const cycle = Math.sin(i / 10 + (seed % 7)) * 0.35;
    const meanReversionPull = (base - currentPrice) * 0.012;
    const delta = (r1 - 0.5 + cycle * 0.3) * barVolRup + meanReversionPull + overnightGap;

    currentPrice = roundToTick(currentPrice - delta, instrument.tick_size);

    // Realistic bounds: keep within ±2.0% of base
    const maxDev = base * 0.02;
    if (currentPrice > base + maxDev) currentPrice = base + maxDev - r2 * barVolRup;
    if (currentPrice < base - maxDev) currentPrice = base - maxDev + r2 * barVolRup;

    closePrices[i] = roundToTick(currentPrice, instrument.tick_size);
  }

  const candles: Candle[] = [];

  for (let i = 0; i < actualCount; i++) {
    const barTime = barTimes[i];
    const closeVal = closePrices[i];

    // Open is typically close of previous bar + micro-gap
    let openVal: number;
    if (i === 0) {
      const prevRand = pseudoRandom(seed, i * 13 + 7);
      openVal = closeVal - (prevRand - 0.48) * (barVolRup * 0.5);
    } else {
      const isSessionOpen = barTimes[i] - barTimes[i - 1] > 3600;
      if (isSessionOpen) {
        // Natural overnight session open gap
        const sessionGap = (pseudoRandom(seed, i * 17 + 2) - 0.5) * (barVolRup * 0.8);
        openVal = closePrices[i - 1] + sessionGap;
      } else {
        const microGap = (pseudoRandom(seed, i * 17 + 2) - 0.5) * (barVolRup * 0.2);
        openVal = closePrices[i - 1] + microGap;
      }
    }

    // High and Low wicks with realistic distribution
    const upperBody = Math.max(openVal, closeVal);
    const lowerBody = Math.min(openVal, closeVal);
    const bodySize = upperBody - lowerBody;

    const rWickUp = pseudoRandom(seed, i * 23 + 4);
    const rWickDown = pseudoRandom(seed, i * 29 + 8);

    const upperWick = Math.max(instrument.tick_size, rWickUp * (barVolRup * 0.75) + bodySize * 0.15);
    const lowerWick = Math.max(instrument.tick_size, rWickDown * (barVolRup * 0.75) + bodySize * 0.15);

    const highVal = upperBody + upperWick;
    const lowVal = lowerBody - lowerWick;

    // Volume: higher volume at opening bells, turning points, and session closes
    const isFirst30m = i < 30 || (i > 0 && barTimes[i] - barTimes[i - 1] > 3600);
    const baseVol = 35000 + (seed * 117) % 25000;
    const openMultiplier = isFirst30m ? 1.6 : 1.0;
    const volSurge = (bodySize / barVolRup) * 16000;
    const volNoise = pseudoRandom(seed, i * 31) * 12000;
    const vol = Math.floor((baseVol + volSurge + volNoise) * tfMultiplier * openMultiplier);

    const roundedOpen = roundToTick(openVal, instrument.tick_size);
    const roundedClose = roundToTick(closeVal, instrument.tick_size);
    const roundedHigh = roundToTick(Math.max(roundedOpen, roundedClose, highVal), instrument.tick_size);
    const roundedLow = roundToTick(Math.min(roundedOpen, roundedClose, lowVal), instrument.tick_size);

    candles.push({
      time: barTime,
      open: roundedOpen,
      high: roundedHigh,
      low: roundedLow,
      close: roundedClose,
      volume: vol,
    });
  }

  return candles;
}

export function fetchNewsAndSocial(instrument: InstrumentConfig, now: Date = new Date()): NewsItem[] {
  const seed = instrument.symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const isBullish = seed % 2 === 1;

  return [
    {
      source_id: `NSE-FILING-${instrument.symbol}-01`,
      source_type: 'EXCHANGE_FILING',
      quality_tier: 'TIER_1_VERIFIED',
      headline: isBullish
        ? `${instrument.company_name} secures ₹4,800 Cr institutional order; operating margin expands 140 bps`
        : `${instrument.company_name} files disclosure on temporary production recalibration & raw material cost pressure`,
      published_at: new Date(now.getTime() - 22 * 60000).toISOString(),
      sentiment_score: isBullish ? 0.68 : -0.58,
      relevance: 0.92,
      impact_horizon: 'INTRADAY_TO_MULTI_DAY',
    },
    {
      source_id: `SOCIAL-FIN-${instrument.symbol}-02`,
      source_type: 'SOCIAL_MEDIA',
      quality_tier: 'TIER_3_UNVERIFIED_SOCIAL',
      headline: isBullish
        ? `Heavy call buying noted in ${instrument.symbol} ATM strike near key VWAP support`
        : `Unusual put buildup in ${instrument.symbol} front-month contracts`,
      published_at: new Date(now.getTime() - 11 * 60000).toISOString(),
      sentiment_score: isBullish ? 0.35 : -0.25,
      relevance: 0.6,
      impact_horizon: 'INTRADAY',
    },
  ];
}

export function fetchFundamentals(instrument: InstrumentConfig): Record<string, any> {
  if (instrument.sector === 'BANKING') {
    const isTopTier = instrument.symbol === 'HDFCBANK' || instrument.symbol === 'ICICIBANK';
    return {
      sector_model: 'BANKING_FINANCIALS',
      fiscal_period: 'Q2-FY2026',
      published_date: '2026-07-20',
      net_interest_margin_pct: isTopTier ? 3.85 : 3.45,
      gnpa_pct: isTopTier ? 1.28 : 2.15,
      nnpa_pct: isTopTier ? 0.38 : 0.55,
      capital_adequacy_crar_pct: isTopTier ? 18.6 : 15.8,
      casa_ratio_pct: 42.1,
      roe_pct: isTopTier ? 17.2 : 14.8,
      pe_ratio: isTopTier ? 19.2 : 11.5,
      pb_ratio: isTopTier ? 2.8 : 1.4,
      upcoming_earnings_within_2_days: false,
    };
  }

  return {
    sector_model: 'CORPORATE_INDUSTRIAL_IT',
    fiscal_period: 'Q2-FY2026',
    published_date: '2026-07-18',
    revenue_yoy_growth_pct: 12.4,
    operating_margin_pct: instrument.sector === 'IT_SERVICES' ? 24.8 : 17.2,
    roe_pct: instrument.sector === 'IT_SERVICES' ? 29.1 : 15.4,
    roce_pct: instrument.sector === 'IT_SERVICES' ? 33.4 : 16.8,
    debt_to_equity: instrument.sector === 'IT_SERVICES' ? 0.06 : 0.42,
    current_ratio: 2.3,
    pe_ratio: instrument.sector === 'IT_SERVICES' ? 26.5 : 22.8,
    upcoming_earnings_within_2_days: false,
  };
}
