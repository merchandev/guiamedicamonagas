import { DocumentType } from '@prisma/client';

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  TITULO_MEDICO: 'Título de Médico Cirujano (sellado por el Registro Principal)',
  REGISTRO_MPPS_SACS: 'Constancia de Registro de Título ante el MPPS (SACS)',
  ARTICULO_8: 'Constancia de Cumplimiento del Artículo 8 (servicio rural / internado)',
  MATRICULA_COLEGIO_MONAGAS: 'N° de Matrícula — Colegio de Médicos del Estado Monagas',
  INPREMEDICO: 'Registro complementario (histórico)',
  SOLVENCIA_DEONTOLOGICA: 'Solvencia Deontológica (ya no se exige)',
  TITULO_POSTGRADO: 'Título de Postgrado / Especialización',
  CREDENCIAL_ESPECIALIDAD: 'Credencial de Reconocimiento de Especialidad (Colegio de Médicos de Monagas)',
  CEDULA_IDENTIDAD: 'Cédula de Identidad laminada vigente',
  RIF: 'RIF actualizado',
};

/**
 * Naturaleza de cada requisito. No todo lo que pide la plataforma es
 * "obligatorio por ley": se distingue lo legal de lo gremial, lo fiscal y lo
 * que es política interna de verificación de Guía Médica Monagas.
 */
export type DocumentCategory =
  | 'LEGAL'
  | 'HABILITACION'
  | 'ESPECIALIDAD'
  | 'GREMIAL'
  | 'IDENTIDAD'
  | 'FISCAL'
  | 'COMPLEMENTARIO';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  LEGAL: 'Requisito legal (Ley de Ejercicio de la Medicina)',
  HABILITACION: 'Habilitación profesional',
  ESPECIALIDAD: 'Especialidad',
  GREMIAL: 'Requisito gremial (Colegio de Médicos)',
  IDENTIDAD: 'Identidad',
  FISCAL: 'Fiscal / comercial',
  COMPLEMENTARIO: 'Complementario (opcional)',
};

export const DOCUMENT_CATEGORY: Record<DocumentType, DocumentCategory> = {
  TITULO_MEDICO: 'LEGAL',
  REGISTRO_MPPS_SACS: 'HABILITACION',
  ARTICULO_8: 'LEGAL',
  MATRICULA_COLEGIO_MONAGAS: 'HABILITACION',
  INPREMEDICO: 'COMPLEMENTARIO',
  SOLVENCIA_DEONTOLOGICA: 'GREMIAL',
  TITULO_POSTGRADO: 'ESPECIALIDAD',
  CREDENCIAL_ESPECIALIDAD: 'ESPECIALIDAD',
  CEDULA_IDENTIDAD: 'IDENTIDAD',
  RIF: 'FISCAL',
};

/** Documentos que la plataforma exige para verificar a cualquier médico general. */
export const BASE_REQUIRED_DOCUMENTS: DocumentType[] = [
  'TITULO_MEDICO',
  'REGISTRO_MPPS_SACS',
  'ARTICULO_8',
  'MATRICULA_COLEGIO_MONAGAS',
  'CEDULA_IDENTIDAD',
  'RIF',
];

/** Documentos adicionales exigidos cuando el profesional se promociona como especialista. */
export const SPECIALIST_REQUIRED_DOCUMENTS: DocumentType[] = [
  'TITULO_POSTGRADO',
  'CREDENCIAL_ESPECIALIDAD',
];

/** Documentos cuya vigencia debe renovarse periódicamente (hoy ninguno). */
export const EXPIRING_DOCUMENT_TYPES: DocumentType[] = [];

/**
 * Tipos que ya no se piden ni se aceptan. Se conservan en el enum solo para
 * los documentos que se hubieran subido antes.
 */
export const RETIRED_DOCUMENT_TYPES: DocumentType[] = ['SOLVENCIA_DEONTOLOGICA'];

export function requiredDocumentsFor(isSpecialist: boolean): DocumentType[] {
  return isSpecialist
    ? [...BASE_REQUIRED_DOCUMENTS, ...SPECIALIST_REQUIRED_DOCUMENTS]
    : BASE_REQUIRED_DOCUMENTS;
}
