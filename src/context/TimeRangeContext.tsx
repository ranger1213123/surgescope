import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';

type TimeRange = [Date, Date] | null;

type TimeRangeContextValue = {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
};

const TimeRangeContext = createContext<TimeRangeContextValue>({
  timeRange: null,
  setTimeRange: () => {},
});

function readRangeFromURL(): TimeRange {
  const p = new URLSearchParams(window.location.search);
  const from = p.get('from');
  const to = p.get('to');
  if (from && to) {
    const f = new Date(from);
    const t = new Date(to);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) return [f, t];
  }
  return null;
}

function writeRangeToURL(range: TimeRange) {
  const url = new URL(window.location.href);
  if (range) {
    url.searchParams.set('from', range[0].toISOString());
    url.searchParams.set('to', range[1].toISOString());
  } else {
    url.searchParams.delete('from');
    url.searchParams.delete('to');
  }
  window.history.replaceState({}, '', url.toString());
}

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>(readRangeFromURL);

  const setTimeRange = useCallback((range: TimeRange) => {
    setTimeRangeState(range);
    writeRangeToURL(range);
  }, []);

  useEffect(() => {
    const onPop = () => setTimeRangeState(readRangeFromURL());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo(() => ({ timeRange, setTimeRange }), [timeRange, setTimeRange]);

  return <TimeRangeContext.Provider value={value}>{children}</TimeRangeContext.Provider>;
}

export function useTimeRange() {
  return useContext(TimeRangeContext);
}
