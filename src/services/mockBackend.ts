/**
 * Local mock backend backed by localStorage. Used as a fallback when
 * VITE_API_URL is not configured, so the UI works for development/preview
 * without a real backend.
 *
 * In production, set VITE_API_URL and this file is bypassed entirely.
 */
import type {
  Appointment,
  ClinicalRecord,
  Patient,
  Question,
  ReminderTemplate,
  ResponseEntry,
  User,
  WhatsappConfig,
} from "@/types";
import { addDays, differenceInCalendarDays, formatISO } from "date-fns";

const K = {
  users: "mh.users",
  session: "mh.session",
  patients: "mh.patients",
  questions: "mh.questions",
  responses: "mh.responses",
  records: "mh.records",
  appointments: "mh.appointments",
  template: "mh.template",
  whatsapp: "mh.whatsapp",
  seeded: "mh.seeded",
};

const uid = () => Math.random().toString(36).slice(2, 11);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function generateAppointments(patientId: string, startDate: string): Appointment[] {
  const start = new Date(startDate);
  const out: Appointment[] = [];
  // Psychiatrist start + end
  out.push({ id: uid(), patientId, type: "psychiatrist", scheduledDate: formatISO(start), status: "pending", label: "Consulta inicial — Psiquiatra" });
  out.push({ id: uid(), patientId, type: "psychiatrist", scheduledDate: formatISO(addDays(start, 29)), status: "pending", label: "Consulta final — Psiquiatra" });
  // Weekly psychologist sessions (50min) - weeks 1..4
  for (let w = 0; w < 4; w++) {
    out.push({ id: uid(), patientId, type: "psychologist", scheduledDate: formatISO(addDays(start, w * 7 + 2)), status: "pending", label: `Sessão psicológica — Semana ${w + 1}` });
  }
  // Check-ins: 3 / 2 / 1 / 0
  const checkinsPerWeek = [3, 2, 1, 0];
  checkinsPerWeek.forEach((count, w) => {
    for (let i = 0; i < count; i++) {
      const offset = w * 7 + Math.floor((i + 1) * (7 / (count + 1)));
      out.push({ id: uid(), patientId, type: "checkin", scheduledDate: formatISO(addDays(start, offset)), status: "pending", label: `Check-in — Semana ${w + 1} (#${i + 1})` });
    }
  });
  return out.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

function seed() {
  if (read<boolean>(K.seeded, false)) return;

  const users: Array<User & { password: string }> = [
    { id: "u_admin", name: "Dra. Marina Costa", email: "admin@clinica.com", role: "admin", password: "admin123" },
    { id: "u_psy", name: "Dr. Rafael Lima", email: "psicologo@clinica.com", role: "psychologist", password: "senha123" },
    { id: "u_psi", name: "Dr. Henrique Alves", email: "psiquiatra@clinica.com", role: "psychiatrist", password: "senha123" },
  ];
  write(K.users, users);

  const questions: Question[] = [
    { id: "q1", text: "Como você dormiu na última noite?", order: 0 },
    { id: "q2", text: "Houve pico de ansiedade ontem?", order: 1 },
    { id: "q3", text: "Como está seu nível de energia hoje?", order: 2 },
    { id: "q4", text: "Como foi sua alimentação?", order: 3 },
    { id: "q5", text: "Como você avalia seu humor geral?", order: 4 },
  ];
  write(K.questions, questions);

  const today = new Date();
  const patients: Patient[] = [
    { id: "p1", name: "Ana Silva", email: "ana@email.com", whatsapp: "+5511999990001", startDate: formatISO(addDays(today, -10)), responsibleId: "u_psy", status: "active", publicToken: uid() + uid() },
    { id: "p2", name: "Bruno Carvalho", email: "bruno@email.com", whatsapp: "+5511999990002", startDate: formatISO(addDays(today, -4)), responsibleId: "u_psy", status: "active", publicToken: uid() + uid() },
    { id: "p3", name: "Camila Rocha", email: "camila@email.com", whatsapp: "+5511999990003", startDate: formatISO(addDays(today, -20)), responsibleId: "u_psi", status: "active", publicToken: uid() + uid() },
    { id: "p4", name: "Diego Martins", email: "diego@email.com", whatsapp: "+5511999990004", startDate: formatISO(addDays(today, -35)), responsibleId: "u_psy", status: "completed", publicToken: uid() + uid() },
  ];
  write(K.patients, patients);

  const appointments: Appointment[] = patients.flatMap((p) => generateAppointments(p.id, p.startDate));
  write(K.appointments, appointments);

  // Generate fake responses
  const responses: ResponseEntry[] = [];
  patients.filter((p) => p.status === "active").forEach((p) => {
    const start = new Date(p.startDate);
    const daysElapsed = Math.min(30, Math.max(0, differenceInCalendarDays(today, start) + 1));
    for (let d = 1; d <= daysElapsed - 1; d++) {
      // skip last 2 days for one patient to demonstrate "no response"
      if (p.id === "p2" && d > daysElapsed - 3) continue;
      const date = addDays(start, d - 1);
      const base = p.id === "p1" ? 2.0 : p.id === "p3" ? 3.0 : 4.0;
      responses.push({
        id: uid(),
        patientId: p.id,
        date: formatISO(date, { representation: "date" }),
        programDay: d,
        answers: questions.map((q) => ({
          questionId: q.id,
          value: Math.max(1, Math.min(5, Math.round(base + (Math.random() - 0.5) * 2))),
          note: Math.random() > 0.7 ? "Dia mais difícil que o normal." : undefined,
        })),
        createdAt: formatISO(date),
      });
    }
  });
  write(K.responses, responses);

  const records: ClinicalRecord[] = [
    { id: uid(), patientId: "p1", authorId: "u_psy", authorName: "Dr. Rafael Lima", content: "<p>Primeira sessão: paciente relata <strong>dificuldades de sono</strong> e ansiedade matinal. Iniciamos técnicas de respiração.</p>", createdAt: formatISO(addDays(today, -8)) },
  ];
  write(K.records, records);

  write<ReminderTemplate>(K.template, { body: "Olá [nome], notamos que você não preencheu seu diário nos últimos dias. Que tal dedicar 2 minutinhos agora? [link]" });
  write<WhatsappConfig>(K.whatsapp, { apiKey: "", phoneNumberId: "" });

  write(K.seeded, true);
}

if (typeof window !== "undefined") seed();

const delay = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 120));

