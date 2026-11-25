// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { fmtNumber, isPlausibleRate } from '../src/core/rates-core.js';
import { lang, t } from '../src/i18n.js';
import { BOLIVIA_TIME_ZONE, boliviaDay } from './market.js';

const DAY = 24 * 60 * 60 * 1000;
const colors = { bcb: '#126967', mid: '#a56808' };

export function rateChart(canvas, reading) {
  const ctx = canvas.getContext('2d');
  let points = [];
  let from = 0;
  let to = 0;
  let daily = true;
  let selected = -1;
  let chartWidth = 0;
  const left = 44;
  const right = 14;
  const x = (at) => left + (at - from) / (to - from) * (chartWidth - left - right);
  const formatDate = (at) => new Intl.DateTimeFormat(t('locale'), {
    timeZone: BOLIVIA_TIME_ZONE,
    ...(daily ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' }),
  }).format(at);

  function render() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!ctx || !width || !height) return;
    const density = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    chartWidth = width;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.font = '12px system-ui';
    const values = points.flatMap((p) => [p.bcb, p.mid]).filter(isPlausibleRate);
    if (!values.length) {
      ctx.fillStyle = '#60594c';
      ctx.textAlign = 'center';
      ctx.fillText(t('webChartEmpty'), width / 2, height / 2);
      reading.textContent = '';
      return;
    }

    const low = Math.min(...values);
    const high = Math.max(...values);
    const approximateStep = Math.max(.05, (high - low) / 3);
    const scale = 10 ** Math.floor(Math.log10(approximateStep));
    const step = [1, 2, 2.5, 5, 10].find((n) => n * scale >= approximateStep) * scale;
    const min = Math.floor(low / step) * step;
    const max = Math.max(min + 3 * step, Math.ceil(high / step) * step);
    const top = 13;
    const bottom = height - 25;
    const y = (rate) => bottom - (rate - min) / (max - min) * (bottom - top);
    const grid = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    ctx.fillStyle = '#60594c';
    ctx.strokeStyle = '#e7e1d5';
    ctx.textAlign = 'right';
    for (let tick = min; tick <= max + step / 4; tick += step) {
      grid(left, y(tick), width - right, y(tick));
      ctx.fillText(fmtNumber(tick, 2, lang()), left - 7, y(tick) + 4);
    }
    const intervals = width > 400 ? 4 : 2;
    for (let index = 0; index <= intervals; index++) {
      const at = from + (index / intervals) * (to - from);
      ctx.textAlign = index === 0 ? 'left' : index === intervals ? 'right' : 'center';
      ctx.fillText(formatDate(at), x(at), height - 6);
    }

    for (const key of ['bcb', 'mid']) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = colors[key];
      ctx.fillStyle = colors[key];
      let previous = null;
      for (const point of points) {
        if (!isPlausibleRate(point[key])) {
          previous = null;
          continue;
        }
        if (previous && (daily || point.at - previous.at <= 75 * 60 * 1000)) {
          grid(x(previous.at), y(previous[key]), x(point.at), y(point[key]));
        }
        ctx.beginPath();
        ctx.arc(x(point.at), y(point[key]), points[selected] === point ? 4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
        previous = point;
      }
    }

    const point = points[selected];
    reading.textContent = point ? t('webChartRead', {
      date: formatDate(point.at), bcb: fmtNumber(point.bcb, 2, lang()), p2p: fmtNumber(point.mid, 2, lang()),
    }) : '';
  }

  canvas.addEventListener('pointerdown', (event) => {
    const offset = event.clientX - canvas.getBoundingClientRect().left;
    const distance = (p) => Math.abs(x(p.at) - offset);
    selected = points.reduce((nearest, point, index) =>
      nearest < 0 || distance(point) < distance(points[nearest]) ? index : nearest, -1);
    render();
  });
  canvas.addEventListener('keydown', (event) => {
    if (!points.length || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    selected = Math.max(0, Math.min(points.length - 1, selected + (event.key === 'ArrowRight' ? 1 : -1)));
    render();
  });
  new ResizeObserver(render).observe(canvas);

  return (market, range, now) => {
    daily = range === '30';
    const startOfToday = Date.parse(`${boliviaDay(now)}T04:00:00Z`);
    if (daily) {
      to = startOfToday + DAY / 2;
      from = to - 29 * DAY;
      const rows = new Map(market.daily.map((row) => [row.day, row]));
      points = Array.from({ length: 30 }, (_, index) => {
        const at = from + index * DAY;
        return { ...rows.get(boliviaDay(at)), at };
      });
    } else {
      from = startOfToday;
      to = from + DAY - 60 * 1000;
      points = market.recent.map((p) => ({ ...p, at: Date.parse(p.at) })).filter((p) => p.at >= from);
    }
    selected = points.findLastIndex((p) => isPlausibleRate(p.bcb) || isPlausibleRate(p.mid));
    render();
  };
}
