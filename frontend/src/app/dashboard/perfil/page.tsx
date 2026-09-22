'use client';

import React, { useState } from 'react';
import TermsModal from '@/components/TermsModal';

export default function EditProfileForm() {
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      setShowTerms(true);
      return;
    }
    alert("Perfil guardado con éxito.");
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Actualizar Perfil Profesional</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow-sm border">
        
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Información Básica</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nombres</label>
              <input type="text" className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Apellidos</label>
              <input type="text" className="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cédula de Identidad</label>
              <input type="text" className="w-full border rounded-lg p-2" placeholder="V-12345678" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">RIF</label>
              <input type="text" className="w-full border rounded-lg p-2" placeholder="J-12345678-9" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2 text-blue-800">Avales Nacionales y Gremiales (Monagas)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Según las normativas del MPPS y el Colegio de Médicos, estos datos son obligatorios para aparecer en el directorio.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">N° Registro MPPS (SACS)</label>
              <input type="text" className="w-full border rounded-lg p-2" placeholder="Ej. 12345" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">N° Matrícula Colegio de Médicos Monagas</label>
              <input type="text" className="w-full border rounded-lg p-2" placeholder="Ej. 5678" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">N° INPREMEDICO</label>
              <input type="text" className="w-full border rounded-lg p-2" placeholder="Ej. 987654" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Credencial de Reconocimiento de Especialidad</label>
              <input type="text" className="w-full border rounded-lg p-2" placeholder="Opcional si no es especialista" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-4">
          <input 
            type="checkbox" 
            id="terms" 
            checked={termsAccepted}
            onChange={() => setShowTerms(true)}
            className="w-4 h-4 text-blue-600"
          />
          <label htmlFor="terms" className="text-sm text-gray-700">
            He leído y acepto las <button type="button" onClick={() => setShowTerms(true)} className="text-blue-600 underline">Condiciones de Uso</button>.
          </label>
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors">
          Guardar y Enviar a Revisión
        </button>

      </form>

      <TermsModal 
        isOpen={showTerms} 
        onClose={() => setShowTerms(false)} 
        onAccept={() => setTermsAccepted(true)} 
      />
    </div>
  );
}
