import { Circle, Path, Rect, Svg, Text } from "@react-pdf/renderer";
import { REPORT_COLORS } from "@/lib/patientReport";
import { CHART_PADDING, type EvolutionChartGeometry } from "@/lib/patientReportChart";

export function EvolutionChartPdf({ geometry }: { geometry: EvolutionChartGeometry }) {
  const plotWidth = geometry.width - CHART_PADDING.left - CHART_PADDING.right;

  return (
    <Svg width={geometry.width} height={geometry.height}>
      {geometry.bands.map((band, i) => (
        <Rect
          key={i}
          x={CHART_PADDING.left}
          y={band.y}
          width={plotWidth}
          height={band.height}
          fill={band.color}
          opacity={0.15}
        />
      ))}
      {geometry.linePath && (
        <Path d={geometry.linePath} stroke={REPORT_COLORS.primary} strokeWidth={1.5} fill="none" />
      )}
      {geometry.dots.map((dot, i) => (
        <Circle key={i} cx={dot.x} cy={dot.y} r={2} fill={REPORT_COLORS.primary} />
      ))}
      {geometry.yAxisTicks.map((tick, i) => (
        <Text key={i} x={0} y={tick.y} style={{ fontSize: 8 }}>
          {tick.label}
        </Text>
      ))}
      {geometry.xAxisTicks.map((tick, i) => (
        <Text key={i} x={tick.x} y={geometry.height} style={{ fontSize: 8 }}>
          {tick.label}
        </Text>
      ))}
    </Svg>
  );
}
