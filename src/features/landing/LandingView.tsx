import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  onEnter: () => void;
};

/* ── Raindrop component ── */
function Raindrop({ delay, duration, left, size }: { delay: number; duration: number; left: number; size: number }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: -40,
        left: `${left}%`,
        width: size,
        height: size * 9,
        borderRadius: '0 0 4px 4px',
        background: 'linear-gradient(to bottom, transparent, rgba(147,197,253,0.6))',
        pointerEvents: 'none',
      }}
      animate={{ top: '110vh', opacity: [0, 0.8, 0.4] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ── Snowflake component ── */
function Snowflake({ delay, duration, left, size }: { delay: number; duration: number; left: number; size: number }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: -20,
        left: `${left}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.85)',
        boxShadow: '0 0 4px rgba(255,255,255,0.5)',
        pointerEvents: 'none',
      }}
      animate={{
        top: '110vh',
        x: [0, 30, -20, 15, -10],
        opacity: [1, 0.9, 0.7, 0.3],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ── Car component ── */
function Car({ delay, y, speed, direction }: { delay: number; y: string; speed: number; direction: 'ltr' | 'rtl' }) {
  const startX = direction === 'ltr' ? '-120px' : 'calc(100vw + 120px)';
  const endX = direction === 'ltr' ? 'calc(100vw + 120px)' : '-120px';
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: y,
        left: 0,
        fontSize: 28,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
      }}
      initial={{ x: startX }}
      animate={{ x: endX }}
      transition={{ duration: speed, delay, repeat: Infinity, ease: 'linear' }}
    >
      <span style={{ display: 'inline-block', transform: direction === 'ltr' ? 'scaleX(-1)' : 'none' }}>🚗</span>
    </motion.div>
  );
}

/* ── Pulsing map pin ── */
function MapPin({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        fontSize: 18,
        pointerEvents: 'none',
      }}
      animate={{ scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 2.5, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      📍
    </motion.div>
  );
}

export function LandingView({ onEnter }: Props) {
  const [isExiting, setIsExiting] = useState(false);

  const handleEnter = useCallback(() => {
    setIsExiting(true);
    setTimeout(onEnter, 800);
  }, [onEnter]);

  // Generate raindrops and snowflakes
  const drops = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    delay: Math.random() * 6,
    duration: 1.2 + Math.random() * 2.5,
    left: Math.random() * 100,
    size: 1 + Math.random() * 2.5,
  }));

  const flakes = Array.from({ length: 25 }, (_, i) => ({
    id: i + 100,
    delay: Math.random() * 8,
    duration: 4 + Math.random() * 6,
    left: Math.random() * 100,
    size: 3 + Math.random() * 6,
  }));

  const cars = [
    { y: '22%', speed: 14, direction: 'ltr' as const, delay: 0 },
    { y: '28%', speed: 18, direction: 'rtl' as const, delay: 3 },
    { y: '34%', speed: 12, direction: 'ltr' as const, delay: 7 },
    { y: '40%', speed: 20, direction: 'rtl' as const, delay: 2 },
    { y: '46%', speed: 16, direction: 'ltr' as const, delay: 5 },
  ];

  const pins = [
    { x: 42, y: 32, delay: 0 },
    { x: 55, y: 38, delay: 1.2 },
    { x: 48, y: 55, delay: 0.6 },
    { x: 62, y: 28, delay: 2 },
    { x: 38, y: 48, delay: 1.8 },
  ];

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          key="landing"
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 30%, #0f3460 60%, #1a1a2e 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Weather effects */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            {/* City silhouette glow */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
              background: 'linear-gradient(to top, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.4) 40%, transparent 100%)',
            }} />
            {/* Grid lines = roads */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="0" y1="25" x2="100" y2="25" stroke="white" strokeWidth="0.3" />
              <line x1="0" y1="35" x2="100" y2="35" stroke="white" strokeWidth="0.3" />
              <line x1="0" y1="45" x2="100" y2="45" stroke="white" strokeWidth="0.3" />
              <line x1="20" y1="0" x2="20" y2="100" stroke="white" strokeWidth="0.3" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.3" />
              <line x1="80" y1="0" x2="80" y2="100" stroke="white" strokeWidth="0.3" />
            </svg>

            {/* Rain (top half) */}
            {drops.slice(0, 20).map(d => (
              <Raindrop key={d.id} delay={d.delay} duration={d.duration} left={d.left} size={d.size} />
            ))}
            {/* Snow (bottom half transition) */}
            {flakes.slice(0, 12).map(f => (
              <Snowflake key={f.id} delay={f.delay} duration={f.duration} left={f.left} size={f.size} />
            ))}

            {/* Cars driving on roads */}
            {cars.map((c, i) => (
              <Car key={i} y={c.y} speed={c.speed} direction={c.direction} delay={c.delay} />
            ))}

            {/* Map pins pulsing */}
            {pins.map((p, i) => (
              <MapPin key={i} x={p.x} y={p.y} delay={p.delay} />
            ))}
          </div>

          {/* Content */}
          <motion.div
            style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Logo mark */}
            <motion.div
              style={{
                width: 72, height: 72, borderRadius: 20,
                background: 'linear-gradient(135deg, #3B71F3 0%, #E8613C 100%)',
                margin: '0 auto 28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 40px rgba(59,113,243,0.35)',
              }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span style={{ fontSize: 32, color: '#fff', fontWeight: 800 }}>S</span>
            </motion.div>

            <h1 style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.03em',
              marginBottom: 12,
              lineHeight: 1.15,
            }}>
              波士顿网约车
              <br />
              <span style={{
                background: 'linear-gradient(135deg, #3B71F3 0%, #a78bfa 40%, #E8613C 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                动态溢价可视化
              </span>
            </h1>

            <p style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.55)',
              maxWidth: 480,
              margin: '0 auto 40px',
              lineHeight: 1.7,
            }}>
              雨雪天叫车，谁更贵？贵多少？——波士顿冬季网约车定价对比
              <br />
              2018年11月–12月 · 波士顿大区 · 1,464条小时级数据
            </p>

            {/* Enter button */}
            <motion.button
              onClick={handleEnter}
              style={{
                padding: '16px 48px',
                fontSize: 17,
                fontWeight: 700,
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #3B71F3 0%, #E8613C 100%)',
                cursor: 'pointer',
                boxShadow: '0 4px 28px rgba(59,113,241,0.4)',
                position: 'relative',
                overflow: 'hidden',
              }}
              whileHover={{
                scale: 1.05,
                boxShadow: '0 8px 40px rgba(59,113,241,0.55)',
              }}
              whileTap={{ scale: 0.97 }}
            >
              <motion.span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                animate={{ x: [0, 6, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                进入分析
                <span style={{ fontSize: 18 }}>→</span>
              </motion.span>
              {/* Shimmer */}
              <motion.div
                style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                }}
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              />
            </motion.button>

            <p style={{
              marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,0.25)',
            }}>
              React · TypeScript · D3.js · Leaflet · Framer Motion
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
