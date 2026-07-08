import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { colors, fontFamily } from '../theme';
import type { PublicSeating } from '../../shared/types';

const POLL_MS = 4000;

export default function SeatingChart() {
  const [data, setData] = useState<PublicSeating | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .getSeating()
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {});
    };
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer.current);
    };
  }, []);

  const seats = data?.seats ?? new Array(30).fill('');
  const deskAccent = data?.deskAccent ?? '#dbe4f0';
  const labelStyle = data?.labelStyle ?? 'numbers';

  const tables = [];
  for (let i = 0; i < 15; i++) {
    const label = labelStyle === 'letters' ? String.fromCharCode(65 + i) : String(i + 1);
    tables.push({
      id: i,
      label,
      a: seats[i * 2] || '',
      b: seats[i * 2 + 1] || ''
    });
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: colors.pageBg,
        fontFamily,
        color: colors.text,
        padding: 40,
        boxSizing: 'border-box'
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.textMuted,
              marginBottom: 4
            }}
          >
            Seating Plan
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Class Seating Chart</div>
        </div>
        <div
          style={{
            border: `2px solid ${colors.borderSoft}`,
            borderRadius: 16,
            padding: '32px 40px 40px',
            background: colors.cardBg
          }}
        >
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.textFaint,
              marginBottom: 24
            }}
          >
            Front of room
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 28 }}>
            <div
              style={{
                width: 150,
                height: 60,
                borderRadius: 8,
                background: deskAccent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                color: colors.text
              }}
            >
              Teacher
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {tables.map((t) => (
              <div
                key={t.id}
                style={{
                  border: `1px solid ${colors.borderSoft}`,
                  borderRadius: 10,
                  padding: 14,
                  background: colors.tableBg
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: colors.textFaint,
                    marginBottom: 10,
                    letterSpacing: '0.04em'
                  }}
                >
                  Table {t.label}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <SeatCell text={t.a} />
                  <SeatCell text={t.b} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SeatCell({ text }: { text: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 56,
        border: `1px dashed ${colors.borderDash}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        fontSize: 14,
        textAlign: 'center',
        color: text ? colors.text : colors.textPlaceholder
      }}
    >
      {text || '—'}
    </div>
  );
}
