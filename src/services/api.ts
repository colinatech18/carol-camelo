/**
 * Centralized API service.
 *
 * In production set VITE_API_URL to your clinic's backend URL.
 * When VITE_API_URL is empty the app falls back to a localStorage-backed
 * mock so the UI is usable for previewing/self-hosting demos.
 */
import axios, { type AxiosInstance } from "axios";
import type {
  Appointment,
  ClinicalRecord,
  Patient,
  Question,
  ReminderTemplate,
  ResponseEntry,
  Role,
  User,
  WhatsappConfig,
} from "@/types";
import { mockApi } from "./mockBackend";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "";
export const USE_MOCK = BASE_URL.length === 0;

const TOKEN_KEY = "mh.token";

export const getToken = () => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
export const setToken = (t: string | null) => {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

let client: AxiosInstance | null = null;
function http(): AxiosInstance {
  if (!client) {
    client = axios.create({ baseURL: BASE_URL, withCredentials: true });
    client.interceptors.request.use((config) => {
      const t = getToken();
      if (t) config.headers.Authorization = `Bearer ${t}`;
      return config;
    });
  }
  return client;
}

// ---------- AUTH ----------
export const authApi = {
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    if (USE_MOCK) {
      const r = await mockApi.auth.login(email, password);
      setToken(r.token);
      return r;
    }
    const { data } = await http().post("/auth/login", { email, password });
    setToken(data.token);
    return data;
  },
  async me(): Promise<User> {
    if (USE_MOCK) return mockApi.auth.me();
    const { data } = await http().get("/auth/me");
    return data;
  },
  async logout(): Promise<void> {
    if (USE_MOCK) { await mockApi.auth.logout(); setToken(null); return; }
    await http().post("/auth/logout").catch(() => undefined);
    setToken(null);
  },
  async listUsers(): Promise<User[]> {
    if (USE_MOCK) return mockApi.auth.listUsers();
    const { data } = await http().get("/users");
    return data;
  },
  async createUser(u: { name: string; email: string; role: Role; password: string }): Promise<User> {
    if (USE_MOCK) return mockApi.auth.createUser(u);
    const { data } = await http().post("/users", u);
    return data;
  },
  async deleteUser(id: string): Promise<void> {
    if (USE_MOCK) { await mockApi.auth.deleteUser(id); return; }
    await http().delete(`/users/${id}`);
  },
};

// ---------- PATIENTS ----------
export const patientsApi = {
  async list(): Promise<Patient[]> {
    if (USE_MOCK) return mockApi.patients.list();
    const { data } = await http().get("/patients");
    return data;
  },
  async get(id: string): Promise<Patient> {
    if (USE_MOCK) return mockApi.patients.get(id);
    const { data } = await http().get(`/patients/${id}`);
    return data;
  },
  async getByToken(token: string): Promise<Patient> {
    if (USE_MOCK) return mockApi.patients.getByToken(token);
    const { data } = await http().get(`/patients/public/${token}`);
    return data;
  },
  async create(input: Omit<Patient, "id" | "publicToken">): Promise<Patient> {
    if (USE_MOCK) return mockApi.patients.create(input);
    const { data } = await http().post("/patients", input);
    return data;
  },
  async update(id: string, patch: Partial<Patient>): Promise<Patient> {
    if (USE_MOCK) return mockApi.patients.update(id, patch);
    const { data } = await http().patch(`/patients/${id}`, patch);
    return data;
  },
  async remove(id: string): Promise<void> {
    if (USE_MOCK) { await mockApi.patients.remove(id); return; }
    await http().delete(`/patients/${id}`);
  },
};

// ---------- FORMS ----------
export const formsApi = {
  async getQuestions(): Promise<Question[]> {
    if (USE_MOCK) return mockApi.forms.getQuestions();
    const { data } = await http().get("/forms/questions");
    return data;
  },
  async saveQuestions(qs: Question[]): Promise<Question[]> {
    if (USE_MOCK) return mockApi.forms.saveQuestions(qs);
    const { data } = await http().put("/forms/questions", qs);
    return data;
  },
  async saveResponse(entry: Omit<ResponseEntry, "id" | "createdAt">): Promise<ResponseEntry> {
    if (USE_MOCK) return mockApi.forms.saveResponse(entry);
    const { data } = await http().post("/forms/responses", entry);
    return data;
  },
  async getResponses(patientId: string): Promise<ResponseEntry[]> {
    if (USE_MOCK) return mockApi.forms.getResponses(patientId);
    const { data } = await http().get(`/forms/responses/${patientId}`);
    return data;
  },
  async getAllResponses(): Promise<ResponseEntry[]> {
    if (USE_MOCK) return mockApi.forms.getAllResponses();
    const { data } = await http().get("/forms/responses");
    return data;
  },
};

// ---------- RECORDS ----------
export const recordsApi = {
  async list(patientId: string): Promise<ClinicalRecord[]> {
    if (USE_MOCK) return mockApi.records.list(patientId);
    const { data } = await http().get(`/records/${patientId}`);
    return data;
  },
  async create(input: Omit<ClinicalRecord, "id" | "createdAt">): Promise<ClinicalRecord> {
    if (USE_MOCK) return mockApi.records.create(input);
    const { data } = await http().post("/records", input);
    return data;
  },
};

// ---------- APPOINTMENTS ----------
export const appointmentsApi = {
  async list(patientId: string): Promise<Appointment[]> {
    if (USE_MOCK) return mockApi.appointments.list(patientId);
    const { data } = await http().get(`/appointments/${patientId}`);
    return data;
  },
  async updateStatus(id: string, status: Appointment["status"]): Promise<Appointment> {
    if (USE_MOCK) return mockApi.appointments.updateStatus(id, status);
    const { data } = await http().patch(`/appointments/${id}`, { status });
    return data;
  },
};

// ---------- NOTIFICATIONS / WHATSAPP ----------
export const notificationsApi = {
  async sendReminder(patientId: string) {
    if (USE_MOCK) return mockApi.notifications.sendReminder(patientId);
    const { data } = await http().post("/whatsapp/send", { patientId });
    return data;
  },
  async sendBulkReminders(patientIds: string[]) {
    if (USE_MOCK) return Promise.all(patientIds.map((id) => mockApi.notifications.sendReminder(id)));
    const { data } = await http().post("/whatsapp/send-bulk", { patientIds });
    return data;
  },
};

// ---------- SETTINGS ----------
export const settingsApi = {
  async getTemplate(): Promise<ReminderTemplate> {
    if (USE_MOCK) return mockApi.settings.getTemplate();
    const { data } = await http().get("/settings/template");
    return data;
  },
  async saveTemplate(t: ReminderTemplate): Promise<ReminderTemplate> {
    if (USE_MOCK) return mockApi.settings.saveTemplate(t);
    const { data } = await http().put("/settings/template", t);
    return data;
  },
  async getWhatsapp(): Promise<WhatsappConfig> {
    if (USE_MOCK) return mockApi.settings.getWhatsapp();
    const { data } = await http().get("/settings/whatsapp");
    return data;
  },
  async saveWhatsapp(c: WhatsappConfig): Promise<WhatsappConfig> {
    if (USE_MOCK) return mockApi.settings.saveWhatsapp(c);
    const { data } = await http().put("/settings/whatsapp", c);
    return data;
  },
};

export const api = {
  auth: authApi,
  patients: patientsApi,
  forms: formsApi,
  records: recordsApi,
  appointments: appointmentsApi,
  notifications: notificationsApi,
  settings: settingsApi,
};
