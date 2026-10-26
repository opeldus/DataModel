import type { FormatInfo, Kernmodell, Layout, ModelSummary, ValidationIssue } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Anfrage fehlgeschlagen (HTTP ${res.status}).`;
    let issues: ValidationIssue[] = [];
    try {
      const body = await res.json();
      message = body.message ?? message;
      issues = body.issues ?? [];
    } catch {
      /* Antwort ohne JSON-Body */
    }
    throw new ApiError(message, res.status, issues);
  }
  const type = res.headers.get('Content-Type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  listModels: () => request<ModelSummary[]>('/api/models'),
  getModel: (id: string) => request<Kernmodell>(`/api/models/${id}`),
  createModel: (model: unknown) =>
    request<Kernmodell>('/api/models', { method: 'POST', body: JSON.stringify(model) }),
  replaceModel: (id: string, model: unknown) =>
    request<Kernmodell>(`/api/models/${id}`, { method: 'PUT', body: JSON.stringify(model) }),
  validate: (model: unknown) =>
    request<ValidationIssue[]>('/api/validate', { method: 'POST', body: JSON.stringify(model) }),
  validation: (id: string) => request<ValidationIssue[]>(`/api/models/${id}/validation`),
  getLayout: (id: string) => request<Layout>(`/api/models/${id}/layout`),
  saveLayout: (id: string, layout: Layout) =>
    request<Layout>(`/api/models/${id}/layout`, { method: 'PUT', body: JSON.stringify(layout) }),
  formats: () => request<FormatInfo[]>('/api/formats'),
  exportModel: (id: string, format: string) => request<string>(`/api/models/${id}/export/${format}`),
};
