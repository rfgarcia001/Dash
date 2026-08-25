import { parseISO, isToday, isYesterday, subDays, isAfter, isBefore, isEqual, startOfDay, parse, differenceInCalendarDays } from 'date-fns';

// Função segura para converter strings brasileiras como "1.234,56" para float
export const parseValue = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = val.toString().replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

const referenceDate = new Date();

export function parseUtcToUtcMinus3(rawStr: any): { dateStr: string; formattedDisplay: string; timestamp: number } {
  if (!rawStr) return { dateStr: '', formattedDisplay: '', timestamp: 0 };
  const str = String(rawStr).trim();
  if (!str) return { dateStr: '', formattedDisplay: '', timestamp: 0 };

  // Match ISO pattern: 2026-08-04T15:41:25.000Z or 2026-08-04 15:41:25 or 2026-08-04
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  
  // Match DD/MM/YYYY pattern: 11/07/2026 - 20:00 or 11/07/2026 às 16:14 or 11/07/2026 20:00:00 or 11/07/2026
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:(?:\s*(?:-|às|at|\s)\s*)(\d{2}):(\d{2})(?::(\d{2}))?)?/);

  let utcMs = 0;
  let hasTime = false;

  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hours = isoMatch[4] !== undefined ? parseInt(isoMatch[4], 10) : 0;
    const minutes = isoMatch[5] !== undefined ? parseInt(isoMatch[5], 10) : 0;
    const seconds = isoMatch[6] !== undefined ? parseInt(isoMatch[6], 10) : 0;
    hasTime = isoMatch[4] !== undefined;

    if (hasTime) {
      utcMs = Date.UTC(year, month, day, hours, minutes, seconds);
    } else {
      const y = year;
      const m = String(month + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      return {
        dateStr: `${y}-${m}-${d}`,
        formattedDisplay: `${d}/${m}/${y}`,
        timestamp: Date.UTC(year, month, day, 12, 0, 0)
      };
    }
  } else if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] !== undefined ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] !== undefined ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] !== undefined ? parseInt(dmyMatch[6], 10) : 0;
    hasTime = dmyMatch[4] !== undefined;

    if (hasTime) {
      utcMs = Date.UTC(year, month, day, hours, minutes, seconds);
    } else {
      const y = year;
      const m = String(month + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      return {
        dateStr: `${y}-${m}-${d}`,
        formattedDisplay: `${d}/${m}/${y}`,
        timestamp: Date.UTC(year, month, day, 12, 0, 0)
      };
    }
  } else {
    const t = Date.parse(str);
    if (!isNaN(t)) {
      utcMs = t;
      hasTime = true;
    } else {
      return { dateStr: str, formattedDisplay: str, timestamp: 0 };
    }
  }

  // Converter de UTC para UTC-3 (subtrair 3 horas = 3 * 3600 * 1000 ms)
  const utcMinus3Ms = utcMs - 3 * 60 * 60 * 1000;
  const d = new Date(utcMinus3Ms);

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');

  const dateStr = `${y}-${m}-${day}`;
  const formattedDisplay = `${day}/${m}/${y} ${hh}:${mm}`;

  return {
    dateStr,
    formattedDisplay,
    timestamp: utcMinus3Ms
  };
}

// Parse flexible dates considerando timezone UTC -> UTC-3 para strings com horário
export const parseFlexibleDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(NaN);
  const { dateStr: utcMinus3Date } = parseUtcToUtcMinus3(dateStr);
  if (!utcMinus3Date) return new Date(NaN);
  
  const ymdMatch = utcMinus3Date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  const dmyMatch = utcMinus3Date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  return parseISO(utcMinus3Date);
};

