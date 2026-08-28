export type Role =
  | "admin"
  | "psicologo"
  | "psiquiatra"
  | "recepcionista"
  // Aliases em inglês usados pelos dados semeados no mock (mockBackend.ts).
  | "psychologist"
  | "psychiatrist";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type PatientStatus = "active" | "completed" | "paused";

export interface Patient {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  startDate: string; // ISO
  responsibleId: string;
  status: PatientStatus;
  publicToken: string;
  // Formulário atribuído a este paciente. Ausente/undefined = usa o formulário
  // padrão do sistema (app_settings.default_form_id).
  assignedFormId?: string;
}

export interface Question {
  id: string;
  text: string;
  order: number;
}

export interface ResponseEntry {
  id: string;
  patientId: string;
  date: string; // ISO date (yyyy-MM-dd)
  programDay: number; // 1..30
  // Formulário respondido. Ausente em respostas anteriores à migração para
  // formulários dinâmicos (todas do "Acompanhamento Diário" fixo).
  formId?: string;
  answers: Array<{
    questionId: string;
    // Amplo o suficiente para qualquer tipo de campo do construtor dinâmico
    // (texto, número, data/hora, opção única, múltipla escolha).
    value: number | string | string[];
    note?: string;
    // Marca respostas de campo tipo escala — usado em criticality.ts para não
    // misturar, por exemplo, um campo "Peso (kg)" no cálculo de criticidade.
    // Ausente = tratado como true (respostas históricas eram todas de escala).
    isScale?: boolean;
  }>;
  createdAt: string;
}

export type AppointmentType = "psychiatrist" | "psychologist" | "checkin";
export type AppointmentStatus = "pending" | "done";

export interface Appointment {
  id: string;
  patientId: string;
  type: AppointmentType;
  scheduledDate: string;
  status: AppointmentStatus;
  label: string;
}

export interface ClinicalRecord {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  content: string; // HTML rich text
  createdAt: string;
}

export interface ReminderTemplate {
  body: string;
}

export interface WhatsappConfig {
  apiKey: string;
  phoneNumberId: string;
}

export type Criticality = "red" | "yellow" | "green" | "unknown";