import { memo } from 'react';

type Node = {
  x: number;
  y: number;
  r?: number;
  color?: string;
};

// 노드 17개 (디자인 명세: 컨스텔레이션 SVG)
const NODES: ReadonlyArray<Node> = [
  { x: 16, y: 18 },
  { x: 33, y: 11 },
  { x: 50, y: 24, r: 1.5, color: '#6fd6e8' },
  { x: 67, y: 13 },
  { x: 85, y: 22 },
  { x: 103, y: 15 },
  { x: 11, y: 45 },
  { x: 29, y: 39 },
  { x: 48, y: 51 },
  { x: 65, y: 43, r: 1.5, color: '#e8c06f' },
  { x: 83, y: 53 },
  { x: 104, y: 45 },
  { x: 23, y: 67 },
  { x: 43, y: 73, r: 1.4, color: '#79e0a0' },
  { x: 61, y: 64 },
  { x: 79, y: 72 },
  { x: 98, y: 65 },
];

// 엣지 (노드 인덱스 쌍)
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11],
  [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
  [6, 12], [7, 13], [8, 14], [9, 14], [10, 15], [11, 16],
  [12, 13], [13, 14], [14, 15], [15, 16],
  [7, 2], [8, 13], [9, 15], [2, 9],
];

type ConstellationProps = {
  opacity?: number;
};

export const Constellation = memo(function Constellation({ opacity = 0.55 }: ConstellationProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 80"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
    >
      {EDGES.map(([a, b]) => {
        const from = NODES[a];
        const to = NODES[b];
        if (!from || !to) return null;
        const colored = from.color != null || to.color != null;
        return (
          <line
            key={`${a}-${b}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={colored ? '#3a3a3f' : '#26262b'}
            strokeWidth={0.16}
          />
        );
      })}
      {NODES.map((node) => {
        const r = node.r ?? 0.85;
        return (
          <g key={`${node.x}-${node.y}`}>
            {node.color != null && (
              <circle
                cx={node.x}
                cy={node.y}
                r={(node.r ?? 1.4) + 1.6}
                fill="none"
                stroke={node.color}
                strokeWidth={0.14}
                opacity={0.5}
              />
            )}
            <circle cx={node.x} cy={node.y} r={r} fill={node.color ?? '#54545a'} />
          </g>
        );
      })}
    </svg>
  );
});