export const mockApi = {
  auth: {
    async login(email: string, password: string) {
      const users = read<Array<User & { password: string }>>(K.users, []);
      const u = users.find((x) => x.email === email && x.password === password);
      if (!u) throw new Error("Credenciais inválidas");
      const { password: _p, ...safe } = u;
      const token = "mock." + btoa(safe.id);
      write(K.session, { token, user: safe });
      return delay({ token, user: safe });
    },
    async me() {
      const session = read<{ token: string; user: User } | null>(K.session, null);
      if (!session) throw new Error("Não autenticado");
      return delay(session.user);
    },
    async logout() {
      localStorage.removeItem(K.session);
      return delay(true);
    },
    async listUsers() {
      const users = read<Array<User & { password: string }>>(K.users, []);
      return delay(users.map(({ password: _p, ...u }) => u));
    },
    async createUser(u: Omit<User, "id"> & { password: string }) {
      const users = read<Array<User & { password: string }>>(K.users, []);
      const newU = { ...u, id: "u_" + uid() };
      users.push(newU);
      write(K.users, users);
      const { password: _p, ...safe } = newU;
      return delay(safe);
    },
    async deleteUser(id: string) {
      const users = read<Array<User & { password: string }>>(K.users, []);
      write(K.users, users.filter((u) => u.id !== id));
      return delay(true);
    },
  },
  patients: {
    async list() { return delay(read<Patient[]>(K.patients, [])); },
    async get(id: string) {
      const p = read<Patient[]>(K.patients, []).find((x) => x.id === id);
      if (!p) throw new Error("Paciente não encontrado");
      return delay(p);
    },
    async getByToken(token: string) {
      const p = read<Patient[]>(K.patients, []).find((x) => x.publicToken === token);
      if (!p) throw new Error("Link inválido");
      return delay(p);
    },
    async create(input: Omit<Patient, "id" | "publicToken">) {
      const patients = read<Patient[]>(K.patients, []);
      const newP: Patient = { ...input, id: "p_" + uid(), publicToken: uid() + uid() };
      patients.push(newP);
      write(K.patients, patients);
      const appts = read<Appointment[]>(K.appointments, []);
      write(K.appointments, [...appts, ...generateAppointments(newP.id, newP.startDate)]);
      return delay(newP);
    },
    async update(id: string, patch: Partial<Patient>) {
      const patients = read<Patient[]>(K.patients, []);
      const idx = patients.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error("Paciente não encontrado");
      patients[idx] = { ...patients[idx], ...patch };
      write(K.patients, patients);
      return delay(patients[idx]);
    },
    async remove(id: string) {
      write(K.patients, read<Patient[]>(K.patients, []).filter((p) => p.id !== id));
      return delay(true);
    },
  },
  forms: {
    async getQuestions() { return delay(read<Question[]>(K.questions, []).sort((a, b) => a.order - b.order)); },
    async saveQuestions(qs: Question[]) { write(K.questions, qs); return delay(qs); },
    async saveResponse(entry: Omit<ResponseEntry, "id" | "createdAt">) {
      const all = read<ResponseEntry[]>(K.responses, []);
      const created: ResponseEntry = { ...entry, id: uid(), createdAt: new Date().toISOString() };
      all.push(created);
      write(K.responses, all);
      return delay(created);
    },
    async getResponses(patientId: string) {
      return delay(read<ResponseEntry[]>(K.responses, []).filter((r) => r.patientId === patientId).sort((a, b) => a.programDay - b.programDay));
    },
    async getAllResponses() { return delay(read<ResponseEntry[]>(K.responses, [])); },
  },
  records: {
    async list(patientId: string) {
      return delay(read<ClinicalRecord[]>(K.records, []).filter((r) => r.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async create(input: Omit<ClinicalRecord, "id" | "createdAt">) {
      const all = read<ClinicalRecord[]>(K.records, []);
      const created: ClinicalRecord = { ...input, id: uid(), createdAt: new Date().toISOString() };
      all.push(created);
      write(K.records, all);
      return delay(created);
    },
  },
  appointments: {
    async list(patientId: string) {
      return delay(read<Appointment[]>(K.appointments, []).filter((a) => a.patientId === patientId).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
    },
    async updateStatus(id: string, status: Appointment["status"]) {
      const all = read<Appointment[]>(K.appointments, []);
      const idx = all.findIndex((a) => a.id === id);
      if (idx < 0) throw new Error("Não encontrado");
      all[idx].status = status;
      write(K.appointments, all);
      return delay(all[idx]);
    },
  },
  notifications: {
    async sendReminder(patientId: string, _channel: "whatsapp" = "whatsapp") {
      return delay({ ok: true, patientId, sentAt: new Date().toISOString() });
    },
  },
  settings: {
    async getTemplate() { return delay(read<ReminderTemplate>(K.template, { body: "" })); },
    async saveTemplate(t: ReminderTemplate) { write(K.template, t); return delay(t); },
    async getWhatsapp() { return delay(read<WhatsappConfig>(K.whatsapp, { apiKey: "", phoneNumberId: "" })); },
    async saveWhatsapp(c: WhatsappConfig) { write(K.whatsapp, c); return delay(c); },
  },
};
