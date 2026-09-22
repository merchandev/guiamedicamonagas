'use client';

import React from 'react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export default function TermsModal({ isOpen, onClose, onAccept }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4 py-6">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-full flex flex-col shadow-xl overflow-hidden relative">
        
        {/* Header */}
        <div className="px-6 py-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Condiciones de uso de Guía Médica Monagas</h2>
            <p className="text-gray-600 text-sm">
              Resumen claro de lo que acepta el médico al crear su cuenta en la plataforma.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-2 bg-gray-100 hover:bg-gray-200"
            aria-label="Cerrar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-6 py-4 flex-grow bg-gray-50/50 space-y-4">
          
          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-1">Herramienta tecnológica, no acto médico</h3>
            <p className="text-gray-600 text-sm">
              Guía Médica Monagas ayuda a conectar pacientes y profesionales, y a organizar su presencia digital. El diagnóstico, la indicación terapéutica y la responsabilidad médica corresponden siempre al profesional sanitario.
            </p>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Responsabilidad profesional y legal</h3>
            <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
              <li>El médico debe usar datos reales, actualizados y acordes con su habilitación legal para ejercer en Venezuela y en el estado Monagas.</li>
              <li>Debe cumplir con el Artículo 8 y estar debidamente inscrito en el MPPS, Colegio de Médicos y FMV.</li>
              <li>La cuenta es personal e intransferible.</li>
            </ul>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-1">Privacidad y datos de pacientes</h3>
            <p className="text-gray-600 text-sm">
              Los datos introducidos en la plataforma se usan para prestar el servicio y proteger la seguridad. El profesional se compromete a mantener la confidencialidad de los datos de contacto y consultas de los pacientes generados por la plataforma.
            </p>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-1">Verificación profesional y transparencia</h3>
            <p className="text-gray-600 text-sm">
              La plataforma exige y hará público de manera obligatoria el N° MPPS, N° Colegio de Médicos de Monagas, N° INPREMEDICO y credenciales de especialista para disuadir el ejercicio irregular y garantizar confianza a los pacientes.
            </p>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-1">Documentos completos</h3>
            <p className="text-gray-600 text-sm">
              Antes de aceptar puedes revisar los documentos principales: <a href="/terminos" className="text-blue-600 hover:underline font-medium">términos y condiciones</a>, <a href="/privacidad" className="text-blue-600 hover:underline font-medium">política de privacidad</a> y <a href="/responsabilidad" className="text-blue-600 hover:underline font-medium">responsabilidad profesional</a>.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white flex justify-end items-center gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium rounded-lg transition-colors text-sm"
          >
            Cancelar
          </button>
          <button 
            onClick={() => {
              onAccept();
              onClose();
            }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm shadow-sm"
          >
            Aceptar y Continuar
          </button>
        </div>

      </div>
    </div>
  );
}