export const buildDateFilter = (range: string) => {
    if (range === 'MÁXIMO') return (dateStr: string) => true;

    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);

    return (dateStr: string) => {
        if (!dateStr) return false;
        
        const itemDate = startOfDay(parseFlexibleDate(dateStr)); 
        if (isNaN(itemDate.getTime())) return false; // Invalid date format fallback
        
        if (range.startsWith('CUSTOM:')) {
            const parts = range.split(':')[1].split('|');
            if (parts.length === 2) {
                const s = startOfDay(parseISO(parts[0]));
                const e = startOfDay(parseISO(parts[1]));
                return (isEqual(itemDate, s) || isAfter(itemDate, s)) && (isEqual(itemDate, e) || isBefore(itemDate, e));
            }
        }
        
        switch (range) {
            case 'HOJE':
                return isEqual(itemDate, today);
            case 'ONTEM':
                return isEqual(itemDate, yesterday);
            case 'ONTEM+HOJE':
                return isEqual(itemDate, today) || isEqual(itemDate, yesterday);
            case '3D':
                return (isEqual(itemDate, today) || isBefore(itemDate, today)) && (isEqual(itemDate, subDays(today, 2)) || isAfter(itemDate, subDays(today, 2)));
            case '7D':
                return (isEqual(itemDate, today) || isBefore(itemDate, today)) && (isEqual(itemDate, subDays(today, 6)) || isAfter(itemDate, subDays(today, 6)));
            case '14D':
                return (isEqual(itemDate, today) || isBefore(itemDate, today)) && (isEqual(itemDate, subDays(today, 13)) || isAfter(itemDate, subDays(today, 13)));
            case '30D':
                return (isEqual(itemDate, today) || isBefore(itemDate, today)) && (isEqual(itemDate, subDays(today, 29)) || isAfter(itemDate, subDays(today, 29)));
            case 'MES_ATUAL': {
                const startOfMonth = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
                return (isEqual(itemDate, startOfMonth) || isAfter(itemDate, startOfMonth)) && (isEqual(itemDate, today) || isBefore(itemDate, today));
            }
            default:
                return true;
        }
    };
};

export const buildPreviousDateFilter = (range: string) => {
  if (range === 'MÁXIMO') return () => false;

  const today = startOfDay(new Date());

  if (range.startsWith('CUSTOM:')) {
    const parts = range.split(':')[1]?.split('|');
    if (parts && parts.length === 2) {
      const s = startOfDay(parseISO(parts[0]));
      const e = startOfDay(parseISO(parts[1]));
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        const days = differenceInCalendarDays(e, s) + 1;
        const prevS = subDays(s, days);
        const prevE = subDays(s, 1);
        return (dateStr: string) => {
          if (!dateStr) return false;
          const itemDate = startOfDay(parseFlexibleDate(dateStr));
          if (isNaN(itemDate.getTime())) return false;
          return (isEqual(itemDate, prevS) || isAfter(itemDate, prevS)) && (isEqual(itemDate, prevE) || isBefore(itemDate, prevE));
        };
      }
    }
    return () => false;
  }

  let prevStart: Date;
  let prevEnd: Date;

  switch (range) {
    case 'HOJE':
      // Today (1 day) -> Previous: Yesterday (1 day)
      prevStart = subDays(today, 1);
      prevEnd = subDays(today, 1);
      break;
    case 'ONTEM':
      // Yesterday (1 day) -> Previous: 2 days ago (1 day)
      prevStart = subDays(today, 2);
      prevEnd = subDays(today, 2);
      break;
    case 'ONTEM+HOJE':
      // Yesterday + Today (2 days) -> Previous: 3 & 2 days ago (2 days)
      prevStart = subDays(today, 3);
      prevEnd = subDays(today, 2);
      break;
    case '3D':
      // Last 3 days (today-2 to today) -> Previous: today-5 to today-3 (3 days)
      prevStart = subDays(today, 5);
      prevEnd = subDays(today, 3);
      break;
    case '7D':
      // Last 7 days (today-6 to today) -> Previous: today-13 to today-7 (7 days)
      prevStart = subDays(today, 13);
      prevEnd = subDays(today, 7);
      break;
    case '14D':
      // Last 14 days (today-13 to today) -> Previous: today-27 to today-14 (14 days)
      prevStart = subDays(today, 27);
      prevEnd = subDays(today, 14);
      break;
    case '30D':
      // Last 30 days (today-29 to today) -> Previous: today-59 to today-30 (30 days)
      prevStart = subDays(today, 59);
      prevEnd = subDays(today, 30);
      break;
    case 'MES_ATUAL': {
      const year = today.getFullYear();
      const month = today.getMonth();
      const startOfLastMonth = startOfDay(new Date(year, month - 1, 1));
      const dayOfMonth = today.getDate();
      const lastDayOfPrevMonth = new Date(year, month, 0).getDate();
      const endDay = Math.min(dayOfMonth, lastDayOfPrevMonth);
      const endOfLastMonth = startOfDay(new Date(year, month - 1, endDay));
      prevStart = startOfLastMonth;
      prevEnd = endOfLastMonth;
      break;
    }
    default:
      return () => false;
  }

  return (dateStr: string) => {
    if (!dateStr) return false;
    const itemDate = startOfDay(parseFlexibleDate(dateStr));
    if (isNaN(itemDate.getTime())) return false;
    return (isEqual(itemDate, prevStart) || isAfter(itemDate, prevStart)) && (isEqual(itemDate, prevEnd) || isBefore(itemDate, prevEnd));
  };
};

