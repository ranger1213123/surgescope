import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SvgIcon } from './components/SvgIcon';
import { NavigationContext, type TabId } from './context/NavigationContext';
import { TimeRangeProvider } from './context/TimeRangeContext';
import { OdFlowModule } from './features/od-flow/OdFlowModule';
import { WeatherSurgeProvider, WeatherSurgeView } from './features/weather-surge';
import { DemandView } from './features/demand/DemandView';
import { PlatformCompareView } from './features/platform-compare/PlatformCompareView';
import { HomeView } from './features/home/HomeView';
import { LandingView } from './features/landing/LandingView';

const TABS = [
  { id: 'overview' as const, label: '总览', icon: 'home' as const, isHome: true },
  { id: 'compare' as const, label: '平台对比', icon: 'scale' as const },
  { id: 'weather' as const, label: '天气溢价', icon: 'cloud-rain' as const },
  { id: 'flow' as const, label: '流向与车型', icon: 'link' as const },
];

function getTabFromURL(): TabId {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const found = TABS.find((t) => t.id === tab);
  return found ? found.id : 'overview';
}

function AppShell() {
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>(getTabFromURL);

  const navigateTo = useCallback((tab: TabId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    const handler = () => setActiveTab(getTabFromURL());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navContext = useMemo(() => ({ activeTab, navigateTo }), [activeTab, navigateTo]);

  const content = useMemo(() => {
    switch (activeTab) {
      case 'overview': return <HomeView />;
      case 'weather': return (
        <WeatherSurgeProvider>
          <WeatherSurgeView />
        </WeatherSurgeProvider>
      );
      case 'compare': return <PlatformCompareView />;
      case 'flow': return <OdFlowModule />;
      default: return <HomeView />;
    }
  }, [activeTab]);

  return (
    <>
      {/* Landing page */}
      {showLanding && (
        <LandingView onEnter={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('tab');
          window.history.replaceState({}, '', url.toString());
          setActiveTab('overview');
          setShowLanding(false);
        }} />
      )}

      {/* Dashboard (fades in after landing dismisses) */}
      <AnimatePresence>
        {!showLanding && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          >
            <NavigationContext.Provider value={navContext}>
              {/* Top Navigation */}
              <nav className="top-nav">
                <div className="nav-brand">
                  <span className="nav-brand-icon">
                    <SvgIcon name="activity" size={22} />
                  </span>
                  <span>SurgeScope</span>
                </div>
                <div className="nav-tabs">
                  {TABS.flatMap((tab, i) => [
                    ...(i === 1 ? [<span key="nav-sep" className="nav-separator" />] : []),
                    <button
                      key={tab.id}
                      className={`nav-tab${activeTab === tab.id ? ' active' : ''}${(tab as any).isHome ? ' nav-tab-home' : ''}`}
                      onClick={() => navigateTo(tab.id)}
                    >
                      {tab.label}
                    </button>,
                  ])}
                </div>
                <span className="nav-version">v3.0</span>
              </nav>

              {/* Main Content */}
              <main className="main-content">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    {content}
                  </motion.div>
                </AnimatePresence>
              </main>
            </NavigationContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <TimeRangeProvider>
        <AppShell />
      </TimeRangeProvider>
    </ErrorBoundary>
  );
}
