export type Role = "admin" | "psicologo" | "psiquiatra" | "recepcionista";

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
  answers: Array<{ questionId: string; value: number; note?: string }>;
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
