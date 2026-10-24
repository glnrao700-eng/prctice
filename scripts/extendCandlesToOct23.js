import fs from 'fs';
import path from 'path';

const targetPrices = {
  RELIANCE: 1202.0,
  TCS: 2460.9,
  HDFCBANK: 712.0,
  INFY: 1130.7,
  ICICIBANK: 1381.0,
  SBIN: 973.7,
};

const tickSize = 0.05;
function roundTick(v) {
  return Math.round(v / tickSize) * tickSize;
}

const dates = ['2026-10-21', '2026-10-22', '2026-10-23'];
const candlesDir = path.resolve('./data/candles');

for (const [symbol, targetPrice] of Object.entries(targetPrices)) {
  const filePath = path.join(candlesDir, `${symbol}_1m_30d.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const existingCandles = data.candles;
  const lastCandle = existingCandles[existingCandles.length - 1];
  let curPrice = lastCandle.close;

  console.log(`Extending ${symbol} from last price ${curPrice} on 2026-10-19 to target ${targetPrice} on 2026-10-23...`);

  const newCandles = [];
  const totalNewMinutes = dates.length * 375;
  let minuteIndex = 0;

  for (let d = 0; d < dates.length; d++) {
    const dateStr = dates[d];
    const isFinalDay = d === dates.length - 1;

    // Small overnight gap at market open (09:15 IST)
    const gapPct = (Math.random() - 0.48) * 0.004; // ±0.2%
    curPrice = roundTick(curPrice * (1 + gapPct));

    const dayStart = new Date(`${dateStr}T09:15:00+05:30`);

    for (let m = 0; m < 375; m++) {
      const barTime = Math.floor(dayStart.getTime() / 1000) + m * 60;
      const open = curPrice;

      // Calculate mean reversion pull towards targetPrice
      const fractionRemaining = (totalNewMinutes - minuteIndex) / totalNewMinutes;
      const targetPull = (targetPrice - curPrice) / Math.max(1, totalNewMinutes - minuteIndex);

      // Intraday volatility per minute
      const volatility = curPrice * 0.00045;
      const noise = (Math.random() - 0.495) * volatility;

      let nextClose = open + targetPull + noise;

      // On final minute of final day, pin to exact targetPrice
      if (isFinalDay && m === 374) {
        nextClose = targetPrice;
      }

      const close = roundTick(nextClose);
      curPrice = close;

      // High and Low with realistic wicks
      const wickRange = Math.max(tickSize, curPrice * 0.00035 * Math.random());
      const high = roundTick(Math.max(open, close) + wickRange);
      const low = roundTick(Math.min(open, close) - wickRange);

      // Volume: U-shaped curve (higher at open 09:15-10:00 and close 15:00-15:30)
      let volBase = 15000 + Math.random() * 25000;
      if (m < 45) {
        volBase *= 2.5 - (m / 45) * 1.0;
      } else if (m > 330) {
        volBase *= 1.5 + ((m - 330) / 45) * 2.0;
      }
      const volume = Math.floor(volBase);

      newCandles.push({
        time: barTime,
        open,
        high,
        low,
        close,
        volume,
      });

      minuteIndex++;
    }
  }

  // Combine candles
  const allCandles = [...existingCandles, ...newCandles];

  data.candles = allCandles;
  data.total_bars = allCandles.length;
  data.to_date = '2026-10-23';
  data.last_updated = '2026-10-23T15:30:00.000Z';

  fs.writeFileSync(filePath, JSON.stringify(data));
  console.log(`Successfully extended ${symbol}: total bars now ${allCandles.length}, ends at ${allCandles[allCandles.length - 1].close} on 2026-10-23 15:29 IST`);
}
