import { DocumentType } from '@prisma/client';

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  TITULO_MEDICO: 'Título de Médico Cirujano (sellado por el Registro Principal)',
  REGISTRO_MPPS_SACS: 'Constancia de Registro de Título ante el MPPS (SACS)',
  ARTICULO_8: 'Constancia de Cumplimiento del Artículo 8 (servicio rural / internado)',
  MATRICULA_COLEGIO_MONAGAS: 'N° de Matrícula — Colegio de Médicos del Estado Monagas',
  INPREMEDICO: 'Registro ante INPREMEDICO (FMV)',
  SOLVENCIA_DEONTOLOGICA: 'Solvencia Deontológica vigente — Colegio de Médicos de Monagas',
  TITULO_POSTGRADO: 'Título de Postgrado / Especialización',
  CREDENCIAL_ESPECIALIDAD: 'Credencial de Reconocimiento de Especialidad (Colegio de Médicos de Monagas)',
  CEDULA_IDENTIDAD: 'Cédula de Identidad laminada vigente',
  RIF: 'RIF actualizado',
};

/** Documentos obligatorios para cualquier médico general. */
export const BASE_REQUIRED_DOCUMENTS: DocumentType[] = [
  'TITULO_MEDICO',
  'REGISTRO_MPPS_SACS',
  'ARTICULO_8',
  'MATRICULA_COLEGIO_MONAGAS',
  'SOLVENCIA_DEONTOLOGICA',
  'CEDULA_IDENTIDAD',
  'RIF',
];

/** Documentos adicionales exigidos cuando el profesional se promociona como especialista. */
export const SPECIALIST_REQUIRED_DOCUMENTS: DocumentType[] = [
  'TITULO_POSTGRADO',
  'CREDENCIAL_ESPECIALIDAD',
];

/** Documentos cuya vigencia debe renovarse periódicamente. */
export const EXPIRING_DOCUMENT_TYPES: DocumentType[] = ['SOLVENCIA_DEONTOLOGICA'];

export function requiredDocumentsFor(isSpecialist: boolean): DocumentType[] {
  return isSpecialist
    ? [...BASE_REQUIRED_DOCUMENTS, ...SPECIALIST_REQUIRED_DOCUMENTS]
    : BASE_REQUIRED_DOCUMENTS;
}
