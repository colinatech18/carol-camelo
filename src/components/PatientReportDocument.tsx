import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EvolutionChartPdf } from "@/components/EvolutionChartPdf";
import { REPORT_COLORS, type ReportSummary } from "@/lib/patientReport";
import type { EvolutionChartGeometry } from "@/lib/patientReportChart";
import type { Criticality } from "@/types";

const CRITICALITY_LABEL: Record<Criticality, { label: string; color: string }> = {
  red: { label: "Crítico", color: REPORT_COLORS.red },
  yellow: { label: "Atenção", color: REPORT_COLORS.yellow },
  green: { label: "Estável", color: REPORT_COLORS.green },
  unknown: { label: "Sem dados", color: "#6b7280" },
};

export function PatientReportDocument({
  clinicLogoUrl,
  summary,
  geometry,
}: {
  clinicLogoUrl: string | null;
  summary: ReportSummary;
  geometry: EvolutionChartGeometry | null;
}) {
  const criticality = CRITICALITY_LABEL[summary.criticality];

  return (
    <Document>
      <Page size="A4" style={{ padding: 40 }}>
        {clinicLogoUrl ? (
          <Image
            src={clinicLogoUrl}
            style={{ height: 32, width: "auto", objectFit: "contain", alignSelf: "flex-start" }}
          />
        ) : (
          <Text style={{ fontSize: 16, fontWeight: 700 }}>Vera PSI</Text>
        )}

        <Text style={{ fontSize: 14, fontWeight: 700, marginTop: 16 }}>{summary.patientName}</Text>
        <Text>Início do programa: {summary.startDateLabel}</Text>

        <View style={{ marginTop: 8 }}>
          <Text>
            Dia {summary.currentDay} de {summary.programLengthDays}
          </Text>
          <Text style={{ color: criticality.color }}>{criticality.label}</Text>
          {summary.isPartial && (
            <Text style={{ fontSize: 9, color: "#6b7280" }}>
              Relatório parcial — programa em andamento.
            </Text>
          )}
        </View>

        <View style={{ marginTop: 16 }}>
          {geometry ? (
            <EvolutionChartPdf geometry={geometry} />
          ) : (
            <Text>Sem dados suficientes para gerar o gráfico de evolução.</Text>
          )}
        </View>

        <Text style={{ fontSize: 8, color: "#9ca3af", marginTop: 24 }}>
          Gerado em {format(new Date(), "dd MMM yyyy HH:mm", { locale: ptBR })} pela Vera PSI
        </Text>
      </Page>
    </Document>
  );
}