export const getPreviousPeriodLabel = (range: string, custom: { start: string; end: string }) => {
  if (range === 'MÁXIMO') return 'Sem per. anterior';
  if (range === 'HOJE') return 'vs. Ontem';
  if (range === 'ONTEM') return 'vs. Anteontem';
  if (range === 'ONTEM+HOJE') return 'vs. 2d anteriores';
  if (range === '3D') return 'vs. 3d anteriores';
  if (range === '7D') return 'vs. 7d anteriores';
  if (range === '14D') return 'vs. 14d anteriores';
  if (range === '30D') return 'vs. 30d anteriores';
  if (range === 'MES_ATUAL') return 'vs. Mês Anterior';
  if (range.startsWith('CUSTOM:')) return 'vs. per. anterior equiv.';
  return 'vs. período anterior';
};

export const calculateComparison = (
  curr: number, 
  prev: number, 
  invertGood = false,
  formatType: 'currency' | 'number' | 'roas' | 'percent' = 'currency'
) => {
  if (prev === undefined || prev === null) return null;
  const diff = curr - prev;

  let prevFormatted = '';
  if (formatType === 'currency') {
    prevFormatted = formatCurrency(prev);
  } else if (formatType === 'number') {
    prevFormatted = formatNumber(prev);
  } else if (formatType === 'roas') {
    prevFormatted = `${(prev || 0).toFixed(2)}x`;
  } else if (formatType === 'percent') {
    prevFormatted = formatPercent(prev);
  } else {
    prevFormatted = formatNumber(prev);
  }

  if (prev === 0) {
    if (curr === 0) return { percent: 0, diff: 0, isGood: true, formatted: '0,0%', prevValue: 0, prevFormatted };
    return { percent: 100, diff: curr, isGood: !invertGood, formatted: '+100,0%', prevValue: 0, prevFormatted };
  }
  const percent = ((curr - prev) / Math.abs(prev)) * 100;
  const isGood = invertGood ? percent <= 0 : percent >= 0;
  const formatted = `${percent >= 0 ? '+' : ''}${percent.toFixed(1).replace('.', ',')}%`;
  return { percent, diff, isGood, formatted, prevValue: prev, prevFormatted };
};

// Retro-compatibility just in case it's used elsewhere
export const filterByDate = (dateStr: string, range: string) => {
    return buildDateFilter(range)(dateStr);
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

export const formatPercent = (val: number) => {
  if (!isFinite(val) || isNaN(val)) return '0,00%';
  return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(val);
};

export const formatNumber = (val: number) => {
  return new Intl.NumberFormat('pt-BR').format(val);
};
